import { getSettings, countLeads, upsertLead, addSignal, clearSignalsForLead, addCredits, setLeadCredits, type Settings } from "../store.js";
import { loadTargets, isExcluded } from "../targets.js";
import { SOURCES, sourcesToRun } from "../sources/index.js";
import type { Source, SourceContext, SourceResult, RawSignal, Target } from "../sources/types.js";
import { rankDomain } from "../scoring.js";
import { dedupeSignals, groupByDomain } from "./dedupe.js";
import { fitCheck } from "./fit.js";
import { enrichLead } from "./enrich.js";
import { shortDate } from "../util.js";

const FREE_SAMPLE = 10;

export interface PipelineOptions {
  limit?: number;
  targets?: Target[];
  sources?: string[];
  roles?: string[];
  days?: number;
}

export interface PipelineResult {
  scannedTargets: number;
  sources: Array<{ name: string; label: string; enabled: boolean; ok: boolean; candidates: number; error?: string; note?: string }>;
  candidates: number;
  deduped: number;
  fitChecked: number;
  fitPassed: number;
  enriched: number;
  leadsCreated: number;
  leadsUpdated: number;
  creditsSpent: number;
  freeRemaining: number;
  top: Array<{ company: string; domain: string; score: number; signal: string; reason: string; source: string | null; fit: string; confidence: number }>;
  note?: string;
}

function pickSources(settings: Settings, override?: string[]): Source[] {
  if (override && override.length) {
    const wanted = new Set(override);
    return SOURCES.filter((s) => wanted.has(s.name));
  }
  return sourcesToRun(settings);
}

export async function runPipeline(accountId: number, opts: PipelineOptions = {}): Promise<PipelineResult> {
  const settings = getSettings(accountId);
  const targets = loadTargets(settings, opts.targets).filter((t) => !isExcluded(settings, t));
  const sources = pickSources(settings, opts.sources);
  const roles = opts.roles && opts.roles.length ? opts.roles : settings.roles;
  const limit = Math.min(Math.max(opts.limit ?? targets.length, 1), 200);

  if (!targets.length) {
    return {
      scannedTargets: 0,
      sources: [],
      candidates: 0,
      deduped: 0,
      fitChecked: 0,
      fitPassed: 0,
      enriched: 0,
      leadsCreated: 0,
      leadsUpdated: 0,
      creditsSpent: 0,
      freeRemaining: Math.max(FREE_SAMPLE - countLeads(accountId), 0),
      top: [],
      note: "No target companies. Add data/targets.csv (company,domain,country) or pass targets.",
    };
  }

  const chosen = targets.slice(0, limit);
  const ctx: SourceContext = { settings, targets: chosen, roles, limit };
  const sourceResults: SourceResult[] = [];
  for (const source of sources) {
    try {
      sourceResults.push(await source.run(ctx));
    } catch (err) {
      sourceResults.push({ source: source.name, label: source.label, enabled: true, ok: false, candidates: [], error: (err as Error).message });
    }
  }

  const all = sourceResults.flatMap((r) => r.candidates).filter((c) => c.signal !== "risk" && c.signal !== "news_other");
  const deduped = dedupeSignals(all);
  const byDomain = groupByDomain(deduped);

  const deliveredBefore = countLeads(accountId);
  let leadsCreated = 0;
  let leadsUpdated = 0;
  let creditsSpent = 0;
  let fitChecked = 0;
  let fitPassed = 0;
  let enriched = 0;
  const top: PipelineResult["top"] = [];

  for (const [domain, signals] of byDomain) {
    const company = signals[0].company || domain;
    const fit = await fitCheck(settings, company, domain, signals);
    fitChecked++;
    if (fit.decided && !fit.fit && fit.confidence >= 0.6) continue;
    fitPassed++;

    const ranked = rankDomain(company, domain, signals, new Date());
    if (!ranked.top || ranked.score <= 0) continue;

    const enrich = await enrichLead(settings, company, domain, ranked.top.label);
    enriched++;

    const live = ranked.signals.filter((s) => s.points > 0 && s.signal !== "risk" && s.signal !== "news_other");
    const reason = live
      .slice(0, 3)
      .map((s) => `${s.label} (${shortDate(s.date)})`)
      .join("; ");

    const res = upsertLead({
      accountId,
      company,
      domain,
      source: ranked.top.source ?? signals[0].source,
      linkedin: enrich.linkedin,
      email: enrich.email,
      phone: enrich.phone,
      signal: ranked.top.signal,
      signalLabel: ranked.top.label,
      signalDate: ranked.top.date,
      signalAgeDays: ranked.top.age,
      sourceUrl: ranked.top.source_url ?? null,
      reason,
      score: ranked.score,
      confidence: fit.confidence,
      fit: fit.decided ? (fit.fit ? "fit" : "not_fit") : "unknown",
      fitReason: fit.reason,
    });

    clearSignalsForLead(res.lead.id);
    for (const s of ranked.signals) {
      addSignal(accountId, res.lead.id, domain, {
        source: s.source,
        type: s.signal,
        label: s.label,
        date: s.date,
        sourceUrl: s.source_url,
        detail: s.detail ? JSON.stringify(s.detail) : undefined,
        points: s.points,
      });
    }

    if (res.created) {
      const position = deliveredBefore + leadsCreated + 1;
      if (position > FREE_SAMPLE) {
        addCredits(accountId, -1, `lead ${domain}`);
        setLeadCredits(res.lead.id, 1);
        creditsSpent++;
      }
      leadsCreated++;
    } else {
      leadsUpdated++;
    }

    top.push({
      company,
      domain,
      score: ranked.score,
      signal: ranked.top.label,
      reason,
      source: ranked.top.source ?? null,
      fit: fit.decided ? (fit.fit ? "fit" : "not_fit") : "unknown",
      confidence: Math.round(fit.confidence * 100) / 100,
    });
  }

  top.sort((a, b) => b.score - a.score);

  return {
    scannedTargets: chosen.length,
    sources: sourceResults.map((r) => ({
      name: r.source,
      label: r.label,
      enabled: r.enabled,
      ok: r.ok,
      candidates: r.candidates.length,
      error: r.error,
      note: r.note,
    })),
    candidates: all.length,
    deduped: deduped.length,
    fitChecked,
    fitPassed,
    enriched,
    leadsCreated,
    leadsUpdated,
    creditsSpent,
    freeRemaining: Math.max(FREE_SAMPLE - (deliveredBefore + leadsCreated), 0),
    top: top.slice(0, 12),
    note: deduped.length === 0 ? "Sources ran but found no fresh signals in the last 90 days." : undefined,
  };
}

import { config } from "../config.js";
import { callLlm, extractJson } from "../llm.js";
import type { Settings } from "../store.js";
import type { RawSignal } from "../sources/types.js";

export interface FitResult {
  fit: boolean;
  confidence: number;
  reason: string;
  decided: boolean;
}

function keywords(settings: Settings): string[] {
  const base = `${settings.offer} ${settings.buyers.join(" ")} ${settings.roles.join(" ")}`.toLowerCase();
  return Array.from(new Set(base.split(/[^a-z0-9+.#-]+/).filter((w) => w.length >= 4)));
}

export async function fitCheck(settings: Settings, company: string, domain: string, signals: RawSignal[]): Promise<FitResult> {
  const summaries = signals
    .slice(0, 8)
    .map((s) => `- [${s.signal}] ${s.summary} (${s.date})`)
    .join("\n");

  if (config.llm.enabled) {
    const prompt = `You are qualifying a B2B account for outbound. Decide whether this company is a plausible buyer of the seller's offer, based ONLY on the signals below.

SELLER OFFER: ${settings.offer}
SELLER BUYERS: ${settings.buyers.join("; ")}
ROLE KEYWORDS: ${settings.roles.join(", ")}

ACCOUNT: ${company} (${domain})
SIGNALS:
${summaries}

Return STRICT JSON: {"fit": true|false, "confidence": 0-1, "reason": "one short sentence naming the signal that drives the decision"}`;
    const res = await callLlm(
      [
        { role: "system", content: "You output only valid JSON. Be strict: a signal must actually relate to the offer." },
        { role: "user", content: prompt },
      ],
      { json: true, maxTokens: 300 }
    );
    if (res.ok) {
      const parsed = extractJson<{ fit?: boolean; confidence?: number; reason?: string }>(res.text);
      if (parsed && typeof parsed.fit === "boolean") {
        return {
          fit: parsed.fit,
          confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? (parsed.fit ? 0.75 : 0.25)))),
          reason: parsed.reason || (parsed.fit ? "LLM judged it a fit." : "LLM judged it not a fit."),
          decided: true,
        };
      }
    }
  }

  const kws = keywords(settings);
  const text = summaries.toLowerCase();
  const hits = kws.filter((k) => text.includes(k)).length;
  const fit = hits > 0;
  return {
    fit,
    confidence: Math.min(0.3 + hits * 0.1, 0.7),
    reason: fit
      ? `Heuristic: ${hits} brief keyword(s) appear in the signals. Add an LLM key for a real fit check.`
      : "Heuristic: no clear overlap with your brief. Add an LLM key for a real fit check.",
    decided: false,
  };
}

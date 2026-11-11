export interface SignalTypeConfig {
  label: string;
  weight: number;
  half_life_days?: number;
  max_age_days?: number;
  decay?: boolean;
  future_ok?: boolean;
}

// Mirrors vendor/buying-signal-scan/scripts/weights.json (MIT, Ekos Labs).
export const SIGNAL_TYPES: Record<string, SignalTypeConfig> = {
  role_hiring: { label: "Hiring for a relevant role", weight: 3, half_life_days: 21, max_age_days: 90 },
  hiring_volume: { label: "Many open roles", weight: 2, half_life_days: 21, max_age_days: 60 },
  new_leadership: { label: "New leadership", weight: 3, half_life_days: 42, max_age_days: 180 },
  relaunch: { label: "Website relaunch or new shop", weight: 2, half_life_days: 21, max_age_days: 120 },
  outdated_stack: { label: "Outdated tech stack", weight: 1, decay: false },
  funding_growth: { label: "Funding, acquisition or new location", weight: 3, half_life_days: 21, max_age_days: 120 },
  ad_activity: { label: "Ad activity change", weight: 1, half_life_days: 21, max_age_days: 60 },
  trade_fair: { label: "Trade fair presence", weight: 2, half_life_days: 21, max_age_days: 90, future_ok: true },
  reviews: { label: "Bad or falling reviews", weight: 1, half_life_days: 21, max_age_days: 90 },
  problem_post: { label: "Posting about the problem you solve", weight: 3, half_life_days: 14, max_age_days: 60 },
  switching_intent: { label: "Asking for recommendations or switching", weight: 3, half_life_days: 14, max_age_days: 60 },
  social_mention: { label: "Mentioned in a relevant discussion", weight: 1, half_life_days: 14, max_age_days: 60 },
  review_signal: { label: "Bad or falling reviews", weight: 2, half_life_days: 21, max_age_days: 90 },
  local_business: { label: "New or growing local business", weight: 2, half_life_days: 21, max_age_days: 90 },
  risk: { label: "Warning", weight: 0, half_life_days: 21, max_age_days: 180 },
  news_other: { label: "Other news", weight: 0, half_life_days: 21, max_age_days: 90 },
};

export const STRENGTH: Record<string, number> = { strong: 1.5, normal: 1.0, weak: 0.5 };
export const REPEAT_FACTOR = 0.5;
export const TYPE_CAP_MULTIPLE = 2.0;

export interface Candidate {
  id?: string;
  company: string;
  domain: string;
  signal: string;
  date: string;
  source?: string;
  source_url?: string;
  summary?: string;
  detail?: Record<string, unknown>;
  strength?: string;
  label?: string;
}

export function typeConfig(type: string): SignalTypeConfig {
  return SIGNAL_TYPES[type] || { label: type, weight: 0, half_life_days: 21, max_age_days: 90 };
}

export function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value.length <= 10 ? `${value}T00:00:00Z` : value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function daysBetween(asOf: Date, then: Date): number {
  return Math.floor((asOf.getTime() - then.getTime()) / 86_400_000);
}

export function points(sig: Candidate, asOf: Date): { points: number; age: number | null } {
  const cfg = typeConfig(sig.signal);
  const mult = STRENGTH[sig.strength || "normal"] ?? 1.0;
  if (cfg.decay === false) return { points: cfg.weight * mult, age: null };
  const d = parseDate(sig.date);
  if (!d) return { points: 0, age: null };
  const age = Math.max(daysBetween(asOf, d), 0);
  const maxAge = cfg.max_age_days ?? 90;
  if (!cfg.future_ok && age > maxAge) return { points: 0, age };
  return { points: cfg.weight * mult * Math.pow(0.5, age / (cfg.half_life_days ?? 21)), age };
}

export interface RankedSignal extends Candidate {
  points: number;
  age: number | null;
  label: string;
}

export interface RankedDomain {
  company: string;
  domain: string;
  score: number;
  top: RankedSignal | null;
  signals: RankedSignal[];
}

export function rankDomain(company: string, domain: string, signals: Candidate[], asOf: Date): RankedDomain {
  const scored: RankedSignal[] = signals.map((s) => {
    const p = points(s, asOf);
    const cfg = typeConfig(s.signal);
    return { ...s, points: p.points, age: p.age, label: (s.label || s.summary || cfg.label).toString() };
  });
  scored.sort((a, b) => b.points - a.points);

  const byType = new Map<string, number>();
  let total = 0;
  for (const s of scored) {
    const cfg = typeConfig(s.signal);
    const cap = cfg.weight * TYPE_CAP_MULTIPLE;
    const used = byType.get(s.signal) || 0;
    let add = used === 0 ? s.points : s.points * REPEAT_FACTOR;
    add = Math.min(add, Math.max(cap - used, 0));
    byType.set(s.signal, used + add);
    total += add;
  }

  const live = scored.filter((s) => s.points > 0 && s.signal !== "risk" && s.signal !== "news_other");
  const sources = new Set(live.map((s) => s.source).filter(Boolean));
  const diversityBonus = Math.min(Math.max(sources.size - 1, 0) * 0.3, 1.0);
  total += diversityBonus;
  return { company, domain, score: Math.round(total * 10) / 10, top: live[0] || null, signals: scored };
}

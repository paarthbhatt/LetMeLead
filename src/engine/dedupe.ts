import type { Settings } from "../store.js";
import type { RawSignal } from "../sources/types.js";

export function normalizeDate(d: string | undefined): string {
  return (d || "").slice(0, 10);
}

export function dedupeSignals(signals: RawSignal[]): RawSignal[] {
  const seen = new Set<string>();
  const out: RawSignal[] = [];
  for (const s of signals) {
    const key = `${s.domain}|${s.signal}|${normalizeDate(s.date)}|${(s.summary || "").slice(0, 60).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

export function groupByDomain(signals: RawSignal[]): Map<string, RawSignal[]> {
  const map = new Map<string, RawSignal[]>();
  for (const s of signals) {
    const list = map.get(s.domain) || [];
    list.push(s);
    map.set(s.domain, list);
  }
  return map;
}

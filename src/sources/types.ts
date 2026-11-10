import type { Settings } from "../store.js";

export interface Target {
  company: string;
  domain: string;
  country?: string;
  employer?: string;
  news_query?: string;
  careers_url?: string;
}

export interface RawSignal {
  company: string;
  domain: string;
  signal: string;
  date: string;
  source: string;
  source_url?: string;
  summary: string;
  detail?: Record<string, unknown>;
}

export interface SourceResult {
  source: string;
  label: string;
  enabled: boolean;
  ok: boolean;
  candidates: RawSignal[];
  error?: string;
  note?: string;
}

export interface SourceContext {
  settings: Settings;
  targets: Target[];
  roles: string[];
  limit: number;
}

export interface Source {
  name: string;
  label: string;
  requires: string;
  enabled(ctx: SourceContext): boolean;
  run(ctx: SourceContext): Promise<SourceResult>;
}

export function emptyResult(source: Source, enabled: boolean, note?: string): SourceResult {
  return { source: source.name, label: source.label, enabled, ok: true, candidates: [], note };
}

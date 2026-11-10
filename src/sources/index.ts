import type { Settings } from "../store.js";
import { publicScanSource } from "./publicScan.js";
import { redditSource } from "./reddit.js";
import { xSource, mapsSource, facebookSource, reviewsSource } from "./providers.js";
import type { Source, SourceContext } from "./types.js";

export const SOURCES: Source[] = [publicScanSource, redditSource, xSource, mapsSource, facebookSource, reviewsSource];

const dummyCtx = { settings: {} as Settings, targets: [], roles: [], limit: 0 } as SourceContext;

export function selectedSourceNames(settings: Settings): Set<string> {
  if (settings.sources && settings.sources.length) return new Set(settings.sources);
  return new Set(SOURCES.map((s) => s.name));
}

export function sourcesToRun(settings: Settings): Source[] {
  const selected = selectedSourceNames(settings);
  return SOURCES.filter((s) => selected.has(s.name) && s.enabled(dummyCtx));
}

export function sourceStatus(settings: Settings) {
  const selected = selectedSourceNames(settings);
  return SOURCES.map((s) => ({
    name: s.name,
    label: s.label,
    requires: s.requires,
    selected: selected.has(s.name),
    available: s.enabled(dummyCtx),
  }));
}

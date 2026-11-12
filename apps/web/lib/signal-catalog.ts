import type { SignalCatalog, SignalCategory, SignalDef, SignalStatus, Source } from "./api";

export type SignalView = "yours" | "catalog";
export type SignalFilterStatus = "all" | "enabled" | "disabled" | SignalStatus;
export type SourceLoadState = "loading" | "error" | "ready";

export const PLANNED_SIGNAL_COPY =
  "Planned catalog entry. No automated detection or research service is available for this signal.";

const SOURCE_LABELS: Record<string, string> = {
  news: "Company news",
  job_board: "Company job boards",
  reddit: "Reddit",
  x: "X",
  google_maps: "Google Maps",
  facebook: "Facebook pages",
  reviews: "Review feeds",
};

export function sourceLabel(kind: string): string {
  return SOURCE_LABELS[kind] ?? kind.replace(/_/g, " ");
}

export function isSignalAutomated(signal: SignalDef): boolean {
  return signal.status !== "by_hand" && signal.automatic && signal.adapters.length > 0;
}

export function signalStatusLabel(signal: SignalDef): string {
  if (!isSignalAutomated(signal)) return "Not automated";
  return signal.status === "live" ? "Live" : "Partly live";
}

export function signalHowItWorks(signal: SignalDef): string {
  if (!isSignalAutomated(signal)) return PLANNED_SIGNAL_COPY;
  // The API still contains historical manual-service copy. It is not an offer.
  return signal.how_it_works
    .replace(/everything else in this category stays by hand\.?/gi, "Other entries in this category are not automated.")
    .replace(/we research it by hand when you order leads on it\.?/gi, "No research service is available for this signal.")
    .replace(/\bby hand\b/gi, "not automated");
}

export function signalCounts(categories: SignalCategory[]) {
  const signals = categories.flatMap((category) => category.signals);
  return {
    total: signals.length,
    enabled: signals.filter((signal) => signal.enabled).length,
    sourceBacked: signals.filter(isSignalAutomated).length,
    planned: signals.filter((signal) => !isSignalAutomated(signal)).length,
    live: signals.filter((signal) => isSignalAutomated(signal) && signal.status === "live").length,
    partlyLive: signals.filter((signal) => isSignalAutomated(signal) && signal.status === "partly_live").length,
  };
}

export function filterSignalCategories(
  categories: SignalCategory[],
  filters: { view: SignalView; search: string; category: string; status: SignalFilterStatus },
): SignalCategory[] {
  const terms = filters.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return categories
    .filter((category) => filters.category === "all" || category.id === filters.category)
    .map((category) => ({
      ...category,
      signals: category.signals.filter((signal) => {
        if (filters.view === "yours" && !signal.enabled) return false;
        if (filters.status === "enabled" && !signal.enabled) return false;
        if (filters.status === "disabled" && signal.enabled) return false;
        if (filters.status === "by_hand" && isSignalAutomated(signal)) return false;
        if ((filters.status === "live" || filters.status === "partly_live") &&
          (!isSignalAutomated(signal) || signal.status !== filters.status)) return false;

        const searchable = [
          signal.label,
          signal.description,
          signal.why_now,
          signalHowItWorks(signal),
          category.label,
          signalStatusLabel(signal),
          ...signal.adapters.map(sourceLabel),
        ].join(" ").toLowerCase();
        return terms.every((term) => searchable.includes(term));
      }),
    }))
    .filter((category) => category.signals.length > 0);
}

export function applySignalToggle(
  catalog: SignalCatalog,
  choice: { id: string; enabled: boolean },
): SignalCatalog {
  return {
    ...catalog,
    categories: catalog.categories.map((category) => ({
      ...category,
      signals: category.signals.map((signal) => signal.id === choice.id ? { ...signal, enabled: choice.enabled } : signal),
    })),
  };
}

/** Empty lists must never reach /scan: the API treats them as "all enabled sources". */
export function signalSearchSources(signals: SignalDef[], sources: Source[] | undefined): string[] {
  const wanted = new Set(
    signals.filter((signal) => signal.enabled && isSignalAutomated(signal)).flatMap((signal) => signal.adapters),
  );
  return [...new Set((sources ?? []).filter((source) => source.enabled && wanted.has(source.kind)).map((source) => source.kind))];
}

export function sourceStatus(source: Source | undefined, state: SourceLoadState = "ready"): {
  label: string;
  tone: "success" | "warning" | "danger" | "muted";
  needsAttention: boolean;
} {
  if (state === "loading") return { label: "Checking status", tone: "muted", needsAttention: false };
  if (state === "error") return { label: "Status unknown", tone: "warning", needsAttention: false };
  if (!source) return { label: "Not set up", tone: "warning", needsAttention: true };
  if (!source.enabled) return { label: "Off", tone: "muted", needsAttention: false };
  if (source.last_status === "unconfigured") return { label: "Needs setup", tone: "warning", needsAttention: true };
  if (source.last_status === "blocked") return { label: "Blocked", tone: "warning", needsAttention: true };
  if (source.last_status === "error" || source.last_error) return { label: "Scan error", tone: "danger", needsAttention: true };
  if (source.last_status === "ok") return { label: "Last scan OK", tone: "success", needsAttention: false };
  return { label: source.last_status ? "Status unknown" : "Not checked", tone: "muted", needsAttention: false };
}

export function signalErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "code" in error && error.code === "not_automatic") {
    return PLANNED_SIGNAL_COPY;
  }
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

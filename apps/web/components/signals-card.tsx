"use client";

import { ChevronDown, Clock3, Loader2, Network, Radio } from "lucide-react";

import { Badge, Button, Card } from "@/components/ui";
import type { SignalDef, Source } from "@/lib/api";
import {
  isSignalAutomated,
  PLANNED_SIGNAL_COPY,
  signalHowItWorks,
  signalSearchSources,
  signalStatusLabel,
  sourceLabel,
  sourceStatus,
  type SourceLoadState,
} from "@/lib/signal-catalog";
import { cn } from "@/lib/utils";

export function SignalCapabilityBadge({ signal }: { signal: SignalDef }) {
  const automated = isSignalAutomated(signal);
  return (
    <Badge
      tone={automated && signal.status === "live" ? "success" : "muted"}
      className={automated && signal.status === "partly_live" ? "border-transparent bg-blue-500/10 text-blue-700 dark:text-blue-300" : undefined}
    >
      <span className={cn("mr-1.5 size-1 rounded-full", automated ? "bg-current" : "border border-current")} aria-hidden />
      {signalStatusLabel(signal)}
    </Badge>
  );
}

export function SignalsCard({
  signal,
  sources,
  sourceState,
  controlsDisabled,
  togglePending,
  searchDisabled,
  searchPending,
  onToggle,
  onSearch,
}: {
  signal: SignalDef;
  sources: Source[] | undefined;
  sourceState: SourceLoadState;
  controlsDisabled: boolean;
  togglePending: boolean;
  searchDisabled: boolean;
  searchPending: boolean;
  onToggle: () => void;
  onSearch: (sources: string[]) => void;
}) {
  const automated = isSignalAutomated(signal);
  const searchSources = signalSearchSources([signal], sources);
  const cannotSearch = searchDisabled || !automated || !signal.enabled || sourceState !== "ready" || searchSources.length === 0;
  const searchHint = !automated ? PLANNED_SIGNAL_COPY
    : !signal.enabled ? "Enable this signal to search its shared feeds."
    : sourceState !== "ready" ? "Load source status before requesting a search."
    : searchSources.length === 0 ? "No shared feed for this signal is enabled. Refresh or change a signal to sync its feeds."
    : "Search the enabled shared feeds against your saved target companies. Results are not limited to this signal.";

  return (
    <Card className="flex h-full flex-col overflow-hidden rounded-xl shadow-none transition-colors hover:border-blue-500/30">
      <div className="flex-1 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <SignalCapabilityBadge signal={signal} />
              {!automated ? <span className="text-[11px] text-muted-foreground">Planned</span> : null}
            </div>
            <h3 className="text-sm font-semibold leading-5 tracking-tight">{signal.label}</h3>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-1.5 pt-0.5">
            <button
              type="button"
              role="switch"
              aria-checked={signal.enabled}
              aria-busy={togglePending}
              aria-label={automated ? `${signal.enabled ? "Disable" : "Enable"} ${signal.label}` : `${signal.label}: not automated, planned`}
              title={automated ? "Changes shared source feeds. Other enabled signals may need the same feeds." : PLANNED_SIGNAL_COPY}
              disabled={!automated || controlsDisabled || togglePending}
              onClick={onToggle}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors",
                "disabled:cursor-not-allowed disabled:opacity-50",
                signal.enabled ? "border-blue-600 bg-blue-600 dark:border-blue-500 dark:bg-blue-500" : "border-input bg-muted",
              )}
            >
              <span className={cn(
                "pointer-events-none flex size-5 items-center justify-center rounded-full bg-white shadow-sm transition-transform",
                signal.enabled ? "translate-x-[21px]" : "translate-x-px",
              )}>
                {togglePending ? <Loader2 className="size-3 animate-spin text-blue-600" aria-hidden /> : null}
              </span>
            </button>
            <span className="text-[10px] font-medium text-muted-foreground">
              {togglePending ? "Saving" : !automated ? "Planned" : signal.enabled ? "On" : "Off"}
            </span>
          </div>
        </div>

        <p className="mt-2 text-xs leading-5 text-muted-foreground">{signal.description}</p>

        <div className="mt-3 rounded-xl border-l-2 border-blue-500/60 bg-blue-500/[0.04] px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-600 dark:text-blue-400">Why now</p>
          <p className="mt-1 text-xs leading-5 text-foreground/80">{signal.why_now}</p>
        </div>

        <details className="group/details mt-3">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-sm py-1 text-xs font-medium [&::-webkit-details-marker]:hidden">
            How it works
            <ChevronDown className="size-3.5 text-muted-foreground transition-transform group-open/details:rotate-180" aria-hidden />
          </summary>
          <div className="mt-2 space-y-3">
            <p className="text-xs leading-5 text-muted-foreground">{signalHowItWorks(signal)}</p>
            {automated ? (
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Shared source feeds</p>
                <ul className="space-y-2">
                  {signal.adapters.map((kind) => {
                    const feed = sources?.find((source) => source.kind === kind);
                    const status = sourceStatus(feed, sourceState);
                    return (
                      <li key={kind} className="rounded-xl border bg-background/50 px-2.5 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-medium">{feed?.name ?? sourceLabel(kind)}</span>
                          <Badge tone={status.tone}>{status.label}</Badge>
                        </div>
                        {feed?.last_error ? (
                          <p className="mt-1.5 break-words text-[11px] leading-4 text-destructive">Last reported error: {feed.last_error}</p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2 text-[11px] leading-4 text-muted-foreground">Feed status is separate from catalog coverage. An enabled feed is not a guarantee of a matching lead.</p>
              </div>
            ) : null}
          </div>
        </details>
      </div>

      <div className="flex items-center justify-between gap-2 border-t bg-muted/20 px-4 py-2.5">
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {automated ? <Network className="size-3.5 text-blue-600 dark:text-blue-400" aria-hidden /> : <Clock3 className="size-3.5" aria-hidden />}
          {automated ? `${signal.adapters.length} shared feed${signal.adapters.length === 1 ? "" : "s"}` : "No automated feed"}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-[11px]"
          disabled={cannotSearch || searchPending}
          title={searchHint}
          onClick={() => { if (!cannotSearch && searchSources.length > 0) onSearch(searchSources); }}
        >
          {searchPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Radio className="size-3.5" aria-hidden />}
          {searchPending ? "Requesting…" : automated ? "Find leads" : "Not automated"}
        </Button>
      </div>
    </Card>
  );
}

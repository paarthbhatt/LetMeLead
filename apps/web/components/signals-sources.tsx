"use client";

import { ChevronDown, Network } from "lucide-react";

import { Badge, Empty, Skeleton } from "@/components/ui";
import type { Source } from "@/lib/api";
import { sourceStatus, type SourceLoadState } from "@/lib/signal-catalog";
import { relative } from "@/lib/utils";

export function SignalsSources({ sources, state }: { sources: Source[] | undefined; state: SourceLoadState }) {
  const enabled = sources?.filter((source) => source.enabled).length;
  const issues = sources?.filter((source) => sourceStatus(source, state).needsAttention).length ?? 0;

  return (
    <details className="group/feeds rounded-xl border bg-card">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 rounded-xl p-4 [&::-webkit-details-marker]:hidden">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg border bg-muted/40 text-blue-600 dark:text-blue-400">
            <Network className="size-4" aria-hidden />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Source feed status</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {state === "loading" ? "Checking your shared feeds…"
                : state === "error" ? "Status could not be refreshed"
                : `${enabled ?? 0} of ${sources?.length ?? 0} feeds enabled`}
              {issues > 0 ? ` · ${issues} need attention` : ""}
            </p>
          </div>
        </div>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          View feeds
          <ChevronDown className="size-4 transition-transform group-open/feeds:rotate-180" aria-hidden />
        </span>
      </summary>
      <div className="space-y-3 border-t p-4">
        <p className="text-xs leading-5 text-muted-foreground">
          Enabled is a saved setting, not a provider health check. Last scan status reflects a previous attempt; it does not guarantee current availability.
        </p>
        {state === "loading" ? <Skeleton className="h-24 rounded-lg" /> : state === "error" ? (
          <p className="text-xs text-destructive">Refresh the page data to retry loading source status. Searches are disabled until it loads.</p>
        ) : sources?.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {sources.map((source) => {
              const status = sourceStatus(source, state);
              return (
                <div key={source.id} className="rounded-xl border bg-background/40 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold">{source.name}</p>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {source.last_run_at ? `Last successful scan ${relative(source.last_run_at)}` : "No successful scan recorded"}
                  </p>
                  {source.last_error ? (
                    <p className="mt-2 break-words text-[11px] leading-4 text-destructive">Last reported error: {source.last_error}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <Empty title="No source feeds set up" hint="Change a source-backed signal to sync its feeds. Catalog choices alone do not confirm that sources are enabled." className="rounded-lg" />
        )}
      </div>
    </details>
  );
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink, FileSearch, FileText, RefreshCw } from "lucide-react";
import Link from "next/link";

import { Badge, Button, Dialog, Empty, Notice, Skeleton } from "@/components/ui";
import { api, ApiError, type Evidence, type Lead } from "@/lib/api";
import { fitLabel, safeExternalUrl, scoreLabel, sortEvidence } from "@/lib/lead-helpers";
import { ageLabel, shortDate } from "@/lib/utils";

export function EvidenceTimeline({ evidence }: { evidence: readonly Evidence[] }) {
  if (!evidence.length) {
    return (
      <Empty
        icon={<FileSearch className="size-5" aria-hidden />}
        title="No source evidence attached"
        hint="This record has no evidence rows. Review the lead carefully before claiming it or creating outreach."
        className="m-5"
      />
    );
  }
  return (
    <ol className="divide-y">
      {sortEvidence(evidence).map((item) => {
        const url = safeExternalUrl(item.url);
        const dated = Boolean(item.published_at && Number.isFinite(Date.parse(item.published_at)));
        return (
          <li key={item.id} className="grid gap-3 p-5 sm:grid-cols-[112px_1fr]">
            <div className="flex items-center gap-2 text-xs text-muted-foreground sm:items-start sm:pt-0.5">
              <FileText className="size-3.5 shrink-0 text-signal" aria-hidden />
              {dated ? <time dateTime={item.published_at ?? undefined}>{shortDate(item.published_at)}</time> : <span>Date not supplied</span>}
            </div>
            <div className="min-w-0 space-y-2">
              <p className="text-sm font-medium leading-relaxed">{item.title || "Untitled source evidence"}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="muted">{item.type.replaceAll("_", " ")}</Badge>
                <Badge tone={item.strength.toLowerCase() === "strong" ? "default" : "muted"}>{item.strength}</Badge>
                <span className="text-xs tabular-nums text-muted-foreground" title="Contribution to the lead's evidence score">{scoreLabel(item.points)} points</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 font-medium text-signal hover:underline"
                    aria-label={`Open ${item.source} evidence in a new tab`}
                  >
                    {item.source || "Public source"}<ExternalLink className="size-3" aria-hidden />
                  </a>
                ) : (
                  <><span className="text-muted-foreground">{item.source || "Source not stated"}</span><span className="text-muted-foreground">· Source link unavailable</span></>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function LeadEvidenceDialog({ lead, onOpenChange }: { lead: Lead | null; onOpenChange: (open: boolean) => void }) {
  const id = lead?.id ?? "";
  const detail = useQuery({ queryKey: ["lead", id], queryFn: () => api.lead(id), enabled: Boolean(lead) });
  return (
    <Dialog
      open={Boolean(lead)}
      className="max-w-2xl rounded-xl"
      onOpenChange={onOpenChange}
      title={`Evidence · ${lead?.company ?? "Lead"}`}
      description="Public signals explain timing, not a promise or intent to buy."
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          {lead ? <Link href={`/leads/${lead.id}`} className="text-sm font-medium text-signal hover:underline" onClick={() => onOpenChange(false)}>Open full lead profile</Link> : null}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
        </div>
      }
    >
      {detail.isLoading ? (
        <div className="space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-28 w-full" /><Skeleton className="h-28 w-full" /></div>
      ) : detail.isError ? (
        <div className="space-y-3">
          <Notice tone="error">{detail.error instanceof ApiError ? detail.error.message : "Could not load the source evidence."}</Notice>
          <Button variant="outline" onClick={() => detail.refetch()} disabled={detail.isFetching}><RefreshCw className="size-4" aria-hidden /> Try again</Button>
        </div>
      ) : detail.data ? (
        <div className="space-y-4">
          <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
            <p className="text-sm leading-relaxed">{detail.data.reason || "No reason has been recorded for this lead."}</p>
            <div className="flex flex-wrap gap-2">
              <Badge tone="muted">Score {scoreLabel(detail.data.score)}</Badge>
              <Badge tone="muted">{ageLabel(detail.data.signal_age_days)}</Badge>
              <Badge tone={detail.data.fit === "not_fit" ? "danger" : "muted"}>{fitLabel(detail.data.fit)}</Badge>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border">
            <div className="border-b px-5 py-3 text-xs font-medium text-muted-foreground">{detail.data.evidence.length} source record{detail.data.evidence.length === 1 ? "" : "s"} · newest dated evidence first</div>
            <EvidenceTimeline evidence={detail.data.evidence} />
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}

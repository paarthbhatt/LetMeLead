"use client";

import { ArrowUpRight, FileText, ListChecks, Search, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { useState } from "react";

import { Avatar, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Empty, Input, Notice, Skeleton } from "@/components/ui";
import type { LeadDraftReview } from "@/lib/lead-drafts";
import { matchesOutreachSearch, outreachError } from "@/lib/outreach-campaigns";
import { shortDate } from "@/lib/utils";

export function OutreachRecipientReview({
  review,
  loading,
  selectedIds,
  disabled,
  onSelectionChange,
  onQueue,
}: {
  review: LeadDraftReview | null;
  loading: boolean;
  selectedIds: string[];
  disabled: boolean;
  onSelectionChange: (ids: string[]) => void;
  onQueue: () => void;
}) {
  const [search, setSearch] = useState("");
  const visible = review?.recipients.filter((recipient) => matchesOutreachSearch([recipient.company, recipient.contactName], search)) ?? [];

  return (
    <Card className="overflow-hidden rounded-xl">
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2"><Users className="size-4 text-blue-600 dark:text-blue-400" aria-hidden />Reviewed recipients</CardTitle>
          <CardDescription>A recipient review from your leads, saved in this browser tab only.</CardDescription>
        </div>
        <Badge tone="muted">Not attached</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div role="status" aria-label="Loading recipient review"><Skeleton className="h-24 w-full" /></div>
        ) : !review ? (
          <>
            <Notice tone="info">The recipient review is unavailable in this tab. It may have been opened in another tab or could not be saved. The campaign draft exists, but this page will not substitute other claimed leads.</Notice>
            <Link href="/leads" className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400">Review recipients again in Leads<ArrowUpRight className="size-3.5" aria-hidden /></Link>
          </>
        ) : (
          <>
            <Notice tone="info">Creating the draft did not attach these recipients or queue messages. Queueing requires a separate confirmation and can activate the campaign. Starting, resuming, and running the sender also require confirmation.</Notice>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">{selectedIds.length} selected · {review.recipients.length} reviewed · {review.excludedCount} excluded originally</p>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onSelectionChange(review.recipients.map((recipient) => recipient.leadId))}>Select all reviewed</Button>
                <Button size="sm" variant="ghost" disabled={disabled || !selectedIds.length} onClick={() => onSelectionChange([])}>Clear selection</Button>
              </div>
            </div>
            <div className="relative max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Find a reviewed recipient…" aria-label="Search reviewed recipients" />
            </div>
            {visible.length ? (
              <ul className="max-h-[420px] space-y-2 overflow-y-auto pr-1" aria-label="Tab-local reviewed recipients">
                {visible.map((recipient) => (
                  <li key={recipient.leadId} className="rounded-xl border bg-background/30 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <input
                          type="checkbox"
                          className="size-4 shrink-0 accent-blue-600"
                          aria-label={`Include ${recipient.company} in reviewed queue`}
                          checked={selectedIds.includes(recipient.leadId)}
                          disabled={disabled}
                          onChange={(event) => onSelectionChange(event.target.checked ? [...selectedIds, recipient.leadId] : selectedIds.filter((id) => id !== recipient.leadId))}
                        />
                        <Avatar name={recipient.contactName || recipient.company} />
                        <div className="min-w-0">
                          <Link href={`/leads/${recipient.leadId}`} className="text-sm font-semibold hover:text-blue-600 dark:hover:text-blue-400">{recipient.company}</Link>
                          <p className="mt-1 text-xs text-muted-foreground">{recipient.contactName || "No named contact in the original review"}</p>
                        </div>
                      </div>
                      <Badge tone="muted">Status rechecked before queueing</Badge>
                    </div>
                    {recipient.body ? (
                      <details className="mt-3 border-t pt-3">
                        <summary className="cursor-pointer text-xs font-medium text-blue-600 dark:text-blue-400">Review original draft preview</summary>
                        <p className="mt-2 text-[11px] text-muted-foreground">Step {recipient.stepNo ?? "—"} · {recipient.kind === "connect" ? "Connection request" : "Message"} · Captured {shortDate(review.createdAt)}</p>
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{recipient.body}</p>
                      </details>
                    ) : (
                      <p className="mt-3 flex items-start gap-2 border-t pt-3 text-xs leading-relaxed text-muted-foreground"><FileText className="mt-0.5 size-3.5 shrink-0" aria-hidden />{outreachError(new Error(recipient.error || ""), "The original preview is unavailable. Use the saved-step preview below.")}</p>
                    )}
                  </li>
                ))}
              </ul>
            ) : <Empty className="border-0 py-5" title="No reviewed recipients match" hint="Try a different company or contact name. Search does not change the selected recipients." icon={<Search className="size-5" />} />}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <p className="flex max-w-xl items-start gap-2 text-xs leading-relaxed text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden />Original previews are snapshots, not queued messages. Sequence edits do not update them; render a saved-step preview below to review new text.</p>
              <Button variant="outline" disabled={disabled || !selectedIds.length} onClick={onQueue}><ListChecks className="size-4" aria-hidden />Queue reviewed recipients</Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

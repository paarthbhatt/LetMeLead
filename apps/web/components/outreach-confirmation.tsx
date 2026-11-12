"use client";

import { AlertTriangle, Send, ShieldCheck } from "lucide-react";
import React, { useEffect, useId, useState } from "react";

import { Button, Dialog, Notice } from "@/components/ui";

export type OutreachAction = "start" | "resume" | "queue" | "send";

const actionCopy: Record<OutreachAction, { title: string; description: string; button: string }> = {
  start: {
    title: "Start this campaign?",
    description: "Starting makes this campaign active. Eligible queued messages may be sent automatically.",
    button: "Start campaign",
  },
  resume: {
    title: "Resume outreach?",
    description: "Resuming removes the campaign pause. Eligible queued messages may be sent automatically.",
    button: "Resume campaign",
  },
  queue: {
    title: "Queue the next outreach step?",
    description: "Queueing also activates a draft campaign. Messages can become eligible for automatic sending.",
    button: "Confirm & queue",
  },
  send: {
    title: "Run the sender now?",
    description: "This runs the sender for due messages and may queue follow-ups. It can send real LinkedIn messages.",
    button: "Confirm & run sender",
  },
};

export function OutreachConfirmation({
  open,
  onOpenChange,
  action,
  campaignName,
  scope,
  pending,
  error,
  dryRun,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: OutreachAction;
  campaignName: string;
  scope: string;
  pending: boolean;
  error?: string | null;
  dryRun?: boolean;
  onConfirm: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const acknowledgementId = useId();
  const copy = actionCopy[action];

  useEffect(() => setAcknowledged(false), [open, action, campaignName, scope]);

  function changeOpen(next: boolean) {
    if (!pending) onOpenChange(next);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={changeOpen}
      title={copy.title}
      description={copy.description}
      footer={
        <>
          <Button variant="outline" disabled={pending} onClick={() => changeOpen(false)}>Cancel</Button>
          <Button disabled={pending || !acknowledged} onClick={onConfirm}>
            <Send className="size-4" aria-hidden />
            {pending ? "Working…" : copy.button}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border bg-muted/30 p-4">
          <p className="break-words text-sm font-semibold">{campaignName}</p>
          <p className="mt-1 text-sm text-muted-foreground">{scope}</p>
        </div>
        <div className="flex gap-3 text-sm leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden />
          <p>Account availability, daily limits, and pacing still apply. A completed request is not a delivery receipt.</p>
        </div>
        {action === "queue" ? (
          <Notice tone="info">Manual queueing does not enforce follow-up delays. Already queued steps are not rewritten by sequence edits.</Notice>
        ) : null}
        {dryRun === true ? (
          <Notice tone="info">The account currently reports dry-run mode. Individual records will identify simulations. Settings can change, so review this as a send-capable action.</Notice>
        ) : null}
        <label htmlFor={acknowledgementId} className="flex cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm leading-relaxed">
          <input
            id={acknowledgementId}
            type="checkbox"
            className="mt-1 size-4 shrink-0 accent-blue-600"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
            disabled={pending}
          />
          <span><AlertTriangle className="mr-1.5 inline size-3.5 text-amber-600 dark:text-amber-400" aria-hidden />I understand this action may send LinkedIn messages to the recipients above.</span>
        </label>
        {error ? <Notice tone="error">{error}</Notice> : null}
      </div>
    </Dialog>
  );
}

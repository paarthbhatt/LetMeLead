"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, Copy, FilePenLine, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";

import { Avatar, Badge, Button, Dialog, Input, Label, Notice, StatusBadge } from "@/components/ui";
import { api, ApiError, type Lead } from "@/lib/api";
import { storeLeadDraftReview, type LeadDraftRecipient, type LeadDraftReview } from "@/lib/lead-drafts";
import { leadContactSummary, reviewLeadSelection } from "@/lib/lead-helpers";

export function ReachOutDialog({
  open,
  leads,
  onOpenChange,
  onComplete,
}: {
  open: boolean;
  leads: readonly Lead[];
  onOpenChange: (open: boolean) => void;
  onComplete: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const nameId = useId();
  const [name, setName] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const selection = useMemo(() => reviewLeadSelection(leads), [leads]);
  const createDraft = useMutation({
    mutationFn: async ({
      campaignName,
      recipients,
      excludedCount,
    }: {
      campaignName: string;
      recipients: Lead[];
      excludedCount: number;
    }) => {
      if (!campaignName.trim() || !recipients.length || reviewLeadSelection(recipients).eligible.length !== recipients.length) {
        throw new ApiError(400, "claimed_selection_required", "Choose at least one claimed lead and give the draft a name.");
      }
      // Recheck the reviewed recipients, not all visible/new leads. A stale status
      // must never silently add someone to an outreach flow.
      const current = await Promise.all(recipients.map((lead) => api.lead(lead.id)));
      current.forEach((lead) => queryClient.setQueryData(["lead", lead.id], lead));
      if (reviewLeadSelection(current).eligible.length !== recipients.length) {
        queryClient.invalidateQueries({ queryKey: ["leads"] });
        throw new ApiError(409, "selection_changed", "A reviewed lead is no longer in claimed status. Refresh the selection and review it again.");
      }
      const campaign = await api.createCampaign({ name: campaignName.trim(), lead_ids: current.map((lead) => lead.id) });
      // queueCampaign activates a draft in the current API. Use preview only:
      // no claim, queue, resume, or send endpoint belongs in this flow.
      const previews = await Promise.allSettled(current.map((lead) => api.preview(campaign.id, lead.id)));
      const draftRecipients: LeadDraftRecipient[] = current.map((lead, index) => {
        const result = previews[index];
        const preview = result.status === "fulfilled" ? result.value : null;
        const body = typeof preview?.body === "string" && preview.body.trim() ? preview.body : null;
        return {
          leadId: lead.id,
          company: lead.company,
          contactName: lead.contacts.find((contact) => contact.name?.trim())?.name ?? lead.contact?.name ?? null,
          body,
          kind: typeof preview?.kind === "string" ? preview.kind : null,
          stepNo: preview && Number.isInteger(preview.step_no) && preview.step_no > 0 ? preview.step_no : null,
          error: body ? null : result.status === "rejected" && result.reason instanceof ApiError
            ? result.reason.message
            : "The campaign draft exists, but this message preview could not be generated.",
        };
      });
      const review: LeadDraftReview = {
        version: 1,
        campaignId: campaign.id,
        createdAt: new Date().toISOString(),
        recipients: draftRecipients,
        excludedCount,
      };
      return { campaign, review, stored: storeLeadDraftReview(review) };
    },
    onSuccess: ({ review }) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      onComplete(`Created a campaign draft after reviewing ${review.recipients.length} claimed lead${review.recipients.length === 1 ? "" : "s"}. Nothing was queued or sent.`);
    },
  });
  const { reset } = createDraft;
  useEffect(() => {
    reset();
    if (!open) return;
    setName(`Outreach · ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`);
    setCopied(null);
    setCopyError(null);
  }, [open, reset]);
  const result = createDraft.data;

  return (
    <Dialog
      open={open}
      className="max-w-xl rounded-xl"
      onOpenChange={(nextOpen) => { if (!createDraft.isPending) onOpenChange(nextOpen); }}
      title={result ? "Draft ready for review" : "Review outreach selection"}
      description={result
        ? "The campaign is a draft. Nothing has been activated, queued, or sent."
        : "Only selected leads in claimed status can be used. Review the recipients before creating a draft."}
      footer={result ? (
        <div className="flex w-full flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Done</Button>
          <Button onClick={() => { onOpenChange(false); router.push(`/campaigns/${result.campaign.id}?review=1`); }}>
            Open campaign draft <ArrowRight className="size-4" aria-hidden />
          </Button>
        </div>
      ) : (
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">{selection.eligible.length} included · {selection.excluded.length} excluded</span>
          <div className="flex gap-2">
            <Button variant="ghost" disabled={createDraft.isPending} onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              disabled={createDraft.isPending || !name.trim() || !selection.eligible.length}
              onClick={() => createDraft.mutate({ campaignName: name, recipients: selection.eligible, excludedCount: selection.excluded.length })}
            >
              <FilePenLine className="size-4" aria-hidden />{createDraft.isPending ? "Creating drafts…" : "Create draft"}
            </Button>
          </div>
        </div>
      )}
    >
      {result ? (
        <div className="space-y-4">
          <Notice tone="success">
            <span className="font-medium">{result.campaign.name}</span> · {result.review.recipients.filter((recipient) => recipient.body).length} of {result.review.recipients.length} message previews ready.
          </Notice>
          <Notice tone={result.stored ? "info" : "error"}>
            {result.stored
              ? "The reviewed recipients and previews are saved in this browser tab only. They have not been attached to a sequence or queued."
              : "The campaign exists, but this browser could not save the recipient review. Copy the previews now. Nothing was queued or sent."}
          </Notice>
          <div className="space-y-3">
            {result.review.recipients.map((recipient) => (
              <article key={recipient.leadId} className="overflow-hidden rounded-xl border">
                <div className="flex items-center justify-between gap-3 border-b bg-muted/20 p-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar name={recipient.contactName || recipient.company} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{recipient.company}</p>
                      <p className="truncate text-xs text-muted-foreground">{recipient.contactName || "No named contact · company-level draft"}</p>
                    </div>
                  </div>
                  {recipient.body ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Copy draft for ${recipient.company}`}
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(recipient.body ?? "");
                          setCopied(recipient.leadId);
                          setCopyError(null);
                        } catch {
                          setCopyError("Clipboard is unavailable. You can select and copy the preview text below.");
                        }
                      }}
                    >
                      {copied === recipient.leadId ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                      {copied === recipient.leadId ? "Copied" : "Copy"}
                    </Button>
                  ) : <Badge tone="muted">Preview unavailable</Badge>}
                </div>
                {recipient.body ? (
                  <div className="space-y-2 p-4">
                    <p className="text-[11px] text-muted-foreground">Step {recipient.stepNo ?? "—"} · {recipient.kind?.replaceAll("_", " ") ?? "Message preview"}</p>
                    <p className="select-text whitespace-pre-wrap text-sm leading-relaxed">{recipient.body}</p>
                  </div>
                ) : <p className="p-4 text-sm text-muted-foreground">{recipient.error}</p>}
              </article>
            ))}
          </div>
          {copyError ? <Notice tone="error">{copyError}</Notice> : null}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={nameId}>Campaign draft name</Label>
            <Input id={nameId} value={name} maxLength={120} onChange={(event) => setName(event.target.value)} disabled={createDraft.isPending} />
          </div>
          <div className="overflow-hidden rounded-xl border">
            <div className="border-b bg-muted/20 px-4 py-3 text-xs font-medium text-muted-foreground">Selected leads · {selection.eligible.length + selection.excluded.length}</div>
            <ul className="max-h-72 divide-y overflow-y-auto">
              {selection.eligible.map((lead) => (
                <li key={lead.id} className="flex items-center gap-3 px-4 py-3">
                  <Check className="size-4 shrink-0 text-signal" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{lead.company}</p>
                    <p className="truncate text-xs text-muted-foreground">{leadContactSummary(lead).label}</p>
                  </div>
                  <StatusBadge status={lead.status} />
                </li>
              ))}
              {selection.excluded.map(({ lead, reason }) => (
                <li key={lead.id} className="flex items-center gap-3 bg-muted/10 px-4 py-3">
                  <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground" aria-hidden>—</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-muted-foreground">{lead.company}</p>
                    <p className="text-xs text-muted-foreground">{reason}</p>
                  </div>
                  <StatusBadge status={lead.status} />
                </li>
              ))}
            </ul>
          </div>
          <Notice tone="info">
            {selection.eligible.length
              ? "Creating drafts does not claim additional leads, spend lead credits, or send messages. Claimed status is checked again before creation."
              : "No selected lead is in claimed status. Claim a suitable lead separately, then select it to create a draft. No credits will be spent here."}
          </Notice>
          {createDraft.isPending ? <p role="status" className="text-xs text-muted-foreground">Checking claimed status and generating preview-only drafts…</p> : null}
          {createDraft.isError ? <Notice tone="error">{createDraft.error instanceof ApiError ? createDraft.error.message : "Could not create the draft. No outreach was started."}</Notice> : null}
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4 shrink-0" aria-hidden /> You decide when, and whether, to activate outreach.</p>
        </div>
      )}
    </Dialog>
  );
}

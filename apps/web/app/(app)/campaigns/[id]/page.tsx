"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight, Clock3, Eye, FileText, GitBranch, Inbox, Linkedin, ListChecks, Pause, Play, Send, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import React, { useEffect, useState } from "react";

import { OutreachConfirmation, type OutreachAction } from "@/components/outreach-confirmation";
import { OutreachRecipientReview } from "@/components/outreach-recipient-review";
import { OutreachSequenceEditor } from "@/components/outreach-sequence-editor";
import { PageHeader } from "@/components/shell";
import { Avatar, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Empty, Label, Notice, Select, Skeleton, Stat, StatusBadge, Table, Td, Th } from "@/components/ui";
import { api, ApiError, type SequenceStepInput } from "@/lib/api";
import { readLeadDraftReview, type LeadDraftReview } from "@/lib/lead-drafts";
import {
  approvedQueueLeadIds,
  campaignStateHint,
  messagePresentation,
  normalizeSequence,
  outreachError,
  parseOutreachPreview,
  queueRecipientsStillApproved,
  reviewedQueueLeadIds,
  sequenceFingerprint,
  summarizeQueueResult,
  summarizeSendResult,
  validateSequence,
  type OutreachNotice,
  type OutreachPreview,
} from "@/lib/outreach-campaigns";
import { conversationDate } from "@/lib/outreach-inbox";
import { cn, shortDate } from "@/lib/utils";

type SequenceDraft = { campaignId: string; steps: SequenceStepInput[]; savedFingerprint: string };
type Confirmation = { action: OutreachAction; scope: string; leadIds?: string[] };
type LocalReview = { campaignId: string; requested: boolean; review: LeadDraftReview | null };

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const reviewRequested = useSearchParams().get("review") === "1";
  const queryClient = useQueryClient();
  const [editor, setEditor] = useState<SequenceDraft | null>(null);
  const [leadId, setLeadId] = useState("");
  const [preview, setPreview] = useState<OutreachPreview | null>(null);
  const [notice, setNotice] = useState<OutreachNotice | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [activityFilter, setActivityFilter] = useState("all");
  const [localReview, setLocalReview] = useState<LocalReview | null>(null);
  const [selectedReviewIds, setSelectedReviewIds] = useState<string[]>([]);

  const campaign = useQuery({ queryKey: ["campaign", params.id], queryFn: () => api.campaign(params.id) });
  const messages = useQuery({ queryKey: ["campaign-messages", params.id], queryFn: () => api.campaignMessages(params.id) });
  const claimedLeads = useQuery({ queryKey: ["leads", "claimed"], queryFn: () => api.leads({ status: "claimed", limit: 50 }) });
  const recipientNames = useQuery({ queryKey: ["leads", "outreach-names"], queryFn: () => api.leads({ limit: 100 }) });
  const limits = useQuery({ queryKey: ["linkedin", "limits"], queryFn: api.linkedinLimits });

  useEffect(() => {
    if (!campaign.data) return;
    const saved = normalizeSequence(campaign.data.sequence?.steps ?? []);
    setEditor((current) => {
      // A refetch must not erase work in the editor.
      if (current?.campaignId === params.id && sequenceFingerprint(current.steps) !== current.savedFingerprint) return current;
      return { campaignId: params.id, steps: saved, savedFingerprint: sequenceFingerprint(saved) };
    });
  }, [campaign.data, params.id]);

  useEffect(() => {
    setLeadId("");
    setPreview(null);
    setPreviewError(null);
    setNotice(null);
    setConfirmation(null);
    setActionError(null);
  }, [params.id]);

  useEffect(() => {
    // This is tab-local review data, not a campaign membership or queue operation.
    const review = reviewRequested ? readLeadDraftReview(params.id) : null;
    setLocalReview({ campaignId: params.id, requested: reviewRequested, review });
    setSelectedReviewIds(review?.recipients.map((recipient) => recipient.leadId) ?? []);
    setLeadId("");
    setPreview(null);
    setConfirmation(null);
  }, [params.id, reviewRequested]);

  const steps = editor?.campaignId === params.id ? editor.steps : normalizeSequence(campaign.data?.sequence?.steps ?? []);
  const dirty = editor?.campaignId === params.id && sequenceFingerprint(steps) !== editor.savedFingerprint;
  const dryRun = typeof limits.data?.dry_run === "boolean" ? limits.data.dry_run : undefined;
  const reviewLoaded = localReview?.campaignId === params.id && localReview.requested === reviewRequested;
  const recipientReview = reviewRequested && reviewLoaded ? localReview.review : null;
  const reviewLoading = reviewRequested && !reviewLoaded;

  async function refreshCampaign() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["campaign", params.id] }),
      queryClient.invalidateQueries({ queryKey: ["campaign-messages", params.id] }),
      queryClient.invalidateQueries({ queryKey: ["campaigns"] }),
      queryClient.invalidateQueries({ queryKey: ["leads"] }),
    ]);
  }

  const saveSequence = useMutation({
    mutationFn: (submitted: SequenceStepInput[]) => api.updateSequence(params.id, { name: campaign.data?.sequence?.name ?? "Outreach sequence", steps: submitted }),
    onSuccess: (saved) => {
      const normalized = normalizeSequence(saved.steps);
      setEditor({ campaignId: params.id, steps: normalized, savedFingerprint: sequenceFingerprint(normalized) });
      setPreview(null);
      setNotice({ tone: "success", text: "Sequence saved. Future previews and queueing use this version; already queued messages keep their original text." });
      return queryClient.invalidateQueries({ queryKey: ["campaign", params.id] });
    },
    onError: (error) => setNotice({ tone: "error", text: outreachError(error, "We couldn't save the sequence. Your edits are still here.") }),
  });

  const queue = useMutation({
    mutationFn: async (leadIds: string[]) => {
      if (!leadIds.length) throw new ApiError(400, "queue_preflight", "Choose at least one recipient. No messages were queued.");
      const current = await Promise.all(leadIds.map((id) => api.lead(id))).catch(() => {
        throw new ApiError(409, "queue_preflight", "We could not verify every recipient. No messages were queued; review the selection and try again.");
      });
      current.forEach((lead) => queryClient.setQueryData(["lead", lead.id], lead));
      if (!queueRecipientsStillApproved(leadIds, current)) {
        throw new ApiError(409, "queue_preflight", "One or more recipients are no longer eligible claimed leads. Review the selection again. No messages were queued.");
      }
      return api.queueCampaign(params.id, leadIds);
    },
    onSuccess: (result) => {
      setNotice(summarizeQueueResult(result.queued));
      setConfirmation(null);
      setPreview(null);
      return refreshCampaign();
    },
    onError: (error) => {
      setActionError(error instanceof ApiError && error.code === "queue_preflight" ? error.message : `${outreachError(error, "We couldn't confirm the queue request.")} Some messages may have been queued. Review the activity log before retrying.`);
      void refreshCampaign();
    },
  });

  const send = useMutation({
    mutationFn: () => api.sendCampaign(params.id),
    onSuccess: (result) => {
      setNotice(summarizeSendResult(result, dryRun));
      setConfirmation(null);
      setPreview(null);
      return refreshCampaign();
    },
    onError: (error) => {
      setActionError(`${outreachError(error, "The sender request did not complete.")} Some messages may have been processed. Review the activity log before retrying.`);
      void refreshCampaign();
    },
  });

  const pause = useMutation({
    mutationFn: () => api.pauseCampaign(params.id, "Paused from the campaign dashboard"),
    onSuccess: () => {
      setNotice({ tone: "success", text: "Campaign paused. Queued messages are kept; a send already in progress may finish." });
      return refreshCampaign();
    },
    onError: (error) => setNotice({ tone: "error", text: outreachError(error, "We couldn't confirm the pause. Please check the campaign status and try again.") }),
  });

  const resume = useMutation({
    mutationFn: () => api.resumeCampaign(params.id),
    onSuccess: () => {
      setConfirmation(null);
      setNotice({ tone: "success", text: "Campaign is active. Eligible queued messages may send automatically; no delivery is confirmed by this status change." });
      return refreshCampaign();
    },
    onError: (error) => setActionError(outreachError(error, "We couldn't activate this campaign. Please review its current status.")),
  });

  const renderPreview = useMutation({
    mutationFn: (id: string) => api.preview(params.id, id),
    onSuccess: (result) => {
      const parsed = parseOutreachPreview(result);
      setPreview(parsed);
      if (parsed.state === "invalid") setPreviewError("The preview response was incomplete. No message was queued or sent; please try again.");
    },
    onError: (error) => setPreviewError(outreachError(error, "We couldn't render this preview. No message was queued or sent.")),
  });

  function changeSteps(next: SequenceStepInput[]) {
    setEditor((current) => ({
      campaignId: params.id,
      steps: next,
      savedFingerprint: current?.campaignId === params.id ? current.savedFingerprint : sequenceFingerprint(normalizeSequence(campaign.data?.sequence?.steps ?? [])),
    }));
    setPreview(null);
    setPreviewError(null);
  }

  const backLink = <Link href="/campaigns" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" aria-hidden />All campaigns</Link>;
  if (campaign.isLoading) return <div className="space-y-6">{backLink}<div role="status" aria-label="Loading campaign" className="space-y-5"><span className="sr-only">Loading campaign…</span><Skeleton className="h-16 w-2/3" /><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-28 rounded-xl" />)}</div><Skeleton className="h-[460px] w-full rounded-xl" /></div></div>;
  if (!campaign.data) {
    return <div className="space-y-6">{backLink}{campaign.error instanceof ApiError && campaign.error.status === 404 ? <Empty title="Campaign not found" hint="It may no longer exist or belong to another workspace." icon={<GitBranch className="size-5" />} /> : <Card className="rounded-xl"><CardContent><Notice tone="error">{outreachError(campaign.error, "We couldn't load this campaign.")}</Notice><Button variant="outline" className="mt-4" disabled={campaign.isFetching} onClick={() => campaign.refetch()}>Try again</Button></CardContent></Card>}</div>;
  }

  const data = campaign.data;
  const actionPending = queue.isPending || send.isPending || pause.isPending || resume.isPending;
  const claimedIds = approvedQueueLeadIds(claimedLeads.data?.items ?? []);
  const previewRecipients = reviewRequested
    ? (recipientReview?.recipients ?? []).map((recipient) => ({ id: recipient.leadId, company: recipient.company, contactName: recipient.contactName }))
    : (claimedLeads.data?.items ?? []).filter((lead) => claimedIds.includes(lead.id)).map((lead) => ({ id: lead.id, company: lead.company, contactName: lead.contact?.name ?? null }));
  const availableIds = previewRecipients.map((recipient) => recipient.id);
  const queueIds = reviewRequested ? reviewedQueueLeadIds(recipientReview, selectedReviewIds) : approvedQueueLeadIds(claimedLeads.data?.items ?? [], leadId);
  const selectedLead = previewRecipients.find((lead) => lead.id === leadId);
  const queueNames = previewRecipients.filter((recipient) => queueIds.includes(recipient.id)).slice(0, 3).map((recipient) => recipient.company).join(", ");
  const queueScope = reviewRequested
    ? `${queueIds.length} selected, tab-reviewed ${queueIds.length === 1 ? "recipient" : "recipients"}: ${queueNames}${queueIds.length > 3 ? `, and ${queueIds.length - 3} more` : ""}. Their current claimed status will be verified before queueing. Creating the draft did not attach them.`
    : selectedLead ? `One claimed lead: ${selectedLead.company}.` : `${queueIds.length} loaded, eligible claimed leads: ${queueNames}${queueIds.length > 3 ? `, and ${queueIds.length - 3} more` : ""}.`;
  const knownRecipients = new Map([...(recipientNames.data?.items ?? []), ...(claimedLeads.data?.items ?? [])].map((lead) => [lead.id, lead]));
  const senderReady = limits.data?.connected === true && limits.data.outreach_enabled === true && !limits.isError;
  const outgoingRows = (messages.data ?? []).filter((message) => activityFilter === "all" || (activityFilter === "dry-run" ? messagePresentation(message).label === "Dry run" : message.status === activityFilter));
  const editableActionDisabled = actionPending || saveSequence.isPending || !!dirty || !steps.length || !!validateSequence(steps).length || data.status === "completed" || campaign.isError || reviewLoading;

  function requestAction(action: OutreachAction) {
    setActionError(null);
    setNotice(null);
    setConfirmation({
      action,
      scope: action === "queue" ? queueScope : `${data.pending} queued ${data.pending === 1 ? "message" : "messages"} currently recorded in this campaign. ${reviewRequested ? "This action does not attach the tab-reviewed recipients; queueing requires its own confirmation. " : ""}New follow-ups may be queued by sender runs.`,
      leadIds: action === "queue" ? [...queueIds] : undefined,
    });
  }

  function confirmAction() {
    if (!confirmation || actionPending) return;
    if (dirty || saveSequence.isPending || data.status === "completed") {
      setActionError("Save your sequence edits and review the campaign status before continuing.");
      return;
    }
    setActionError(null);
    if (confirmation.action === "queue") queue.mutate(confirmation.leadIds ?? []);
    else if (confirmation.action === "send") send.mutate();
    else resume.mutate();
  }

  return (
    <div className="space-y-6">
      {backLink}
      <PageHeader
        title={data.name}
        description="A relevant first touch. A thoughtful follow-up. Every step under your control."
        actions={<div className="flex flex-wrap gap-2">
          {data.status === "active" ? <Button variant="outline" disabled={actionPending} onClick={() => { setNotice(null); pause.mutate(); }}><Pause className="size-4" aria-hidden />{pause.isPending ? "Pausing…" : "Pause"}</Button> : data.status === "draft" || data.status === "paused" ? <Button variant="outline" disabled={editableActionDisabled} onClick={() => requestAction(data.status === "draft" ? "start" : "resume")}><Play className="size-4" aria-hidden />{data.status === "draft" ? "Start campaign" : "Resume campaign"}</Button> : null}
          <Button variant="outline" disabled={editableActionDisabled || !queueIds.length || (!reviewRequested && claimedLeads.isError)} onClick={() => requestAction("queue")}><ListChecks className="size-4" aria-hidden />{reviewRequested ? "Queue reviewed" : "Queue next step"}</Button>
          <Button disabled={editableActionDisabled || data.status !== "active" || !senderReady} onClick={() => requestAction("send")}><Send className="size-4" aria-hidden />Run sender</Button>
        </div>}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3">
        <div className="flex flex-wrap items-center gap-3"><StatusBadge status={data.status} /><span className="text-xs text-muted-foreground">{campaignStateHint(data)}</span></div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="size-3.5" aria-hidden /><span>{data.daily_cap ? `${data.daily_cap} / day maximum` : "Account pacing applies"}</span><span className="mx-1 text-border">·</span><span>Created {shortDate(data.created_at)}</span></div>
      </div>

      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      {campaign.isError ? <Notice tone="error">The campaign could not refresh. Showing its last loaded state. <Button size="sm" variant="outline" className="ml-2" onClick={() => campaign.refetch()} disabled={campaign.isFetching}>Retry</Button></Notice> : null}
      {dirty ? <Notice tone="info">You have unsaved sequence edits. Save them before previewing, queueing, starting, or sending.</Notice> : null}
      {data.status === "draft" ? <Notice tone="info">This is a draft. Review your sequence and recipients first. Queueing activates a draft and can enable automatic sending.</Notice> : null}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Leads in campaign" value={data.lead_count} hint="Added through message queueing" icon={<Users className="size-4" />} />
        <Stat label="Send records" value={data.messages_sent} hint="May include dry-run simulations" icon={<Send className="size-4" />} />
        <Stat label="Queued" value={data.pending} hint="Waiting, not delivered" icon={<Clock3 className="size-4" />} />
        <Stat label="Replies" value={data.replies} hint="Stops that lead's outreach" icon={<Inbox className="size-4" />} />
      </div>

      {reviewRequested ? <OutreachRecipientReview key={params.id} review={recipientReview} loading={reviewLoading} selectedIds={reviewedQueueLeadIds(recipientReview, selectedReviewIds)} disabled={editableActionDisabled} onSelectionChange={setSelectedReviewIds} onQueue={() => requestAction("queue")} /> : null}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <OutreachSequenceEditor steps={steps} dirty={!!dirty} saving={saveSequence.isPending} disabled={actionPending || renderPreview.isPending} onChange={changeSteps} onSave={() => { if (!validateSequence(steps).length && dirty && !saveSequence.isPending) { setNotice(null); saveSequence.mutate(steps.map((step) => ({ ...step }))); } }} />
        <div className="space-y-4">
          <Card className="overflow-hidden rounded-xl">
            <CardHeader><CardTitle className="flex items-center gap-2"><Eye className="size-4 text-blue-600 dark:text-blue-400" aria-hidden />Preview & recipients</CardTitle><CardDescription>See the next saved step for {reviewRequested ? "a reviewed recipient" : "a real claimed lead"}. A preview never queues or sends.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              {(reviewRequested ? reviewLoading : claimedLeads.isLoading) ? <div role="status" aria-label="Loading preview recipients"><Skeleton className="h-10 w-full" /><p className="mt-2 text-xs text-muted-foreground">Loading preview recipients…</p></div> : !reviewRequested && claimedLeads.isError ? <><Notice tone="error">{outreachError(claimedLeads.error, "We couldn't load the claimed leads.")}</Notice><Button size="sm" variant="outline" onClick={() => claimedLeads.refetch()} disabled={claimedLeads.isFetching}>Retry lead list</Button></> : !availableIds.length ? <Empty className="border-0 px-0 py-3" title={reviewRequested ? "No tab-reviewed recipients available" : "Claim a lead to get started"} hint={reviewRequested ? "Review recipients in Leads again. This page will not substitute another audience." : "Only eligible claimed leads are included in manual queueing from this page."} icon={<Users className="size-5" />} action={<Link href="/leads" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400">Review your leads<ArrowUpRight className="size-3.5" aria-hidden /></Link>} /> : <>
                <div className="space-y-2">
                  <Label htmlFor="preview-lead" className="text-xs">{reviewRequested ? "Lead for saved-step preview" : "Lead for preview & queueing"}</Label>
                  <Select
                    id="preview-lead"
                    value={leadId}
                    disabled={actionPending || renderPreview.isPending}
                    onChange={(event) => { setLeadId(event.target.value); setPreview(null); setPreviewError(null); }}
                  >
                    <option value="">{reviewRequested ? "Choose a reviewed recipient…" : `All ${availableIds.length} loaded claimed leads`}</option>
                    {leadId && !availableIds.includes(leadId) ? <option value={leadId} disabled>Selected lead is no longer eligible</option> : null}
                    {previewRecipients.map((lead) => (
                      <option key={lead.id} value={lead.id}>{lead.company}{lead.contactName ? ` · ${lead.contactName}` : ""}</option>
                    ))}
                  </Select>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {reviewRequested ? "Preview selection does not change queue recipients. The checked recipients in the review above define the queue scope." : leadId && !queueIds.length ? "The selected lead is no longer eligible. Choose another recipient; the queue will not fall back to everyone." : selectedLead ? `Queue next step targets ${selectedLead.company} only.` : `Queue next step targets all ${availableIds.length} eligible claimed leads loaded here. Choose one lead to render a preview.`}
                </p>
                {!reviewRequested && claimedLeads.data?.next_cursor ? <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">This list contains the first 50 claimed leads, not your whole audience. Additional leads are not included.</p> : null}
                <Button className="w-full" variant="outline" disabled={!selectedLead || !leadId || !!dirty || actionPending || renderPreview.isPending || saveSequence.isPending || !steps.length} onClick={() => { setPreview(null); setPreviewError(null); renderPreview.mutate(leadId); }}><Eye className="size-4" aria-hidden />{renderPreview.isPending ? "Rendering preview…" : "Preview next saved step"}</Button>
              </>}

              {renderPreview.isPending ? <div role="status" aria-label="Rendering message preview" className="space-y-2 rounded-xl border p-4"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-20 w-full" /></div> : null}
              {previewError ? <Notice tone="error">{previewError}</Notice> : null}
              {preview?.state === "complete" ? <Empty className="border-0 px-0 py-3" title="No next step for this lead" hint="This lead has reached the end of the saved sequence. Nothing was queued or sent." icon={<ListChecks className="size-5" />} /> : preview?.state === "ready" ? <div className="rounded-xl border border-primary/20 bg-primary/5 p-4"><div className="mb-3 flex items-center justify-between gap-2"><div className="flex items-center gap-2"><Avatar name={preview.company} /><div><p className="text-xs font-semibold">{preview.company}</p><p className="mt-0.5 text-[11px] text-muted-foreground">Step {preview.step} · {preview.kind === "connect" ? "Connection request" : "Message"}</p></div></div><Badge tone="muted">Preview</Badge></div><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{preview.body}</p><p className="mt-3 text-[11px] text-muted-foreground">Saved sequence · Not queued or sent</p></div> : !renderPreview.isPending && !previewError && availableIds.length ? <div className="flex gap-2 rounded-xl border border-dashed p-4 text-xs leading-relaxed text-muted-foreground"><FileText className="mt-0.5 size-4 shrink-0" aria-hidden /><p>Select a lead and render a preview to see how its evidence shapes the next message.</p></div> : null}
               {selectedLead ? <Link href={`/leads/${selectedLead.id}`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400">Review lead evidence<ArrowUpRight className="size-3.5" aria-hidden /></Link> : null}
            </CardContent>
          </Card>

          <Card className="rounded-xl">
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-semibold"><Linkedin className="size-4 text-blue-600 dark:text-blue-400" aria-hidden />Sender readiness</p>
                {limits.isLoading ? <Badge tone="muted">Checking…</Badge> : limits.isError ? <Badge tone="warning">Unavailable</Badge> : !limits.data?.connected ? <Badge tone="warning">Not connected</Badge> : !limits.data.outreach_enabled ? <Badge tone="muted">Disabled</Badge> : dryRun ? <Badge tone="muted">Dry run</Badge> : <Badge tone="success">Live mode</Badge>}
              </div>
              {limits.isError ? (
                <>
                  <p className="text-xs text-destructive">Account readiness could not be checked. Running the sender is unavailable until this loads.</p>
                  <Button size="sm" variant="outline" disabled={limits.isFetching} onClick={() => limits.refetch()}>Retry readiness</Button>
                </>
              ) : (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {limits.isLoading ? "Checking account availability and sending mode…" : !limits.data?.connected ? "Connect an available LinkedIn account before running the sender." : !limits.data.outreach_enabled ? "Outreach is disabled on the server. Queueing does not deliver messages." : dryRun ? "Sender runs currently create simulated send records, not live deliveries." : "This account can send live LinkedIn messages, subject to pacing and daily limits."}
                </p>
              )}
              <Link href="/linkedin" className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400">Review account & limits<ArrowUpRight className="size-3.5" aria-hidden /></Link>
              <p className="flex items-start gap-2 border-t pt-3 text-[11px] leading-relaxed text-muted-foreground"><ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden />A reply stops outreach for that lead. A pause preserves the queue.</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="overflow-hidden rounded-xl">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3"><div className="space-y-1"><CardTitle>Message activity</CardTitle><CardDescription>Queueing, failed attempts, and simulations stay visible. A send record is not a delivery receipt.</CardDescription></div><Select className="w-auto min-w-[150px]" aria-label="Filter message activity" value={activityFilter} onChange={(event) => setActivityFilter(event.target.value)}><option value="all">All activity</option><option value="queued">Queued</option><option value="sent">Send records</option><option value="dry-run">Dry runs</option><option value="failed">Failed</option><option value="skipped">Skipped</option></Select></CardHeader>
        {messages.isLoading ? <div className="space-y-3 p-5" role="status" aria-label="Loading message activity"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div> : messages.isError ? <CardContent><Notice tone="error">{outreachError(messages.error, "We couldn't load message activity. Don't infer delivery from campaign status.")}</Notice><Button variant="outline" className="mt-3" disabled={messages.isFetching} onClick={() => messages.refetch()}>Retry activity log</Button></CardContent> : !messages.data?.length ? <Empty className="m-5 border-0 py-10" title="No messages queued yet" hint="Review your sequence, choose the claimed leads, and confirm queueing when you're ready. Queueing can enable sending." icon={<Send className="size-5" />} /> : !outgoingRows.length ? <Empty className="m-5 border-0 py-10" title="No activity in this state" hint="Show all activity to see the campaign's recorded messages." icon={<ListChecks className="size-5" />} action={<Button variant="outline" onClick={() => setActivityFilter("all")}>Show all activity</Button>} /> : <>
          <Table><thead className="bg-muted/20"><tr><Th className="pl-5">Recipient</Th><Th>Step</Th><Th>Outcome</Th><Th>Message</Th><Th className="pr-5">Timing</Th></tr></thead><tbody>{outgoingRows.map((message) => {
            const recipient = knownRecipients.get(message.lead_id);
            const presentation = messagePresentation(message);
            return <tr key={message.id} className="hover:bg-muted/15"><Td className="min-w-[150px] pl-5"><Link href={`/leads/${message.lead_id}`} className="text-sm font-medium hover:text-primary">{recipient?.company ?? "View lead"}</Link>{recipient?.contact?.name ? <p className="mt-1 text-xs text-muted-foreground">{recipient.contact.name}</p> : null}</Td><Td className="text-xs tabular-nums">{message.step_no.toString().padStart(2, "0")}</Td><Td><Badge tone={presentation.tone} title={presentation.hint}>{presentation.label}</Badge></Td><Td className="min-w-[240px] max-w-[440px]"><details><summary className="cursor-pointer list-none text-sm"><span className="line-clamp-2 whitespace-pre-wrap leading-relaxed">{message.body}</span><span className="mt-1 inline-block text-[11px] font-medium text-primary">Read full message</span></summary><p className="mt-2 whitespace-pre-wrap break-words rounded-lg border bg-background/40 p-3 text-sm leading-relaxed">{message.body}</p></details><p className={cn("mt-2 text-[11px] leading-relaxed text-muted-foreground", message.status === "failed" && "text-destructive")}>{presentation.hint}</p></Td><Td className="whitespace-nowrap pr-5 text-xs text-muted-foreground"><p>{conversationDate(message.sent_at ?? message.scheduled_at)}</p><p className="mt-1 text-[11px]">{message.sent_at ? "Send recorded" : message.status === "queued" ? "Scheduled time" : "Recorded schedule"}</p></Td></tr>;
          })}</tbody></Table>
          <div className="flex flex-wrap justify-between gap-2 border-t px-5 py-3 text-xs text-muted-foreground"><span>{outgoingRows.length} {outgoingRows.length === 1 ? "record" : "records"} shown · Up to 100 most recent records</span><Link href="/replies" className="inline-flex items-center gap-1.5 font-medium hover:text-primary">Open conversations<ArrowUpRight className="size-3.5" aria-hidden /></Link></div>
        </>}
      </Card>

      <OutreachConfirmation open={!!confirmation} onOpenChange={(open) => { if (!open) { setConfirmation(null); setActionError(null); } }} action={confirmation?.action ?? "send"} campaignName={data.name} scope={confirmation?.scope ?? ""} pending={actionPending} error={actionError} dryRun={dryRun} onConfirm={confirmAction} />
    </div>
  );
}

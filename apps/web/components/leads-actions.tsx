"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, FileSpreadsheet, ShieldCheck, Upload } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";

import { Avatar, Button, Dialog, Input, Label, Notice, Skeleton, Textarea } from "@/components/ui";
import { api, ApiError, type Lead } from "@/lib/api";
import { canClaimLead, claimQuote, notFitReasonError, validateTargetCsv } from "@/lib/lead-helpers";

type LeadActionProps = {
  lead: Lead | null;
  onOpenChange: (open: boolean) => void;
  onComplete: (message: string) => void;
};

function actionError(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function LeadIdentity({ lead }: { lead: Lead }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-muted/25 p-3">
      <Avatar name={lead.company} />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{lead.company}</p>
        <p className="truncate text-xs text-muted-foreground">{lead.domain}</p>
      </div>
    </div>
  );
}

export function ClaimLeadDialog({ lead, onOpenChange, onComplete }: LeadActionProps) {
  const queryClient = useQueryClient();
  const credits = useQuery({ queryKey: ["credits"], queryFn: api.credits, enabled: Boolean(lead) });
  const quote = credits.data ? claimQuote(credits.data) : null;
  const claim = useMutation({
    mutationFn: async ({ id, reviewedCredits }: { id: string; reviewedCredits: number }) => {
      const [currentLead, currentBalance] = await Promise.all([api.lead(id), api.credits()]);
      queryClient.setQueryData(["lead", id], currentLead);
      queryClient.setQueryData(["credits"], currentBalance);
      if (!canClaimLead(currentLead)) {
        queryClient.invalidateQueries({ queryKey: ["leads"] });
        throw new ApiError(409, "claim_unavailable", "This lead can no longer be claimed. Its status has changed.");
      }
      const currentQuote = claimQuote(currentBalance);
      if (!currentQuote || !currentQuote.canAfford) {
        throw new ApiError(409, "insufficient_credits", "There are not enough credits for this claim.");
      }
      if (currentQuote.credits > reviewedCredits) {
        throw new ApiError(409, "claim_price_changed", "The free allowance or price changed. Review the updated cost and confirm again.");
      }
      return api.claim(id);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["lead", result.lead.id] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["credits"] });
      onComplete(result.was_free
        ? `Claimed ${result.lead.company} using the free allowance. ${result.credits_remaining} credits remain.`
        : `Claimed ${result.lead.company} for ${result.credits_charged} credit${result.credits_charged === 1 ? "" : "s"}. ${result.credits_remaining} credits remain.`);
      onOpenChange(false);
    },
  });
  const { reset } = claim;
  useEffect(() => { reset(); }, [lead?.id, reset]);

  return (
    <Dialog
      open={Boolean(lead)}
      className="rounded-xl"
      onOpenChange={(open) => { if (!claim.isPending) onOpenChange(open); }}
      title="Claim this lead"
      description="A claim makes this lead available for draft outreach. It does not send a message."
      footer={
        <div className="flex w-full flex-wrap justify-end gap-2">
          <Button variant="ghost" disabled={claim.isPending} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={claim.isPending || credits.isFetching || !quote?.canAfford || !lead || !canClaimLead(lead)}
            onClick={() => { if (lead && quote) claim.mutate({ id: lead.id, reviewedCredits: quote.credits }); }}
          >
            {claim.isPending ? "Claiming…" : quote?.free ? "Confirm free claim" : `Claim · ${quote?.credits ?? "—"} credit${quote?.credits === 1 ? "" : "s"}`}
            {!claim.isPending ? <ArrowRight className="size-4" aria-hidden /> : null}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {lead ? <LeadIdentity lead={lead} /> : null}
        {credits.isLoading ? <Skeleton className="h-24 w-full" /> : credits.isError || !quote ? (
          <Notice tone="error">
            Could not check the current claim cost. <button className="font-medium underline" onClick={() => credits.refetch()}>Try again</button>.
          </Notice>
        ) : (
          <div className="rounded-xl border p-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Current claim cost</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">{quote.free ? "Free" : `${quote.credits} credit${quote.credits === 1 ? "" : "s"}`}</p>
              </div>
              <p className="text-sm text-muted-foreground">{credits.data?.balance} credits available</p>
            </div>
            <p className="mt-3 border-t pt-3 text-xs leading-relaxed text-muted-foreground">
              {quote.free
                ? `${credits.data?.free_leads_remaining} free claim${credits.data?.free_leads_remaining === 1 ? "" : "s"} currently remain. The API applies the allowance at claim time.`
                : "The API calculates the final charge when you confirm. Claims are not refunded by marking a lead not a fit."}
            </p>
          </div>
        )}
        {quote && !quote.canAfford ? (
          <Notice tone="info">
            You need more credits to claim this lead. <Link href="/credits" className="font-medium underline">Review credits</Link>.
          </Notice>
        ) : null}
        {claim.isError ? <Notice tone="error">{actionError(claim.error, "Could not claim this lead. Please try again.")}</Notice> : null}
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4 shrink-0" aria-hidden /> No campaign is activated and nothing is sent.</p>
      </div>
    </Dialog>
  );
}

export function NotFitLeadDialog({ lead, onOpenChange, onComplete }: LeadActionProps) {
  const queryClient = useQueryClient();
  const reasonId = useId();
  const [reason, setReason] = useState("");
  const reasonError = notFitReasonError(reason);
  const notFit = useMutation({
    mutationFn: ({ id, reason: feedback }: { id: string; reason: string }) => {
      const error = notFitReasonError(feedback);
      if (error) throw new ApiError(400, "reason_required", error);
      return api.notFit(id, feedback.trim());
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["lead", result.id] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      onComplete(`Archived ${result.company} as not a fit. Your reason was saved for future qualification.`);
      onOpenChange(false);
    },
  });
  const { reset } = notFit;
  useEffect(() => { setReason(""); reset(); }, [lead?.id, reset]);

  return (
    <Dialog
      open={Boolean(lead)}
      className="rounded-xl"
      onOpenChange={(open) => { if (!notFit.isPending) onOpenChange(open); }}
      title="Why is this lead not a fit?"
      description="This archives the lead and stores your feedback for future qualification. It does not refund a claim."
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="ghost" disabled={notFit.isPending} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={notFit.isPending || Boolean(reasonError) || !lead}
            onClick={() => { if (lead) notFit.mutate({ id: lead.id, reason }); }}
          >
            {notFit.isPending ? "Saving…" : "Save reason & archive"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {lead ? <LeadIdentity lead={lead} /> : null}
        <div className="space-y-2">
          <Label htmlFor={reasonId}>Reason <span className="font-normal text-muted-foreground">(required)</span></Label>
          <Textarea
            id={reasonId}
            autoFocus
            required
            rows={4}
            maxLength={500}
            placeholder="For example: outside our industry, too small, or no relevant buying signal."
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            aria-describedby={`${reasonId}-hint`}
            disabled={notFit.isPending}
          />
          <div id={`${reasonId}-hint`} className="flex justify-between gap-3 text-xs text-muted-foreground">
            <span>A specific reason makes the feedback useful.</span><span className="tabular-nums">{reason.length}/500</span>
          </div>
        </div>
        {notFit.isError ? <Notice tone="error">{actionError(notFit.error, "Could not save your feedback. Please try again.")}</Notice> : null}
      </div>
    </Dialog>
  );
}

export function ImportTargetsDialog({
  open,
  onOpenChange,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const csvId = useId();
  const [text, setText] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const preview = useMemo(() => {
    if (!text.trim()) return { csv: null, rowCount: 0, error: null };
    try {
      return { ...validateTargetCsv(text), error: null };
    } catch (error) {
      return { csv: null, rowCount: 0, error: error instanceof Error ? error.message : "Check your target CSV." };
    }
  }, [text]);
  const importTargets = useMutation({
    mutationFn: (csv: string) => api.importTargets(validateTargetCsv(csv).csv),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["targets"] });
      setText("");
      setFileError(null);
      onComplete(`Imported ${result.added} target compan${result.added === 1 ? "y" : "ies"}; ${result.skipped} skipped. Run Find leads when you are ready to look for evidence.`);
      onOpenChange(false);
    },
  });
  const { reset } = importTargets;
  useEffect(() => { reset(); }, [open, reset]);

  return (
    <Dialog
      open={open}
      className="rounded-xl"
      onOpenChange={(nextOpen) => { if (!importTargets.isPending && !reading) onOpenChange(nextOpen); }}
      title="Import target companies"
      description="Add companies to your target watchlist, not to your qualified leads. Importing does not start a search or outreach."
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="ghost" disabled={importTargets.isPending || reading} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={importTargets.isPending || reading || !preview.csv}
            onClick={() => importTargets.mutate(text)}
          >
            <Upload className="size-4" aria-hidden />
            {importTargets.isPending ? "Importing…" : `Import ${preview.rowCount || ""} target${preview.rowCount === 1 ? "" : "s"}`}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-3 rounded-xl border bg-muted/25 p-3">
          <FileSpreadsheet className="mt-0.5 size-4 shrink-0 text-signal" aria-hidden />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Include a <code className="text-foreground">company,domain</code> header. Optional target columns: country, employer, news_query, careers_url. Duplicates are skipped by the API.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${csvId}-file`}>Choose a target CSV <span className="font-normal text-muted-foreground">or paste below</span></Label>
          <Input
            id={`${csvId}-file`}
            type="file"
            accept=".csv,text/csv"
            className="h-auto py-2 text-xs file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1 file:text-xs file:font-medium file:text-foreground"
            disabled={importTargets.isPending || reading}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setFileError(null);
              setReading(true);
              try {
                if (file.size > 100_000) throw new Error("Choose a smaller CSV. The import API is designed for small target lists.");
                setText(await file.text());
              } catch (error) {
                setFileError(error instanceof Error ? error.message : "Could not read this file.");
              } finally {
                setReading(false);
              }
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={csvId}>Target CSV</Label>
          <Textarea
            id={csvId}
            rows={6}
            className="font-mono text-xs"
            placeholder={"company,domain,country\nAcme Corp,acme.com,US\nGlobex,globex.io,GB"}
            value={text}
            disabled={importTargets.isPending || reading}
            onChange={(event) => { setText(event.target.value); setFileError(null); }}
            aria-describedby={`${csvId}-preview`}
          />
          <div id={`${csvId}-preview`} aria-live="polite">
            {reading ? <p className="text-xs text-muted-foreground">Reading CSV…</p> : preview.error ? (
              <p className="text-xs leading-relaxed text-destructive">{preview.error}</p>
            ) : preview.csv ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Check className="size-3.5 text-signal" aria-hidden /> {preview.rowCount} target compan{preview.rowCount === 1 ? "y" : "ies"} ready to import.</p>
            ) : <p className="text-xs text-muted-foreground">Use a small CSV with a header; no leads will be created by this import.</p>}
          </div>
        </div>
        {fileError ? <Notice tone="error">{fileError}</Notice> : null}
        {importTargets.isError ? <Notice tone="error">{actionError(importTargets.error, "Could not import the target companies. Please try again.")}</Notice> : null}
      </div>
    </Dialog>
  );
}

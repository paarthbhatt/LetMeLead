"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight, ExternalLink, FileSearch, Globe, Mail, Send, ShieldCheck, VolumeX } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { ClaimLeadDialog, NotFitLeadDialog } from "@/components/leads-actions";
import { EvidenceTimeline } from "@/components/leads-evidence";
import { ReachOutDialog } from "@/components/leads-reach-out";
import { PageHeader } from "@/components/shell";
import { Avatar, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Empty, Notice, Skeleton, StatusBadge } from "@/components/ui";
import { api, ApiError, type Lead } from "@/lib/api";
import { canClaimLead, companyWebsite, confidenceLabel, emailHref, fitLabel, isDraftEligible, leadContactSummary, qualificationLimitations, safeExternalUrl, scoreLabel } from "@/lib/lead-helpers";
import { ageLabel, shortDate } from "@/lib/utils";

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const [claimLead, setClaimLead] = useState<Lead | null>(null);
  const [notFitLead, setNotFitLead] = useState<Lead | null>(null);
  const [reachOutOpen, setReachOutOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const lead = useQuery({ queryKey: ["lead", params.id], queryFn: () => api.lead(params.id) });
  const backLink = <Link href="/leads" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline"><ArrowLeft className="size-3.5" aria-hidden /> All leads</Link>;

  if (lead.isLoading) {
    return <div className="space-y-5" role="status" aria-label="Loading lead profile">{backLink}<Skeleton className="h-16 w-full" /><div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-72 lg:col-span-2" /><Skeleton className="h-72" /></div><Skeleton className="h-56 w-full" /></div>;
  }
  if (!lead.data) {
    const notFound = lead.error instanceof ApiError && lead.error.status === 404;
    return (
      <div className="space-y-5">
        {backLink}
        <Empty
          icon={<FileSearch className="size-5" aria-hidden />}
          title={notFound ? "Lead not found" : "Could not load this lead"}
          hint={notFound ? "It may have been removed or belong to another workspace." : lead.error instanceof ApiError ? lead.error.message : "Check your connection and try again."}
          action={!notFound ? <Button variant="outline" onClick={() => lead.refetch()} disabled={lead.isFetching}>Try again</Button> : undefined}
        />
      </div>
    );
  }

  const data = lead.data;
  const website = companyWebsite(data.domain);
  const contactSummary = leadContactSummary(data);
  const companyEmail = emailHref(data.email);
  const limitations = qualificationLimitations(data.fit_evidence);
  const eligible = isDraftEligible(data);
  const claimable = canClaimLead(data);

  return (
    <div className="space-y-5">
      {backLink}
      <PageHeader
        title={data.company}
        description="A closer look at the company, the timing, and the evidence behind the match."
        actions={
          <div className="flex flex-wrap gap-2">
            {claimable ? <Button onClick={() => setClaimLead(data)}>Review claim <ArrowUpRight className="size-4" aria-hidden /></Button> : null}
            {eligible ? <Button onClick={() => setReachOutOpen(true)}><Send className="size-4" aria-hidden /> Reach out</Button> : null}
            {data.fit !== "not_fit" ? <Button variant="outline" onClick={() => setNotFitLead(data)}><VolumeX className="size-4" aria-hidden /> Not a fit</Button> : null}
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar name={data.company} />
          <div>
            {website ? <a href={website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline">{data.domain}<ExternalLink className="size-3" aria-hidden /></a> : <p className="text-sm text-muted-foreground">Website not supplied</p>}
            <p className="mt-1 text-[11px] text-muted-foreground">Found {shortDate(data.created_at)}{data.claimed_at ? ` · Claimed ${shortDate(data.claimed_at)}` : ""}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2"><StatusBadge status={data.status} /><Badge tone={data.fit === "not_fit" ? "danger" : "muted"}>{fitLabel(data.fit)}</Badge></div>
      </div>

      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {lead.isError ? <Notice tone="error">Could not refresh this profile. Showing the last loaded information.</Notice> : null}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <Card className="rounded-xl shadow-none">
            <CardHeader>
              <CardTitle>Why this lead is on your radar</CardTitle>
              <CardDescription>What happened, and why the timing may be relevant to your offer.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <p className="text-base leading-7">{data.reason || "No reason has been recorded. Inspect the source evidence before deciding whether this is a useful lead."}</p>
              <div className="grid grid-cols-2 gap-4 border-y py-4 sm:grid-cols-3">
                <div>
                  <p className="text-[11px] text-muted-foreground">Evidence score</p>
                  <p className="mt-1 text-xl font-semibold tracking-tight tabular-nums">{scoreLabel(data.score)}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">Not a purchase probability</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">Signal age</p>
                  <p className="mt-2 text-sm font-medium">{ageLabel(data.signal_age_days)}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{data.signal_at ? shortDate(data.signal_at) : "Publication date not supplied"}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">Verification</p>
                  <Badge className="mt-2" tone={data.verification_status === "verified" ? "success" : data.verification_status === "rejected" ? "danger" : "muted"}>{data.verification_status.replaceAll("_", " ")}</Badge>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Qualification</h3>
                  <span className="text-xs text-muted-foreground">Confidence {confidenceLabel(data.fit_confidence)}</span>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">{data.fit_reason || "No qualification reason has been recorded yet. Fit is not a guarantee that this company needs your offer."}</p>
                {limitations.length ? (
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <p className="text-xs font-medium">What the evidence cannot tell us</p>
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-muted-foreground">{limitations.map((limitation, index) => <li key={`${index}-${limitation}`}>{limitation}</li>)}</ul>
                  </div>
                ) : null}
                {Object.keys(data.fit_evidence).length ? (
                  <details className="border-t pt-3">
                    <summary className="cursor-pointer text-xs font-medium text-signal hover:underline">Inspect qualification record</summary>
                    <pre className="mt-3 max-h-64 overflow-auto rounded-lg border bg-muted/20 p-3 text-[11px] leading-relaxed text-muted-foreground">{JSON.stringify(data.fit_evidence, null, 2)}</pre>
                  </details>
                ) : null}
              </div>
              <p className="flex items-start gap-2 border-t pt-3 text-xs leading-relaxed text-muted-foreground"><ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Signals show timing, not intent to buy. Read the public source before making a decision.</p>
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-xl shadow-none">
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div className="space-y-1"><CardTitle>Evidence timeline</CardTitle><CardDescription>Newest dated evidence first. Each available link opens the public source.</CardDescription></div>
              <Badge tone="muted">{data.evidence.length} record{data.evidence.length === 1 ? "" : "s"}</Badge>
            </CardHeader>
            <EvidenceTimeline evidence={data.evidence} />
          </Card>

          {data.fit !== "not_fit" ? (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-5">
              <div><h2 className="text-sm font-semibold">Help improve future matches</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Not the right company? Save a specific reason and archive this lead.</p></div>
              <Button variant="outline" size="sm" onClick={() => setNotFitLead(data)}><VolumeX className="size-3.5" aria-hidden /> Mark not a fit</Button>
            </div>
          ) : null}
        </div>

        <aside className="space-y-5" aria-label="Lead contacts and next steps">
          <Card className="rounded-xl shadow-none">
            <CardHeader><CardTitle>People & contact</CardTitle><CardDescription>Names and roles are shown only when a source provided them.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              {data.contacts.length ? (
                <div className="space-y-3">
                  {data.contacts.map((contact) => {
                    const profile = safeExternalUrl(contact.linkedin_url);
                    const email = emailHref(contact.email);
                    const name = contact.name?.trim();
                    const title = contact.title?.trim();
                    return (
                      <div key={contact.id} className="space-y-3 rounded-xl border p-3">
                        <div className="flex items-start gap-2.5">
                          <Avatar name={name || title || data.company} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{name || title || contact.email || "Unnamed contact"}</p>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{name ? title || "Role not stated" : "Name not stated in source"}</p>
                          </div>
                        </div>
                        {contact.email ? email ? <a href={email} className="block break-all text-xs hover:underline">{contact.email}</a> : <p className="break-all text-xs text-muted-foreground">{contact.email}</p> : null}
                        {contact.phone ? <p className="break-all text-xs text-muted-foreground">Phone: {contact.phone}</p> : null}
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={contact.verified ? "success" : "muted"}>{contact.verified ? "Verified" : "Unverified"}</Badge>
                          <span className="text-[11px] text-muted-foreground">Confidence {confidenceLabel(contact.confidence)}</span>
                          {profile ? <a href={profile} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-signal hover:underline">Profile<ExternalLink className="size-3" aria-hidden /></a> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border bg-muted/20 p-3">
                  <p className="text-sm font-medium">{contactSummary.label}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{contactSummary.detail}. Review the company website or public evidence to identify the right person.</p>
                </div>
              )}
              {(website || companyEmail || contactSummary.linkedinUrl) ? (
                <div className="space-y-2 border-t pt-3">
                  <p className="text-[11px] font-medium text-muted-foreground">Other available channels</p>
                  {website ? <a href={website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs hover:underline"><Globe className="size-3.5 text-muted-foreground" aria-hidden /> Company website<ExternalLink className="ml-auto size-3 text-muted-foreground" aria-hidden /></a> : null}
                  {companyEmail ? <a href={companyEmail} className="flex items-start gap-2 break-all text-xs hover:underline"><Mail className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />{data.email}</a> : null}
                  {contactSummary.linkedinUrl ? <a href={contactSummary.linkedinUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs hover:underline"><ExternalLink className="size-3.5 text-muted-foreground" aria-hidden /> LinkedIn</a> : null}
                </div>
              ) : null}
              <p className="border-t pt-3 text-[11px] leading-relaxed text-muted-foreground">Contact details are not consent to outreach. Verify the recipient and review the message before sending.</p>
            </CardContent>
          </Card>

          <Card className="rounded-xl shadow-none">
            <CardHeader><CardTitle>Your next step</CardTitle><CardDescription>A deliberate action, never an automatic send.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {eligible ? <><p className="text-xs leading-relaxed text-muted-foreground">This lead is claimed. Review it and create a preview-only campaign draft when you are ready.</p><Button className="w-full" onClick={() => setReachOutOpen(true)}><Send className="size-4" aria-hidden /> Review outreach draft</Button></> : claimable ? <><p className="text-xs leading-relaxed text-muted-foreground">Evidence is available to inspect now. Review the claim cost before adding this lead to draft outreach.</p><Button className="w-full" variant="outline" onClick={() => setClaimLead(data)}>Review claim cost <ArrowUpRight className="size-4" aria-hidden /></Button></> : <p className="text-xs leading-relaxed text-muted-foreground">{data.fit === "not_fit" ? "This lead is marked not a fit and excluded from draft outreach." : `This lead is ${data.status}. Draft outreach here is limited to leads currently in claimed status.`}</p>}
            </CardContent>
          </Card>
        </aside>
      </div>

      <ClaimLeadDialog lead={claimLead} onOpenChange={(open) => { if (!open) setClaimLead(null); }} onComplete={setNotice} />
      <NotFitLeadDialog lead={notFitLead} onOpenChange={(open) => { if (!open) setNotFitLead(null); }} onComplete={setNotice} />
      <ReachOutDialog open={reachOutOpen} leads={[data]} onOpenChange={setReachOutOpen} onComplete={setNotice} />
    </div>
  );
}

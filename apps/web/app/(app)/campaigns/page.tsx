"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, ChevronRight, FilePenLine, GitBranch, Pause, Play, Plus, Search, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";

import { OutreachConfirmation } from "@/components/outreach-confirmation";
import { PageHeader } from "@/components/shell";
import {
  Button,
  Card,
  CardContent,
  Dialog,
  Empty,
  Input,
  Label,
  Notice,
  Skeleton,
  Stat,
  StatusBadge,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { api, type Campaign } from "@/lib/api";
import { campaignStateHint, filterCampaigns, outreachError, type CampaignFilter, type OutreachNotice } from "@/lib/outreach-campaigns";
import { cn, shortDate } from "@/lib/utils";

export default function CampaignsPage() {
  const queryClient = useQueryClient();
  const createFormId = useId();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<CampaignFilter>("all");
  const [notice, setNotice] = useState<OutreachNotice | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [resumeTarget, setResumeTarget] = useState<Campaign | null>(null);

  const campaigns = useQuery({ queryKey: ["campaigns"], queryFn: api.campaigns });
  const create = useMutation({
    mutationFn: (campaignName: string) => api.createCampaign({ name: campaignName }),
    onSuccess: () => {
      setName("");
      setCreateOpen(false);
      setCreateError(null);
      setSearch("");
      setStatus("draft");
      setNotice({ tone: "success", text: "Draft created. Open it to shape your sequence; no messages were queued or sent." });
      return queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (error) => setCreateError(outreachError(error, "We couldn't create this draft. Please try again.")),
  });
  const pause = useMutation({
    mutationFn: (id: string) => api.pauseCampaign(id, "Paused from the campaigns dashboard"),
    onSuccess: () => {
      setNotice({ tone: "success", text: "Campaign paused. Queued messages are kept; a send already in progress may finish." });
      return queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (error) => setNotice({ tone: "error", text: outreachError(error, "We couldn't pause this campaign. Its status has not been confirmed.") }),
  });
  const resume = useMutation({
    mutationFn: (id: string) => api.resumeCampaign(id),
    onSuccess: () => {
      setResumeTarget(null);
      setActionError(null);
      setNotice({ tone: "success", text: "Campaign is active again. Eligible queued messages may now send automatically; this is not a delivery confirmation." });
      return queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (error) => setActionError(outreachError(error, "We couldn't resume this campaign. Please review its current status.")),
  });

  const rows = filterCampaigns(campaigns.data ?? [], search, status);
  const count = (state: string) => campaigns.data?.filter((campaign) => campaign.status === state).length ?? "—";
  const filters: { value: CampaignFilter; label: string }[] = [
    { value: "all", label: "All campaigns" }, { value: "active", label: "Active" },
    { value: "draft", label: "Drafts" }, { value: "paused", label: "Paused" },
    ...(campaigns.data?.some((campaign) => campaign.status === "completed") ? [{ value: "completed" as const, label: "Completed" }] : []),
  ];
  const actionPending = pause.isPending || resume.isPending;

  function openCreate() {
    setCreateError(null);
    setCreateOpen(true);
  }

  function clearFilters() {
    setSearch("");
    setStatus("all");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaigns"
        description="Thoughtful outreach, grounded in a reason to reach out."
        actions={<Button onClick={openCreate}><Plus className="size-4" aria-hidden />New campaign</Button>}
      />

      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Total campaigns" value={campaigns.data?.length ?? "—"} hint="Your outreach workspace" icon={<GitBranch className="size-4" />} />
        <Stat label="Active" value={count("active")} hint="Eligible messages may send" icon={<Play className="size-4" />} />
        <Stat label="Drafts" value={count("draft")} hint="Ready to review and refine" icon={<FilePenLine className="size-4" />} />
        <Stat label="Paused" value={count("paused")} hint="Outreach safely on hold" icon={<Pause className="size-4" />} />
      </div>

      <Card className="overflow-hidden rounded-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b p-4 sm:p-5">
          <div className="flex flex-wrap gap-1" role="group" aria-label="Filter campaigns by status">
            {filters.map((filter) => (
              <Button
                key={filter.value}
                size="sm"
                variant="ghost"
                aria-pressed={status === filter.value}
                className={cn("h-9 text-muted-foreground", status === filter.value && "bg-primary/10 text-primary hover:bg-primary/15")}
                onClick={() => setStatus(filter.value)}
              >{filter.label}</Button>
            ))}
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9 pr-9" placeholder="Search campaigns…" aria-label="Search campaigns" />
            {search ? <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground" onClick={() => setSearch("")} aria-label="Clear campaign search"><X className="size-3.5" aria-hidden /></button> : null}
          </div>
        </div>

        {campaigns.isError ? (
          <CardContent>
            <Notice tone="error">{outreachError(campaigns.error, "We couldn't load your campaigns.")}{campaigns.data ? " Showing the last loaded list." : ""}</Notice>
            <Button className="mt-3" variant="outline" onClick={() => campaigns.refetch()} disabled={campaigns.isFetching}>Try again</Button>
          </CardContent>
        ) : null}

        {campaigns.isLoading ? (
          <div className="space-y-4 p-5" role="status" aria-label="Loading campaigns">
            <span className="sr-only">Loading your campaigns…</span>
            {[0, 1, 2].map((index) => <Skeleton key={index} className="h-[76px] w-full rounded-xl" />)}
          </div>
        ) : !campaigns.data ? null : !campaigns.data.length ? (
          <Empty className="m-5 border-0 py-14" title="A good conversation starts with a reason" hint="Create a draft, shape your sequence, then choose the claimed leads you'd like to reach. You're in control of when outreach starts." icon={<GitBranch className="size-6" />} action={<Button onClick={openCreate}><Plus className="size-4" aria-hidden />Create your first campaign</Button>} />
        ) : !rows.length ? (
          <Empty className="m-5 border-0 py-12" title="No campaigns match" hint="Try a different name or show all campaign states." icon={<Search className="size-5" />} action={<Button variant="outline" onClick={clearFilters}>Clear filters</Button>} />
        ) : (
          <>
            <Table>
              <thead className="bg-muted/20">
                <tr><Th className="pl-5">Campaign</Th><Th>Status</Th><Th>Daily limit</Th><Th>Created</Th><Th className="pr-5 text-right">Actions</Th></tr>
              </thead>
              <tbody>
                {rows.map((campaign) => (
                  <tr key={campaign.id} className="transition-colors hover:bg-muted/20">
                    <Td className="min-w-[260px] pl-5">
                      <div className="flex items-center gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-muted/40 text-muted-foreground"><GitBranch className="size-4" aria-hidden /></span>
                        <div className="min-w-0">
                          <Link href={`/campaigns/${campaign.id}`} className="font-semibold hover:text-primary">{campaign.name}</Link>
                          <p className="mt-1 max-w-[320px] truncate text-xs text-muted-foreground" title={campaignStateHint(campaign)}>{campaignStateHint(campaign)}</p>
                        </div>
                      </div>
                    </Td>
                    <Td className="align-middle"><StatusBadge status={campaign.status} /></Td>
                    <Td className="whitespace-nowrap align-middle text-sm tabular-nums">{campaign.daily_cap ? <>{campaign.daily_cap}<span className="text-xs text-muted-foreground"> / day</span></> : <span className="text-xs text-muted-foreground">Account pacing</span>}</Td>
                    <Td className="whitespace-nowrap align-middle text-xs text-muted-foreground">{shortDate(campaign.created_at)}</Td>
                    <Td className="pr-5 align-middle">
                      <div className="flex items-center justify-end gap-2">
                        {campaign.status === "active" ? (
                          <Button size="sm" variant="outline" disabled={actionPending} onClick={() => { setNotice(null); pause.mutate(campaign.id); }}><Pause className="size-3" aria-hidden />{pause.isPending && pause.variables === campaign.id ? "Pausing…" : "Pause"}</Button>
                        ) : campaign.status === "paused" ? (
                          <Button size="sm" variant="outline" disabled={actionPending} onClick={() => { setActionError(null); setResumeTarget(campaign); }}><Play className="size-3" aria-hidden />Resume</Button>
                        ) : null}
                        <Link href={`/campaigns/${campaign.id}`} className="inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
                          {campaign.status === "draft" ? "Edit draft" : "Open"}<ChevronRight className="size-3.5" aria-hidden />
                        </Link>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3 text-xs text-muted-foreground"><span>{rows.length} {rows.length === 1 ? "campaign" : "campaigns"}</span><span>Newest first</span></div>
          </>
        )}
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <p className="flex items-center gap-2"><ShieldCheck className="size-4 text-primary" aria-hidden />Drafts let you review first. Queueing, starting, or resuming can enable sending.</p>
        <Link href="/linkedin" className="inline-flex items-center gap-1.5 font-medium hover:text-primary">Review LinkedIn account<ArrowUpRight className="size-3.5" aria-hidden /></Link>
      </div>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => { if (!create.isPending) setCreateOpen(open); }}
        title="Create a campaign"
        description="Start with a draft. Give it a clear name, then make the sequence your own."
        footer={<><Button variant="outline" disabled={create.isPending} onClick={() => setCreateOpen(false)}>Cancel</Button><Button type="submit" form={createFormId} disabled={create.isPending || !name.trim()}><Plus className="size-4" aria-hidden />{create.isPending ? "Creating draft…" : "Create draft"}</Button></>}
      >
        <form id={createFormId} className="space-y-5" onSubmit={(event) => { event.preventDefault(); if (name.trim() && !create.isPending) { setCreateError(null); create.mutate(name.trim()); } }}>
          <div className="space-y-2">
            <Label htmlFor="campaign-name">Campaign name</Label>
            <Input id="campaign-name" autoFocus required maxLength={160} value={name} disabled={create.isPending} onChange={(event) => setName(event.target.value)} placeholder="e.g. Q4 compliance conversations" aria-describedby="campaign-name-hint" />
            <p id="campaign-name-hint" className="text-xs text-muted-foreground">A market, signal, or objective makes it easy to find later.</p>
          </div>
          <div className="rounded-xl border bg-muted/30 p-4">
            <div className="flex items-center gap-2 text-sm font-medium"><GitBranch className="size-4 text-primary" aria-hidden />Two steps to start</div>
            <div className="mt-3 space-y-2.5 text-xs text-muted-foreground">
              <p className="flex items-center gap-2"><span className="flex size-5 items-center justify-center rounded bg-primary/10 font-medium text-primary">1</span>An evidence-led connection request</p>
              <p className="flex items-center gap-2"><span className="flex size-5 items-center justify-center rounded bg-muted font-medium">2</span>A considered follow-up message</p>
            </div>
          </div>
          <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />Creating a draft does not add recipients, queue messages, or send anything.</p>
          {createError ? <Notice tone="error">{createError}</Notice> : null}
        </form>
      </Dialog>

      <OutreachConfirmation open={!!resumeTarget} onOpenChange={(open) => { if (!open) setResumeTarget(null); }} action="resume" campaignName={resumeTarget?.name ?? ""} scope="Existing queued messages in this campaign. Resuming does not add new recipients." pending={resume.isPending} error={actionError} onConfirm={() => { if (resumeTarget && !resume.isPending) { setActionError(null); resume.mutate(resumeTarget.id); } }} />
    </div>
  );
}

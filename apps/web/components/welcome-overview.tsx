"use client";

import { ArrowRight, ArrowUpRight, Coins, Inbox, Radio, Send, Target, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Avatar, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Empty, Notice, Skeleton, Stat, StatusBadge } from "@/components/ui";
import type { Campaign, Lead, Page, Source } from "@/lib/api";
import { cn } from "@/lib/utils";
import { welcomeDate, welcomeNumber, welcomeSortedSources, welcomeSourceHealth, welcomeStatus, type WelcomeAction } from "./welcome-data";

export function WelcomeLink({ href, children, className, variant = "outline" }: { href: string; children: ReactNode; className?: string; variant?: "outline" | "primary" | "text" }) {
  return (
    <Link href={href} className={cn(
      "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition",
      variant === "text" ? "text-xs text-muted-foreground hover:text-foreground" : "min-h-10 px-4",
      variant === "outline" && "border bg-card hover:bg-muted",
      variant === "primary" && "bg-primary text-primary-foreground hover:opacity-90",
      className,
    )}>{children}</Link>
  );
}

export function WelcomeMetric({ title, value, hint, icon: Icon, href, loading, error }: {
  title: string;
  value: number | undefined;
  hint: string;
  icon: LucideIcon;
  href: string;
  loading: boolean;
  error: boolean;
}) {
  return (
    <Link href={href} className="group min-w-0 rounded-xl" aria-label={`${title}: ${loading ? "loading" : error ? "unavailable" : welcomeNumber(value)}`}>
      <Stat
        label={title}
        value={loading ? <Skeleton className="h-9 w-20" /> : error ? <span className="text-sm font-medium text-muted-foreground">Unavailable</span> : welcomeNumber(value)}
        hint={error ? "Refresh to try again." : hint}
        icon={<span className="flex items-center gap-3"><Icon className="size-4" /><ArrowUpRight className="size-3.5 text-muted-foreground/60 transition group-hover:text-foreground" /></span>}
        className="h-full rounded-xl shadow-none transition group-hover:border-foreground/20"
      />
    </Link>
  );
}

function WelcomeLoading({ label, rows = 3 }: { label: string; rows?: number }) {
  return <div role="status" aria-label={label} className="space-y-4 p-5">{Array.from({ length: rows }, (_, index) => <div key={index} className="flex gap-3"><Skeleton className="size-10 shrink-0 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-4/5" /></div></div>)}</div>;
}

function WelcomeLoadError({ label, onRetry }: { label: string; onRetry: () => void }) {
  return <div className="p-5"><Notice tone="error"><div className="space-y-3"><p className="text-sm font-medium">Could not load {label}.</p><p className="text-xs leading-5">Other sections can still be used. Retry this section to check for fresh data.</p><Button type="button" variant="outline" size="sm" onClick={onRetry}>Try again</Button></div></Notice></div>;
}

export function WelcomeNextActions({ actions, loading }: { actions: WelcomeAction[]; loading: boolean }) {
  const icons: Record<WelcomeAction["kind"], LucideIcon> = { brief: Target, replies: Inbox, sources: Radio, credits: Coins, leads: Users, campaigns: Send };
  return (
    <Card className="h-full rounded-xl shadow-none">
      <CardHeader className="border-0 pb-3"><p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Keep things moving</p><CardTitle>Your next moves</CardTitle><CardDescription className="text-xs">Based on what is in your workspace.</CardDescription></CardHeader>
      {loading && !actions.length ? <WelcomeLoading label="Loading next actions" /> : (
        <CardContent className="space-y-2 pt-1">
          {actions.map((action, index) => {
            const Icon = icons[action.kind];
            return <Link key={action.id} href={action.href} className={cn("group flex gap-3 rounded-xl border p-3.5 transition hover:border-foreground/20 hover:bg-muted/50", index === 0 && "bg-muted/40")}><span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-background"><Icon className="size-4 text-muted-foreground" aria-hidden /></span><div className="min-w-0 flex-1"><p className="text-xs font-semibold leading-5">{action.title}</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{action.hint}</p></div><ArrowUpRight className="mt-1 size-3.5 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden /></Link>;
          })}
          {!actions.length ? <p className="py-4 text-xs leading-6 text-muted-foreground">Refresh your workspace to load personalized next actions. You can always review <Link href="/leads" className="font-medium text-foreground underline underline-offset-4">leads</Link> or <Link href="/signals" className="font-medium text-foreground underline underline-offset-4">signal sources</Link>.</p> : null}
        </CardContent>
      )}
    </Card>
  );
}

function welcomeSignalAge(lead: Lead) {
  if (lead.signal_age_days === null || !Number.isFinite(lead.signal_age_days)) return "Undated signal";
  if (lead.signal_age_days < 0) return "Future-dated signal";
  if (lead.signal_age_days === 0) return "Signal today";
  return `${lead.signal_age_days} ${lead.signal_age_days === 1 ? "day" : "days"} old`;
}

export function WelcomeRecentLeads({ data, loading, error, onRetry, needsSetup }: { data: Page<Lead> | undefined; loading: boolean; error: boolean; onRetry: () => void; needsSetup: boolean }) {
  return (
    <Card className="h-full overflow-hidden rounded-xl shadow-none">
      <CardHeader className="flex-row items-center justify-between gap-3"><div><CardTitle>Recent leads</CardTitle><CardDescription className="mt-1 text-xs">The latest additions, with their reason to reach out.</CardDescription></div><WelcomeLink href="/leads" variant="text" className="shrink-0">View all<ArrowRight className="size-3.5" aria-hidden /></WelcomeLink></CardHeader>
      {loading ? <WelcomeLoading label="Loading recent leads" rows={4} /> : error ? <WelcomeLoadError label="recent leads" onRetry={onRetry} /> : !data?.items.length ? (
        <CardContent className="py-7"><Empty title="Your next good lead starts here" icon={Users} hint={needsSetup ? "Define your offer and buyers, then choose sources to find relevant signals." : "No leads have been recorded yet. Check your sources and run a scan. Results appear here when relevant evidence is found."} action={<WelcomeLink href={needsSetup ? "/onboarding" : "/signals"}>{needsSetup ? "Set up your buyers" : "Review signal sources"}<ArrowRight className="size-4" aria-hidden /></WelcomeLink>} /></CardContent>
      ) : (
        <ul className="divide-y">
          {data.items.map((lead) => (
            <li key={lead.id}><Link href={`/leads/${lead.id}`} className="group flex items-start gap-3 px-5 py-4 transition hover:bg-muted/40"><Avatar name={lead.company} className="size-10 rounded-xl border-input bg-muted/40 text-foreground" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><p className="truncate text-sm font-semibold">{lead.company}</p><span className="text-[11px] text-muted-foreground">{lead.domain}</span></div><p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{lead.reason || "Open this lead to review its evidence."}</p><div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground"><span>{welcomeSignalAge(lead)}</span><span>Added {welcomeDate(lead.created_at)}</span><span>{welcomeStatus(lead.status)}</span></div></div><div className="flex shrink-0 flex-col items-end gap-2"><Badge tone={lead.fit === "fit" ? "success" : lead.fit === "not_fit" ? "muted" : "warning"}>{lead.fit === "fit" ? "Buyer fit" : lead.fit === "not_fit" ? "Not a fit" : "Check fit"}</Badge><span className="text-[10px] text-muted-foreground">Score {Number.isFinite(lead.score) ? lead.score.toFixed(1) : "—"}</span><ArrowRight className="hidden size-3.5 text-muted-foreground/60 group-hover:text-foreground sm:block" aria-hidden /></div></Link></li>
          ))}
        </ul>
      )}
      {data?.next_cursor && !error ? <p className="border-t px-5 py-3 text-[11px] text-muted-foreground">Showing the {data.items.length} latest leads, not your full lead count.</p> : null}
    </Card>
  );
}

export function WelcomeSources({ sources, loading, error, onRetry }: { sources: Source[] | undefined; loading: boolean; error: boolean; onRetry: () => void }) {
  const enabled = sources?.filter((source) => source.enabled).length;
  return (
    <Card className="h-full overflow-hidden rounded-xl shadow-none">
      <CardHeader className="flex-row items-center justify-between gap-3"><div><CardTitle>Source health</CardTitle><CardDescription className="mt-1 text-xs">{sources && !error ? `${enabled} of ${sources.length} sources enabled` : "Last recorded scan results, source by source."}</CardDescription></div><WelcomeLink href="/signals" variant="text" className="shrink-0">Manage<ArrowUpRight className="size-3.5" aria-hidden /></WelcomeLink></CardHeader>
      {loading ? <WelcomeLoading label="Loading source health" /> : error ? <WelcomeLoadError label="source health" onRetry={onRetry} /> : !sources?.length ? (
        <CardContent><Empty title="No sources configured" icon={Radio} hint="Choose a signal feed before running your first scan." action={<WelcomeLink href="/signals">Explore signals<ArrowRight className="size-4" aria-hidden /></WelcomeLink>} /></CardContent>
      ) : (
        <><ul className="divide-y">{welcomeSortedSources(sources).slice(0, 5).map((source) => {
          const health = welcomeSourceHealth(source);
          return <li key={source.id} className="flex items-start justify-between gap-3 px-5 py-3.5"><div className="min-w-0"><p className="text-xs font-semibold">{source.name}</p><p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted-foreground" title={health.hint}>{health.hint}</p>{source.last_run_at ? <p className="mt-1 text-[10px] text-muted-foreground">Last successful scan: {welcomeDate(source.last_run_at)}</p> : null}</div><Badge tone={health.tone} className="mt-0.5 shrink-0">{health.label}</Badge></li>;
        })}</ul><p className="border-t px-5 py-3 text-[10px] leading-5 text-muted-foreground">{sources.length > 5 ? `Showing 5 of ${sources.length} sources. ` : ""}A successful past scan does not guarantee current availability.</p></>
      )}
    </Card>
  );
}

export function WelcomeCampaigns({ campaigns, loading, error, onRetry }: { campaigns: Campaign[] | undefined; loading: boolean; error: boolean; onRetry: () => void }) {
  const recent = [...(campaigns ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 3);
  return (
    <Card className="h-full rounded-xl shadow-none">
      <CardHeader className="flex-row items-center justify-between gap-3"><div><CardTitle>Outreach</CardTitle><CardDescription className="mt-1 text-xs">Your most recent campaigns.</CardDescription></div><WelcomeLink href="/campaigns" variant="text" className="shrink-0">View all<ArrowUpRight className="size-3.5" aria-hidden /></WelcomeLink></CardHeader>
      {loading ? <WelcomeLoading label="Loading campaigns" rows={2} /> : error ? <WelcomeLoadError label="campaigns" onRetry={onRetry} /> : !recent.length ? (
        <CardContent className="space-y-4"><div className="grid size-10 place-items-center rounded-xl border bg-muted/40"><Send className="size-4 text-muted-foreground" aria-hidden /></div><p className="text-sm font-semibold">A thoughtful first message.</p><p className="text-xs leading-6 text-muted-foreground">Claim a suitable lead, build a sequence, and review it before sending. No campaigns have been created yet.</p><WelcomeLink href="/campaigns">Explore campaigns<ArrowRight className="size-4" aria-hidden /></WelcomeLink></CardContent>
      ) : (
        <ul className="divide-y">{recent.map((campaign) => <li key={campaign.id}><Link href={`/campaigns/${campaign.id}`} className="block space-y-2 px-5 py-4 transition hover:bg-muted/40"><div className="flex items-start justify-between gap-3"><p className="min-w-0 truncate text-xs font-semibold">{campaign.name}</p><StatusBadge status={campaign.status} className="shrink-0" /></div><p className="text-[11px] leading-5 text-muted-foreground">{campaign.pause_reason || `Created ${welcomeDate(campaign.created_at)}`}</p></Link></li>)}</ul>
      )}
    </Card>
  );
}

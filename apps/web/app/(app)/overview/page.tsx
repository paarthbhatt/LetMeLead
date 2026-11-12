"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Coins, Inbox, Loader2, Radio, RefreshCw, Send, Target } from "lucide-react";
import { useState } from "react";

import { PageHeader } from "@/components/shell";
import { Button, Card } from "@/components/ui";
import { welcomeError, welcomeNextActions, welcomeNumber } from "@/components/welcome-data";
import { WelcomeCampaigns, WelcomeLink, WelcomeMetric, WelcomeNextActions, WelcomeRecentLeads, WelcomeSources } from "@/components/welcome-overview";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function OverviewPage() {
  const queryClient = useQueryClient();
  const tenant = useQuery({ queryKey: ["tenant"], queryFn: api.tenant });
  const stats = useQuery({ queryKey: ["stats"], queryFn: api.stats, staleTime: 30_000 });
  const leads = useQuery({ queryKey: ["leads", "overview"], queryFn: () => api.leads({ limit: 6 }), staleTime: 30_000 });
  const campaigns = useQuery({ queryKey: ["campaigns"], queryFn: api.campaigns, staleTime: 30_000 });
  const sources = useQuery({ queryKey: ["sources"], queryFn: api.sources, staleTime: 30_000 });
  const credits = useQuery({ queryKey: ["credits"], queryFn: api.credits, staleTime: 30_000 });
  const health = useQuery({ queryKey: ["health"], queryFn: api.health, staleTime: 60_000 });
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queries = [tenant, stats, leads, campaigns, sources, credits, health];
  const fetching = queries.some((query) => query.isFetching);
  const enabledSources = sources.data?.filter((source) => source.enabled).length ?? 0;
  const needsSetup = tenant.data?.onboarding_complete === false;
  const canScan = tenant.data?.onboarding_complete && !tenant.isError && !sources.isError && enabledSources > 0;
  const unavailable = [stats.isError && "statistics", leads.isError && "leads", campaigns.isError && "campaigns", sources.isError && "sources", credits.isError && "credits", tenant.isError && "buyer brief"].filter(Boolean);
  const actions = welcomeNextActions({
    tenant: tenant.isError ? undefined : tenant.data,
    stats: stats.isError ? undefined : stats.data,
    leads: leads.isError ? undefined : leads.data,
    campaigns: campaigns.isError ? undefined : campaigns.data,
    sources: sources.isError ? undefined : sources.data,
    credits: credits.isError ? undefined : credits.data,
  });

  const scan = useMutation({
    mutationFn: () => api.scan({ wait: false }),
    onMutate: () => { setNotice(null); setError(null); },
    onSuccess: async () => {
      setNotice("Scan requested. It runs in the background; refresh to check source results and new leads.");
      await Promise.all(["sources", "leads", "stats"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
    },
    onError: (err) => setError(welcomeError(err, "Could not start the scan. Please try again.")),
  });

  const runningCampaigns = campaigns.data?.filter((campaign) => campaign.status === "running").length;
  const drafts = campaigns.data?.filter((campaign) => campaign.status === "draft").length;
  const paused = campaigns.data?.filter((campaign) => campaign.status === "paused").length;

  return (
    <div className="space-y-6">
      <PageHeader title="Overview" description="See what is new, what needs attention, and where to go next." actions={
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={fetching} onClick={() => { void Promise.allSettled(queries.map((query) => query.refetch())); }}><RefreshCw className={cn("size-4", fetching && "animate-spin")} aria-hidden />{fetching ? "Refreshing…" : "Refresh"}</Button>
          {needsSetup ? <WelcomeLink href="/onboarding" variant="primary">Finish setup<ArrowRight className="size-4" aria-hidden /></WelcomeLink> : <Button type="button" disabled={!canScan || scan.isPending} title={!canScan ? "Save a buyer brief and enable at least one source before scanning." : undefined} onClick={() => scan.mutate()}>{scan.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Radio className="size-4" aria-hidden />}{scan.isPending ? "Requesting scan…" : "Run scan"}</Button>}
        </div>
      } />

      {unavailable.length ? <div role="alert" className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs leading-6 text-foreground">Some data could not be loaded: {unavailable.join(", ")}. The remaining sections are still available. Refresh to try again.</div> : null}
      {error ? <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-xs leading-6 text-destructive">{error}</div> : null}
      {notice ? <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/50 px-4 py-3"><p className="text-xs leading-6">{notice}</p><button type="button" onClick={() => setNotice(null)} className="text-xs font-semibold text-muted-foreground hover:text-foreground" aria-label="Dismiss scan notice">Dismiss</button></div> : null}

      {needsSetup ? <Card className="flex flex-wrap items-center gap-4 rounded-xl bg-muted/40 p-5 shadow-none"><span className="grid size-11 shrink-0 place-items-center rounded-xl border bg-background"><Target className="size-5 text-muted-foreground" aria-hidden /></span><div className="min-w-0 flex-1"><p className="text-sm font-semibold">Tell us what a good lead looks like.</p><p className="mt-1 text-xs leading-6 text-muted-foreground">Your offer, ideal buyers, and target companies give every signal the right context.</p></div><WelcomeLink href="/onboarding">Set up your buyers<ArrowRight className="size-4" aria-hidden /></WelcomeLink></Card> : null}

      <section aria-label="Workspace statistics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <WelcomeMetric title="Signals · last 7 days" value={stats.data?.signals_7d} hint="Recorded signals, not a prediction of demand." icon={Radio} href="/signals" loading={stats.isLoading} error={stats.isError} />
        <WelcomeMetric title="Unread replies" value={stats.data?.replies_unread} hint="Conversations waiting for your attention." icon={Inbox} href="/replies" loading={stats.isLoading} error={stats.isError} />
        <WelcomeMetric title="Running campaigns" value={runningCampaigns} hint={campaigns.data ? `${welcomeNumber(drafts)} drafts · ${welcomeNumber(paused)} paused` : "Campaigns currently marked as running."} icon={Send} href="/campaigns" loading={campaigns.isLoading} error={campaigns.isError} />
        <WelcomeMetric title="Credit balance" value={credits.data?.balance} hint={credits.data ? `${welcomeNumber(credits.data.free_leads_remaining)} free leads left · ${welcomeNumber(credits.data.lead_price_credits)} credits per claim` : "Your available balance and free lead allowance."} icon={Coins} href="/credits" loading={credits.isLoading} error={credits.isError} />
      </section>

      <div className="grid items-stretch gap-5 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2"><WelcomeRecentLeads data={leads.data} loading={leads.isLoading} error={leads.isError} onRetry={() => { void leads.refetch(); }} needsSetup={needsSetup} /></div>
        <WelcomeNextActions actions={actions} loading={queries.some((query) => query.isLoading)} />
        <div className="min-w-0 xl:col-span-2"><WelcomeSources sources={sources.data} loading={sources.isLoading} error={sources.isError} onRetry={() => { void sources.refetch(); }} /></div>
        <WelcomeCampaigns campaigns={campaigns.data} loading={campaigns.isLoading} error={campaigns.isError} onRetry={() => { void campaigns.refetch(); }} />
      </div>

      {health.data && !health.isError && (!health.data.providers.outreach_enabled || health.data.providers.outreach_dry_run) ? <p className="rounded-xl border bg-muted/30 px-4 py-3 text-[11px] leading-6 text-muted-foreground"><span className="font-semibold text-foreground">{!health.data.providers.outreach_enabled ? "Live outreach is disabled." : "Outreach is in dry-run mode."}</span> Campaign status does not mean messages are being delivered. Review <WelcomeLink href="/linkedin" variant="text" className="inline text-[11px] underline underline-offset-4">LinkedIn settings</WelcomeLink> before sending.</p> : null}
      <p className="text-[10px] leading-5 text-muted-foreground">Your workspace data, as recorded. Recent leads show the latest additions, not the full pipeline.</p>
    </div>
  );
}

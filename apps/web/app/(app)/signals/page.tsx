"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Layers3, Loader2, Network, Radio, RefreshCw, Search, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { PageHeader } from "@/components/shell";
import { SignalsCard } from "@/components/signals-card";
import { SignalsSources } from "@/components/signals-sources";
import { Badge, Button, Card, Empty, Input, Notice, Select, Skeleton } from "@/components/ui";
import { api, type SignalCatalog, type SignalDef } from "@/lib/api";
import {
  applySignalToggle,
  filterSignalCategories,
  isSignalAutomated,
  signalCounts,
  signalErrorMessage,
  signalSearchSources,
  sourceStatus,
  type SignalFilterStatus,
  type SignalView,
  type SourceLoadState,
} from "@/lib/signal-catalog";
import { cn } from "@/lib/utils";

type PageNotice = { tone: "success" | "info"; message: string; showLeads?: boolean };

export default function SignalsPage() {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<PageNotice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<SignalView>("yours");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState<SignalFilterStatus>("all");
  const [watchSourcesUntil, setWatchSourcesUntil] = useState<number | null>(null);

  const catalog = useQuery({ queryKey: ["signalCatalog"], queryFn: api.signalCatalog, retry: 1 });
  const sources = useQuery({
    queryKey: ["sources"],
    queryFn: api.sources,
    retry: 1,
    refetchInterval: watchSourcesUntil && Date.now() < watchSourcesUntil ? 5_000 : false,
  });

  useEffect(() => {
    if (!watchSourcesUntil) return;
    const timer = window.setTimeout(() => setWatchSourcesUntil(null), Math.max(0, watchSourcesUntil - Date.now()));
    return () => window.clearTimeout(timer);
  }, [watchSourcesUntil]);

  async function refreshSignalState() {
    const results = await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: ["signalCatalog"] }, { throwOnError: true }),
      queryClient.invalidateQueries({ queryKey: ["sources"] }, { throwOnError: true }),
    ]);
    return results.every((result) => result.status === "fulfilled");
  }

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean; label: string }) => api.setSignal(id, enabled),
    onMutate: async () => {
      setNotice(null);
      setError(null);
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ["signalCatalog"] }),
        queryClient.cancelQueries({ queryKey: ["sources"] }),
      ]);
    },
    onSuccess: async (data, variables) => {
      // Only display a new choice once the API has confirmed it. Keep all
      // switches disabled until BOTH the catalog and shared feeds refresh.
      queryClient.setQueryData<SignalCatalog>(["signalCatalog"], (current) => current ? applySignalToggle(current, data) : current);
      const refreshed = await refreshSignalState();
      setNotice(refreshed ? {
        tone: "success",
        message: `${variables.label} ${data.enabled ? "enabled" : "disabled"}. Shared feed settings saved; availability is shown separately below.`,
      } : {
        tone: "info",
        message: "Signal setting saved, but catalog or source status could not be refreshed. Retry before searching.",
      });
    },
    onError: async (err) => {
      setError(`Could not confirm the signal change. ${signalErrorMessage(err, "Check your connection and try again.")}`);
      await refreshSignalState();
    },
  });

  const findLeads = useMutation({
    mutationFn: ({ sources: kinds }: { sources: string[]; signalId?: string }) => {
      if (kinds.length === 0) throw new Error("No enabled shared source feeds were selected.");
      return api.scan({ sources: kinds, wait: false });
    },
    onMutate: () => {
      setNotice(null);
      setError(null);
    },
    onSuccess: async (data, variables) => {
      if (data.status === "started") setWatchSourcesUntil(Date.now() + 60_000);
      const results = await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ["sources"] }, { throwOnError: true }),
        queryClient.invalidateQueries({ queryKey: ["leads"] }, { throwOnError: true }),
      ]);
      const refreshed = results.every((result) => result.status === "fulfilled");
      setNotice({
        tone: "info",
        showLeads: true,
        message: `${data.status === "completed" ? "Search completed" : data.status === "started" ? "Search queued" : "Search request accepted"} for ${variables.sources.length} shared feed${variables.sources.length === 1 ? "" : "s"}. It checks saved target companies; new matches, if any, appear in Leads. ${refreshed ? "Source status refreshes for one minute after a queued search." : "Source status could not be refreshed. Use Refresh to retry."}`,
      });
    },
    onError: (err) => setError(`Could not confirm the search request. ${signalErrorMessage(err, "Check your connection and try again.")}`),
  });

  async function refresh() {
    if (toggle.isPending || findLeads.isPending) return;
    setError(null);
    setNotice(null);
    const refreshed = await refreshSignalState();
    if (refreshed) setNotice({ tone: "info", message: "Catalog choices and shared source settings refreshed." });
  }

  function clearFilters() {
    setSearch("");
    setCategory("all");
    setStatus("all");
  }

  if (!catalog.data && catalog.isPending) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Loading signals">
        <PageHeader title="Signals" description="Buying moments, backed by shared source evidence." />
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
        <div className="grid gap-3 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!catalog.data) {
    return (
      <div className="space-y-5">
        <PageHeader title="Signals" description="Buying moments, backed by shared source evidence." />
        <Notice tone="error">Could not load the signal catalog. {signalErrorMessage(catalog.error, "Check your connection and retry.")}</Notice>
        <Button variant="outline" onClick={() => void refresh()} disabled={catalog.isFetching || sources.isFetching}>
          <RefreshCw className="size-4" aria-hidden />
          Retry loading
        </Button>
      </div>
    );
  }

  const { categories } = catalog.data;
  const counts = signalCounts(categories);
  const allSignals = categories.flatMap((category) => category.signals);
  const shownCategories = filterSignalCategories(categories, { view, search, category, status });
  const shownCount = shownCategories.reduce((total, group) => total + group.signals.length, 0);
  const sourceState: SourceLoadState = sources.isPending ? "loading" : sources.isError ? "error" : "ready";
  const scanSources = signalSearchSources(allSignals, sources.data);
  const enabledFeedCount = sourceState === "ready" ? sources.data?.filter((source) => source.enabled).length ?? 0 : null;
  const feedIssues = sources.data?.filter((source) => sourceStatus(source, sourceState).needsAttention).length ?? 0;
  const controlsDisabled = toggle.isPending || findLeads.isPending || catalog.isFetching || catalog.isError;
  const searchesDisabled = controlsDisabled || sources.isFetching || sourceState !== "ready";
  const hasFilters = Boolean(search.trim()) || category !== "all" || status !== "all";

  function changeSignal(signal: SignalDef) {
    if (controlsDisabled || !isSignalAutomated(signal)) return;
    toggle.mutate({ id: signal.id, enabled: !signal.enabled, label: signal.label });
  }

  function requestSearch(kinds: string[], signalId?: string) {
    if (searchesDisabled || kinds.length === 0) return;
    findLeads.mutate({ sources: kinds, signalId });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Signals"
        description="Buying moments, backed by shared source evidence."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => void refresh()} disabled={toggle.isPending || findLeads.isPending || catalog.isFetching || sources.isFetching}>
              <RefreshCw className={cn("size-3.5", (catalog.isFetching || sources.isFetching) && "animate-spin")} aria-hidden />
              Refresh
            </Button>
            <Button disabled={searchesDisabled || scanSources.length === 0} onClick={() => requestSearch(scanSources)} title="Run the shared feeds used by your enabled signals against saved target companies.">
              {findLeads.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Radio className="size-4" aria-hidden />}
              {findLeads.isPending ? "Requesting…" : "Find leads"}
            </Button>
          </div>
        }
      />

      <section aria-label="Signal overview" className="grid gap-3 sm:grid-cols-3">
        <Card className="rounded-xl p-4 shadow-none">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Your signals</span>
            <Radio className="size-4 text-blue-600 dark:text-blue-400" aria-hidden />
          </div>
          <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{counts.enabled}<span className="ml-2 text-xs font-normal tracking-normal text-muted-foreground">enabled</span></p>
          <p className="mt-1.5 text-xs text-muted-foreground">Your workspace’s saved catalog choices</p>
        </Card>
        <Card className="rounded-xl p-4 shadow-none">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Full catalog</span>
            <Layers3 className="size-4" aria-hidden />
          </div>
          <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{counts.total}<span className="ml-2 text-xs font-normal tracking-normal text-muted-foreground">signal types</span></p>
          <p className="mt-1.5 text-xs text-muted-foreground">{counts.sourceBacked} source-backed · {counts.planned} planned</p>
        </Card>
        <Card className="rounded-xl p-4 shadow-none">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Shared feeds</span>
            <Network className="size-4" aria-hidden />
          </div>
          <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{enabledFeedCount ?? "—"}<span className="ml-2 text-xs font-normal tracking-normal text-muted-foreground">enabled</span></p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {sourceState === "loading" ? "Checking source settings…" : sourceState === "error" ? "Source status unavailable" : feedIssues > 0 ? `${feedIssues} enabled feed${feedIssues === 1 ? "" : "s"} need attention` : "Enabled settings, not a health check"}
          </p>
        </Card>
      </section>

      {notice ? <Notice tone={notice.tone}>{notice.message} {notice.showLeads ? <Link href="/leads" className="inline-flex items-center gap-1 font-medium underline underline-offset-4">View leads <ArrowUpRight className="size-3" aria-hidden /></Link> : null}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {catalog.isError ? <Notice tone="error">The catalog could not be refreshed. Showing the last confirmed choices; refresh before changing settings. {signalErrorMessage(catalog.error, "Check your connection.")}</Notice> : null}
      {sources.isError ? <Notice tone="error">Source status could not be refreshed. Searches are disabled until it loads. {signalErrorMessage(sources.error, "Check your connection.")}</Notice> : null}
      {sourceState === "ready" && counts.enabled > 0 && scanSources.length === 0 ? (
        <Notice tone="info">Your signal choices are saved, but none of their mapped source feeds are enabled. Change a source-backed signal to sync the feeds before searching.</Notice>
      ) : null}

      <Card className="flex items-start gap-3 rounded-xl border-blue-500/20 bg-blue-500/[0.035] p-4 shadow-none">
        <Network className="mt-0.5 size-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden />
        <div>
          <h2 className="text-xs font-semibold">One feed can power several signals</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Cards map to shared source feeds—not independent lead detectors. Changing a signal re-syncs the feeds for all enabled cards. Turning one off leaves a feed on if another card needs it, so searches can still return other evidence from that feed.
          </p>
        </div>
      </Card>

      <SignalsSources sources={sources.data} state={sourceState} />

      <section id="signals-browser" aria-label="Browse signals" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b">
          <div role="group" aria-label="Signal view" className="flex gap-4">
            {(["yours", "catalog"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={view === option}
                aria-controls="signals-results"
                onClick={() => setView(option)}
                className={cn("flex min-h-11 items-center gap-2 border-b-2 px-1 text-sm font-medium transition-colors", view === option ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400" : "border-transparent text-muted-foreground hover:text-foreground")}
              >
                {option === "yours" ? "Your signals" : "Full catalog"}
                <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] tabular-nums", view === option ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" : "bg-muted text-muted-foreground")}>{option === "yours" ? counts.enabled : counts.total}</span>
              </button>
            ))}
          </div>
          <p className="pb-2 text-xs text-muted-foreground" aria-live="polite">{shownCount} of {view === "yours" ? counts.enabled : counts.total} shown</p>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_190px_170px]">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <label htmlFor="signal-search" className="sr-only">Search signals, reasons or feeds</label>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id="signal-search" type="search" autoComplete="off" placeholder="Search signals, reasons or feeds…" value={search} onChange={(event) => setSearch(event.target.value)} className="h-10 rounded-lg bg-card pl-9 shadow-none" />
          </div>
          <div>
            <label htmlFor="signal-category" className="sr-only">Filter by category</label>
            <Select id="signal-category" value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 rounded-lg bg-card">
              <option value="all">All categories</option>
              {categories.map((group) => <option key={group.id} value={group.id}>{group.label} ({view === "yours" ? group.signals.filter((signal) => signal.enabled).length : group.signals.length})</option>)}
            </Select>
          </div>
          <div>
            <label htmlFor="signal-status" className="sr-only">Filter by status</label>
            <Select id="signal-status" value={status} onChange={(event) => setStatus(event.target.value as SignalFilterStatus)} className="h-10 rounded-lg bg-card">
              <option value="all">All statuses</option>
              <option value="enabled">Enabled</option>
              <option value="disabled">Not enabled</option>
              <option value="live">Live</option>
              <option value="partly_live">Partly live</option>
              <option value="by_hand">Not automated / planned</option>
            </Select>
          </div>
        </div>

        {hasFilters ? <Button size="sm" variant="ghost" className="h-7 px-1 text-muted-foreground" onClick={clearFilters}><X className="size-3.5" aria-hidden />Clear filters</Button> : null}

        <div id="signals-results" className="space-y-6" aria-busy={toggle.isPending}>
          {shownCategories.length === 0 ? (
            <div className="space-y-3 rounded-xl border bg-card p-5 text-center">
              <Empty
                title={view === "yours" && counts.enabled === 0 ? "No signals enabled yet" : "No signals match these filters"}
                hint={view === "yours" && counts.enabled === 0 ? `Browse all ${counts.total} catalog entries and enable a source-backed signal to get started. Planned entries are not automated.` : "Try another search, category or status. All catalog entries remain available to browse."}
                className="border-0 p-3"
              />
              <Button variant="outline" onClick={() => { clearFilters(); if (view === "yours") setView("catalog"); }}>{view === "yours" ? "Browse full catalog" : "Clear filters"}</Button>
            </div>
          ) : shownCategories.map((group) => {
            const fullGroup = categories.find((entry) => entry.id === group.id)!;
            const enabledInGroup = fullGroup.signals.filter((signal) => signal.enabled).length;
            return (
              <section key={group.id} aria-labelledby={`signal-category-${group.id}`} className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 id={`signal-category-${group.id}`} className="flex items-center gap-2 text-sm font-semibold tracking-tight">{group.label}<Badge tone="muted">{group.signals.length}</Badge></h2>
                  <p className="text-[11px] tabular-nums text-muted-foreground">{enabledInGroup} of {fullGroup.signals.length} enabled</p>
                </div>
                <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                  {group.signals.map((signal) => (
                    <SignalsCard
                      key={signal.id}
                      signal={signal}
                      sources={sources.data}
                      sourceState={sourceState}
                      controlsDisabled={controlsDisabled}
                      togglePending={toggle.isPending && toggle.variables?.id === signal.id}
                      searchDisabled={searchesDisabled}
                      searchPending={findLeads.isPending && findLeads.variables?.signalId === signal.id}
                      onToggle={() => changeSignal(signal)}
                      onSearch={(kinds) => requestSearch(kinds, signal.id)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </section>

      <footer className="space-y-4 border-t pt-5">
        <div className="grid gap-4 text-xs leading-5 text-muted-foreground md:grid-cols-3">
          <div><Badge tone="success">Live · {counts.live}</Badge><p className="mt-2">Catalog-listed automated coverage from mapped feeds. Source setup and matching evidence are still required.</p></div>
          <div><Badge className="bg-blue-500/10 text-blue-700 dark:text-blue-300">Partly live · {counts.partlyLive}</Badge><p className="mt-2">Source feeds cover some cases. Open How it works to understand the limits.</p></div>
          <div><Badge tone="muted">Not automated · {counts.planned} planned</Badge><p className="mt-2">Catalog ideas, not an available detector or research service. Controls are disabled; no availability date is promised.</p></div>
        </div>
        <p className="text-[11px] leading-5 text-muted-foreground">Signals suggest timing, not intent to buy. Review a lead’s evidence URL, date and reason—when available—before reaching out.</p>
      </footer>
    </div>
  );
}

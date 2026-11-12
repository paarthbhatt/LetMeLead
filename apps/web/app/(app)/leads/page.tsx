"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownUp, Check, ChevronLeft, ChevronRight, Download, Eye, FileSearch, RefreshCw, Search, Send, Upload, VolumeX } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { ClaimLeadDialog, ImportTargetsDialog, NotFitLeadDialog } from "@/components/leads-actions";
import { LeadEvidenceDialog } from "@/components/leads-evidence";
import { ReachOutDialog } from "@/components/leads-reach-out";
import { LeadSelectionCheckbox } from "@/components/leads-selection";
import { PageHeader } from "@/components/shell";
import { Avatar, Badge, Button, Card, Empty, Input, Notice, Select, Skeleton, StatusBadge, Table, Td, Th } from "@/components/ui";
import { api, ApiError, type Lead } from "@/lib/api";
import { canClaimLead, companyWebsite, fitLabel, isDraftEligible, leadContactSummary, leadsToCsv, reviewLeadSelection, scoreLabel, sortLeads, toggleLeadSelection, togglePageSelection, type LeadSort } from "@/lib/lead-helpers";
import { ageLabel, shortDate } from "@/lib/utils";

const PAGE_SIZE = 25;
const INITIAL_FILTERS = { q: "", status: "", fit: "", minScore: "" };
type Feedback = { tone: "success" | "error" | "info"; message: string };

export default function LeadsPage() {
  const queryClient = useQueryClient();
  const [searchText, setSearchText] = useState("");
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [sort, setSort] = useState<LeadSort>("strongest");
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [claimLead, setClaimLead] = useState<Lead | null>(null);
  const [notFitLead, setNotFitLead] = useState<Lead | null>(null);
  const [evidenceLead, setEvidenceLead] = useState<Lead | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [reachOutOpen, setReachOutOpen] = useState(false);
  const pageIndex = cursors.length - 1;
  const cursor = cursors[pageIndex];

  const leads = useQuery({
    queryKey: ["leads", filters.q, filters.status, filters.fit, filters.minScore, cursor, PAGE_SIZE],
    queryFn: () => api.leads({
      q: filters.q || undefined,
      status: filters.status || undefined,
      fit: filters.fit || undefined,
      min_score: filters.minScore || undefined,
      cursor,
      limit: PAGE_SIZE,
    }),
  });
  const items = useMemo(() => sortLeads(leads.data?.items ?? [], sort), [leads.data, sort]);
  const selectedLeads = useMemo(() => items.filter((lead) => selectedIds.includes(lead.id)), [items, selectedIds]);
  const selection = useMemo(() => reviewLeadSelection(selectedLeads), [selectedLeads]);
  const newCount = items.filter((lead) => lead.status === "new").length;
  const claimedCount = items.filter(isDraftEligible).length;
  const strongest = items.reduce<number | null>((score, lead) => Number.isFinite(lead.score)
    ? score === null ? lead.score : Math.max(score, lead.score)
    : score, null);
  const filtered = Boolean(filters.q || filters.status || filters.fit || filters.minScore);

  function changeFilters(next: Partial<typeof INITIAL_FILTERS>) {
    setFilters((current) => ({ ...current, ...next }));
    setCursors([undefined]);
    setSelectedIds([]);
  }

  function clearFilters() {
    setSearchText("");
    setFilters(INITIAL_FILTERS);
    setCursors([undefined]);
    setSelectedIds([]);
  }

  function completeAction(message: string) {
    setFeedback({ tone: "success", message });
  }

  const scan = useMutation({
    mutationFn: () => api.scan({ wait: false }),
    onSuccess: (result) => {
      setFeedback({
        tone: "info",
        message: result.status === "completed"
          ? "Search completed. Refresh the results to review any new leads."
          : "Search started in the background. It may take a little while; refresh the results when ready.",
      });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (error) => setFeedback({ tone: "error", message: error instanceof ApiError ? error.message : "Could not start the search. Please try again." }),
  });

  function exportCsv() {
    const exportLeads = selectedLeads.length ? selectedLeads : items;
    if (!exportLeads.length) return;
    let url: string | null = null;
    const anchor = document.createElement("a");
    try {
      const blob = new Blob(["\uFEFF", leadsToCsv(exportLeads)], { type: "text/csv;charset=utf-8" });
      url = URL.createObjectURL(blob);
      anchor.href = url;
      anchor.download = `letmelead-leads-${selectedLeads.length ? "selected" : "page"}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      setFeedback({ tone: "success", message: `Exported ${exportLeads.length} ${selectedLeads.length ? "selected" : "current-page"} lead${exportLeads.length === 1 ? "" : "s"} as a spreadsheet-safe CSV. Other pages are not included.` });
    } catch {
      setFeedback({ tone: "error", message: "Could not export the CSV. Please try again." });
    } finally {
      anchor.remove();
      // Give the browser time to start the download before releasing the blob.
      if (url) { const downloadUrl = url; window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1_000); }
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Leads"
        description="Real signals. Clear evidence. Your next conversation starts with a considered choice."
        actions={
          <Button onClick={() => { setFeedback(null); scan.mutate(); }} disabled={scan.isPending}>
            <Search className="size-4" aria-hidden />{scan.isPending ? "Starting search…" : "Find leads"}
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border bg-card px-4 py-3" aria-label="Current-page lead summary">
        <p className="text-xs text-muted-foreground">This page{filtered ? " · filtered" : ""}</p>
        <dl className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
          {[
            { label: "Leads", value: leads.data ? String(items.length) : "—", hint: "Leads on the current page only" },
            { label: "Awaiting review", value: leads.data ? String(newCount) : "—", hint: "New leads on this page" },
            { label: "Ready for drafts", value: leads.data ? String(claimedCount) : "—", hint: "Claimed leads on this page, excluding not a fit" },
            { label: "Strongest score", value: strongest === null ? "—" : scoreLabel(strongest), hint: "Highest evidence score on this page" },
          ].map((stat) => (
            <div key={stat.label} className="flex items-center gap-2" title={stat.hint}>
              <dt className="text-muted-foreground">{stat.label}</dt>
              <dd className="font-semibold tabular-nums">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {feedback ? <Notice tone={feedback.tone}>{feedback.message}</Notice> : null}

      <Card className="overflow-hidden rounded-xl shadow-none">
        <div className="space-y-4 border-b p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">Inspect the signal before claiming. Reach out creates drafts only.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}><Upload className="size-3.5" aria-hidden /> Import targets</Button>
              <Button variant="outline" size="sm" disabled={!items.length} onClick={exportCsv}><Download className="size-3.5" aria-hidden /> {selectedLeads.length ? `Export selected (${selectedLeads.length})` : "Export this page"}</Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <form
              className="flex min-w-[220px] flex-1 items-center gap-2"
              onSubmit={(event) => { event.preventDefault(); changeFilters({ q: searchText.trim() }); }}
              role="search"
            >
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input className="pl-9" placeholder="Company or domain…" aria-label="Search leads by company or domain" value={searchText} onChange={(event) => setSearchText(event.target.value)} />
              </div>
              <Button variant="outline" type="submit">Search</Button>
            </form>
            <Select aria-label="Filter by lead status" value={filters.status} onChange={(event) => changeFilters({ status: event.target.value })} className="w-auto">
              <option value="">Any status</option>
              <option value="new">New</option><option value="claimed">Claimed</option><option value="contacted">Contacted</option>
              <option value="replied">Replied</option><option value="meeting">Meeting</option><option value="archived">Archived</option>
            </Select>
            <Select aria-label="Filter by qualification fit" value={filters.fit} onChange={(event) => changeFilters({ fit: event.target.value })} className="w-auto">
              <option value="">Any fit</option><option value="fit">Good fit</option><option value="unknown">Fit unknown</option><option value="not_fit">Not a fit</option>
            </Select>
            <Input
              type="number" min={0} step={0.1} className="w-28" placeholder="Min score" aria-label="Minimum evidence score" value={filters.minScore}
              onChange={(event) => { const value = event.target.value; if (!value || (Number.isFinite(Number(value)) && Number(value) >= 0)) changeFilters({ minScore: value }); }}
            />
            {filtered ? <Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button> : null}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ArrowDownUp className="size-3.5" aria-hidden />
              <Select aria-label="Sort this page" value={sort} onChange={(event) => setSort(event.target.value as LeadSort)} className="h-8 w-auto py-1 text-xs">
                <option value="strongest">Strongest first</option><option value="newest">Newest first</option>
              </Select>
              <span>Within this page, not a global rank</span>
            </div>
            <Button variant="ghost" size="sm" disabled={leads.isFetching} onClick={() => leads.refetch()}>
              <RefreshCw className={`size-3.5 ${leads.isFetching ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden />{leads.isFetching ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/20 px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {selectedLeads.length ? <><span className="font-medium text-foreground">{selectedLeads.length} selected</span> · {selection.eligible.length} claimed and eligible</> : "Select leads to review an outreach draft"}
            </p>
            {selectedLeads.length ? <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>Clear selection</Button> : null}
          </div>
          <Button variant={selectedLeads.length ? "default" : "outline"} size="sm" disabled={!selectedLeads.length} onClick={() => setReachOutOpen(true)}>
            <Send className="size-3.5" aria-hidden /> Reach out{selectedLeads.length ? ` (${selectedLeads.length})` : ""}
          </Button>
        </div>

        {leads.isLoading ? (
          <div className="space-y-3 p-5" role="status" aria-label="Loading leads">
            <Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" />
          </div>
        ) : leads.isError && !leads.data ? (
          <Empty
            icon={<FileSearch className="size-5" aria-hidden />}
            title="Could not load leads"
            hint={leads.error instanceof ApiError ? leads.error.message : "Your leads could not be loaded. Check the connection and try again."}
            action={<Button variant="outline" onClick={() => leads.refetch()} disabled={leads.isFetching}>Try again</Button>}
            className="m-5"
          />
        ) : !items.length ? (
          <Empty
            icon={<FileSearch className="size-5" aria-hidden />}
            title={filtered ? "No leads match these filters" : pageIndex > 0 ? "No leads on this page" : "Your next lead starts with a signal"}
            hint={filtered ? "Try a broader company search, status, or evidence score." : pageIndex > 0 ? "Results may have changed. Go back or refresh the first page." : "Import target companies or review your sources in Settings, then find leads. A company becomes a lead only when the search finds evidence."}
            action={filtered ? <Button variant="outline" onClick={clearFilters}>Clear filters</Button> : pageIndex > 0 ? <Button variant="outline" onClick={() => { setCursors([undefined]); setSelectedIds([]); }}>Back to first page</Button> : <Button variant="outline" onClick={() => setImportOpen(true)}>Import targets</Button>}
            className="m-5"
          />
        ) : (
          <>
            {leads.isError ? <div className="p-4"><Notice tone="error">Could not refresh the results. Showing the last loaded page.</Notice></div> : null}
            <Table className="min-w-[1080px] [&_td]:px-3 [&_th]:px-3">
              <caption className="sr-only">Lead results, {sort === "strongest" ? "strongest" : "newest"} first within page {pageIndex + 1}</caption>
              <thead className="bg-muted/10">
                <tr>
                  <Th className="w-11 align-middle">
                    <LeadSelectionCheckbox label="Select all leads on this page" checked={selectedLeads.length === items.length} mixed={selectedLeads.length > 0 && selectedLeads.length < items.length} onChange={() => setSelectedIds((ids) => togglePageSelection(ids, items.map((lead) => lead.id)))} />
                  </Th>
                  <Th>Company</Th><Th>Contact</Th><Th>Why now</Th><Th className="text-right">Score</Th><Th>Status</Th><Th>Found</Th><Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((lead) => {
                  const contact = leadContactSummary(lead);
                  const website = companyWebsite(lead.domain);
                  const selected = selectedIds.includes(lead.id);
                  return (
                    <tr key={lead.id} className={selected ? "bg-signal/5" : "transition-colors hover:bg-muted/25"}>
                      <Td className="align-middle"><LeadSelectionCheckbox label={`Select ${lead.company}`} checked={selected} onChange={() => setSelectedIds((ids) => toggleLeadSelection(ids, lead.id))} /></Td>
                      <Td>
                        <div className="flex items-center gap-3">
                          <Avatar name={lead.company} />
                          <div className="min-w-[120px] max-w-[180px]">
                            <Link href={`/leads/${lead.id}`} className="block truncate text-sm font-semibold hover:underline">{lead.company}</Link>
                            {website ? <a href={website} target="_blank" rel="noopener noreferrer" className="mt-1 block truncate text-xs text-muted-foreground hover:text-foreground hover:underline">{lead.domain}</a> : <p className="mt-1 text-xs text-muted-foreground">Website not supplied</p>}
                          </div>
                        </div>
                      </Td>
                      <Td className="max-w-[180px]">
                        {contact.href ? <a href={contact.href} target={contact.href.startsWith("mailto:") ? undefined : "_blank"} rel="noopener noreferrer" className={`block text-xs hover:underline ${contact.named ? "font-medium" : "text-muted-foreground"}`}>{contact.label}</a> : <p className={`text-xs ${contact.named ? "font-medium" : "text-muted-foreground"}`}>{contact.label}</p>}
                        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{contact.detail}</p>
                      </Td>
                      <Td className="max-w-[340px]">
                        <p className="line-clamp-2 text-xs leading-relaxed">{lead.reason || "No reason recorded. Inspect the lead before claiming."}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <button type="button" onClick={() => setEvidenceLead(lead)} className="inline-flex items-center gap-1 text-[11px] font-medium text-signal hover:underline"><Eye className="size-3" aria-hidden /> Inspect evidence</button>
                          <span className="text-[11px] text-muted-foreground">{ageLabel(lead.signal_age_days)}</span>
                        </div>
                        {lead.fit === "not_fit" ? <Badge tone="danger" className="mt-2">{fitLabel(lead.fit)}</Badge> : lead.verification_status !== "verified" ? <Badge tone="muted" className="mt-2">{lead.verification_status.replaceAll("_", " ")}</Badge> : null}
                      </Td>
                      <Td className="text-right"><span className="text-sm font-semibold tabular-nums" title="Evidence score, not a purchase probability">{scoreLabel(lead.score)}</span>{lead.verification_status === "verified" ? <Check className="ml-auto mt-1 size-3 text-muted-foreground" aria-label="Verified evidence" /> : null}</Td>
                      <Td><StatusBadge status={lead.status} /></Td>
                      <Td className="whitespace-nowrap text-xs text-muted-foreground">{shortDate(lead.created_at)}</Td>
                      <Td>
                        <div className="flex justify-end gap-1.5">
                          {canClaimLead(lead) ? <Button variant="outline" size="sm" onClick={() => setClaimLead(lead)}>Claim</Button> : <Link href={`/leads/${lead.id}`} className="inline-flex h-8 items-center px-2 text-xs font-medium hover:underline">Open</Link>}
                          {lead.fit !== "not_fit" ? <Button variant="ghost" size="sm" title="Not a fit — add a reason" aria-label={`Mark ${lead.company} as not a fit`} onClick={() => setNotFitLead(lead)}><VolumeX className="size-3.5" aria-hidden /></Button> : null}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 sm:px-5">
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {leads.data ? <>{items.length} lead{items.length === 1 ? "" : "s"} on page {pageIndex + 1} · {leads.data.next_cursor ? "More results available" : "End of results"}</> : "Results are paginated; no total count is provided."}
          </p>
          <nav className="flex gap-2" aria-label="Lead result pages">
            <Button variant="outline" size="sm" disabled={pageIndex === 0 || leads.isFetching} onClick={() => { setCursors((history) => history.slice(0, -1)); setSelectedIds([]); }}><ChevronLeft className="size-3.5" aria-hidden /> Previous</Button>
            <Button variant="outline" size="sm" disabled={!leads.data?.next_cursor || leads.isFetching} onClick={() => { const next = leads.data?.next_cursor; if (next) { setCursors((history) => [...history, next]); setSelectedIds([]); } }}>Next <ChevronRight className="size-3.5" aria-hidden /></Button>
          </nav>
        </div>
      </Card>

      <p className="text-xs leading-relaxed text-muted-foreground">Evidence scores describe signal strength, not buying intent. Names are shown only when supplied by a source.</p>

      <ClaimLeadDialog lead={claimLead} onOpenChange={(open) => { if (!open) setClaimLead(null); }} onComplete={completeAction} />
      <NotFitLeadDialog lead={notFitLead} onOpenChange={(open) => { if (!open) setNotFitLead(null); }} onComplete={completeAction} />
      <LeadEvidenceDialog lead={evidenceLead} onOpenChange={(open) => { if (!open) setEvidenceLead(null); }} />
      <ImportTargetsDialog open={importOpen} onOpenChange={setImportOpen} onComplete={completeAction} />
      <ReachOutDialog open={reachOutOpen} leads={selectedLeads} onOpenChange={setReachOutOpen} onComplete={(message) => { completeAction(message); setSelectedIds([]); }} />
    </div>
  );
}

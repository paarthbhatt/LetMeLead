"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Flame, Search, Send, Upload, VolumeX } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { PageHeader } from "@/components/shell";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Empty,
  Input,
  Skeleton,
  Table,
  Td,
  Textarea,
  Th,
} from "@/components/ui";
import { api, ApiError, type Lead } from "@/lib/api";
import { ageLabel, shortDate } from "@/lib/utils";

function heat(score: number) {
  if (score >= 4) return 2;
  if (score > 0) return 1;
  return 0;
}

function toCsv(leads: Lead[]): string {
  const header = ["company", "domain", "person", "title", "linkedin", "email", "reason", "status", "found_at"];
  const escape = (value: string | null) => `"${(value ?? "").replaceAll('"', '""')}"`;
  const rows = leads.map((lead) =>
    [
      lead.company,
      lead.domain,
      lead.contact?.name ?? "",
      lead.contact?.title ?? "",
      lead.linkedin_url ?? "",
      lead.email ?? "",
      lead.reason,
      lead.status,
      lead.created_at,
    ]
      .map(escape)
      .join(","),
  );
  return [header.join(","), ...rows].join("\n");
}

export default function LeadsPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [minScore, setMinScore] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");

  const leads = useQuery({
    queryKey: ["leads", query, status, minScore],
    queryFn: () => api.leads({ q: query || undefined, status: status || undefined, min_score: minScore || undefined }),
  });

  const scan = useMutation({
    mutationFn: () => api.scan({ wait: false }),
    onSuccess: () => {
      setNotice("Search started. New leads appear here once it finishes.");
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["leads"] }), 4000);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not start the search."),
  });

  const claim = useMutation({
    mutationFn: (id: string) => api.claim(id),
    onSuccess: (data) => {
      setNotice(
        data.was_free
          ? `Claimed ${data.lead.company} — free lead, ${data.credits_remaining} credits left.`
          : `Claimed ${data.lead.company} for ${data.credits_charged} credit(s), ${data.credits_remaining} left.`,
      );
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["credits"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not claim the lead."),
  });

  const notFit = useMutation({
    mutationFn: (id: string) => api.notFit(id, "Marked not a fit from the leads list."),
    onSuccess: () => {
      setNotice("Marked not a fit. Future qualification learns from this.");
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not update the lead."),
  });

  const reachOut = useMutation({
    mutationFn: () => {
      const newLeads = (leads.data?.items ?? []).filter((lead) => lead.status === "new");
      if (!newLeads.length) throw new ApiError(400, "no_new_leads", "No new leads to reach out to yet.");
      return api.createCampaign({ name: `Outreach ${new Date().toLocaleDateString("en-US", { day: "numeric", month: "short" })}`, lead_ids: newLeads.map((l) => l.id) });
    },
    onSuccess: (campaign) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      router.push(`/campaigns/${campaign.id}`);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not start the outreach."),
  });

  const exportCsv = useMutation({
    mutationFn: async () => {
      const csv = toCsv(leads.data?.items ?? []);
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `letmelead-leads-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      return true;
    },
    onSuccess: () => setNotice("Exported the leads on this page as CSV."),
    onError: () => setError("Could not export the CSV."),
  });

  const importCsv = useMutation({
    mutationFn: (text: string) => api.importTargets(text),
    onSuccess: (result) => {
      setNotice(`Imported ${result.added} companies to the watchlist (${result.skipped} skipped).`);
      setImportOpen(false);
      setImportText("");
      queryClient.invalidateQueries({ queryKey: ["targets"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not import."),
  });

  const items = useMemo(() => leads.data?.items ?? [], [leads.data]);
  const newCount = items.filter((lead) => lead.status === "new").length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Leads"
        description="Every lead shows the signal that put it here, how old it is, and where it came from. Newest first."
        actions={
          <Button onClick={() => scan.mutate()} disabled={scan.isPending}>
            {scan.isPending ? "Starting…" : "Find leads"}
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => reachOut.mutate()} disabled={reachOut.isPending || !newCount}>
          <Send className="size-4" aria-hidden />
          Reach out to these people{newCount ? ` (${newCount})` : ""}
        </Button>
        <span className="text-sm text-muted-foreground">We add the newest leads first.</span>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen((v) => !v)}>
            <Upload className="size-4" aria-hidden />
            Import CSV
          </Button>
          <Button variant="outline" onClick={() => exportCsv.mutate()} disabled={exportCsv.isPending || !items.length}>
            <Download className="size-4" aria-hidden />
            Export CSV
          </Button>
        </div>
      </div>

      {importOpen ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            <p className="text-sm text-muted-foreground">
              One company per line as <code className="text-xs">company, domain</code>. Companies land on the
              watchlist and are checked on your next search.
            </p>
            <Textarea
              rows={5}
              placeholder={"Acme Corp, acme.com\nGlobex, globex.io"}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              aria-label="CSV to import"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setImportOpen(false)}>Cancel</Button>
              <Button onClick={() => importCsv.mutate(importText)} disabled={importCsv.isPending || !importText.trim()}>
                {importCsv.isPending ? "Importing…" : "Import"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input
            className="pl-8"
            placeholder="Filter by company or domain"
            aria-label="Filter leads"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          aria-label="Status filter"
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Any status</option>
          <option value="new">New</option>
          <option value="claimed">Claimed</option>
          <option value="contacted">Contacted</option>
          <option value="replied">Replied</option>
          <option value="meeting">Meeting</option>
          <option value="archived">Archived</option>
        </select>
        <Input
          aria-label="Minimum score"
          type="number"
          min={0}
          step={1}
          placeholder="Min score"
          className="w-28"
          value={minScore}
          onChange={(e) => setMinScore(e.target.value)}
        />
      </div>

      {notice ? (
        <p role="status" className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Card>
        <CardContent className="p-0">
          {leads.isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : leads.isError ? (
            <p className="p-4 text-sm text-destructive">Could not load leads. Is the API running?</p>
          ) : !items.length ? (
            <Empty
              className="m-4"
              title="No leads yet"
              hint="Add target companies in Settings, then press Find leads. A scan checks news, job boards and public discussions."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Rank</Th>
                  <Th>Person</Th>
                  <Th>Company</Th>
                  <Th>Reason</Th>
                  <Th>Status</Th>
                  <Th>Date</Th>
                  <Th className="text-right">Action</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((lead, index) => (
                  <tr key={lead.id} className="hover:bg-muted/40">
                    <Td className="align-top">
                      <span className="font-semibold">#{index + 1}</span>
                      <div className="mt-0.5 flex gap-0.5 text-amber-500" title={`Score ${lead.score}`}>
                        {Array.from({ length: heat(lead.score) }).map((_, i) => (
                          <Flame key={i} className="size-3" aria-hidden />
                        ))}
                      </div>
                    </Td>
                    <Td className="align-top">
                      {lead.contact?.name || lead.contact?.linkedin_url ? (
                        <>
                          {lead.contact?.linkedin_url ? (
                            <a
                              href={lead.contact.linkedin_url}
                              target="_blank"
                              rel="noreferrer"
                              className="font-medium hover:underline"
                            >
                              {lead.contact.name ?? "Unknown name"}
                            </a>
                          ) : (
                            <span className="font-medium">{lead.contact?.name}</span>
                          )}
                          <div className="text-xs text-muted-foreground">{lead.contact?.title ?? "—"}</div>
                        </>
                      ) : (
                        <>
                          <Link href={`/leads/${lead.id}`} className="font-medium hover:underline">
                            {lead.company}
                          </Link>
                          <div className="text-xs text-muted-foreground">No named contact yet</div>
                        </>
                      )}
                    </Td>
                    <Td className="align-top">
                      <Link href={`/leads/${lead.id}`} className="hover:underline">
                        {lead.company}
                      </Link>
                      <div className="text-xs text-muted-foreground">{lead.domain}</div>
                    </Td>
                    <Td className="max-w-[24rem] align-top">
                      <p className="line-clamp-2 text-sm">{lead.reason}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {lead.linkedin_url && !lead.email ? <Badge tone="muted">LinkedIn only</Badge> : null}
                        {lead.verification_status !== "verified" ? (
                          <Badge tone="warning">{lead.verification_status}</Badge>
                        ) : null}
                        <Badge tone="muted">{ageLabel(lead.signal_age_days)}</Badge>
                      </div>
                    </Td>
                    <Td className="align-top">
                      <Badge tone={lead.status === "new" ? "default" : "muted"}>{lead.status}</Badge>
                    </Td>
                    <Td className="whitespace-nowrap align-top text-sm text-muted-foreground">
                      {shortDate(lead.created_at)}
                    </Td>
                    <Td className="align-top text-right">
                      <div className="flex items-center justify-end gap-2">
                        {lead.status === "new" && lead.fit !== "not_fit" ? (
                          <Button size="sm" onClick={() => claim.mutate(lead.id)} disabled={claim.isPending}>
                            Claim
                          </Button>
                        ) : (
                          <Link href={`/leads/${lead.id}`} className="text-sm hover:underline">
                            Open
                          </Link>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Mark ${lead.company} as not a fit`}
                          title="Not a fit"
                          onClick={() => notFit.mutate(lead.id)}
                          disabled={notFit.isPending}
                        >
                          <VolumeX className="size-4" aria-hidden />
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

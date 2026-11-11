"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

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
  Th,
} from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { ageLabel, shortDate } from "@/lib/utils";

export default function LeadsPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [minScore, setMinScore] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const leads = useQuery({
    queryKey: ["leads", query, status, minScore],
    queryFn: () => api.leads({ q: query || undefined, status: status || undefined, min_score: minScore || undefined }),
  });

  const scan = useMutation({
    mutationFn: () => api.scan({ wait: false }),
    onSuccess: () => {
      setNotice("Scan started. New leads appear here once the worker finishes.");
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["leads"] }), 4000);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not start the scan."),
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

  return (
    <div className="space-y-4">
      <PageHeader
        title="Leads"
        description="Every lead shows the signal that put it here, how old it is, and where it came from."
        actions={
          <Button onClick={() => scan.mutate()} disabled={scan.isPending}>
            <RefreshCw className={scan.isPending ? "size-4 animate-spin" : "size-4"} aria-hidden />
            {scan.isPending ? "Starting…" : "Find leads"}
          </Button>
        }
      />

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
          ) : !leads.data?.items.length ? (
            <Empty
              className="m-4"
              title="No leads yet"
              hint="Add target companies in Settings, then press Find leads. A scan checks news, job boards and public discussions."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Company</Th>
                  <Th>Why now</Th>
                  <Th>Age</Th>
                  <Th>Fit</Th>
                  <Th>Score</Th>
                  <Th>Contact</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Action</Th>
                </tr>
              </thead>
              <tbody>
                {leads.data.items.map((lead) => (
                  <tr key={lead.id} className="hover:bg-muted/40">
                    <Td>
                      <Link href={`/leads/${lead.id}`} className="font-medium hover:underline">
                        {lead.company}
                      </Link>
                      <div className="text-xs text-muted-foreground">{lead.domain}</div>
                    </Td>
                    <Td className="max-w-[22rem]">
                      <p className="line-clamp-2 text-sm">{lead.reason}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {lead.fit_confidence ? (
                          <Badge tone="muted">{Math.round(lead.fit_confidence * 100)}% confidence</Badge>
                        ) : null}
                        <Badge tone={lead.verification_status === "verified" ? "success" : "warning"}>
                          {lead.verification_status}
                        </Badge>
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap text-sm text-muted-foreground">
                      {ageLabel(lead.signal_age_days)}
                      <div className="text-xs">{shortDate(lead.signal_at)}</div>
                    </Td>
                    <Td>
                      <Badge tone={lead.fit === "fit" ? "success" : lead.fit === "not_fit" ? "danger" : "muted"}>
                        {lead.fit}
                      </Badge>
                    </Td>
                    <Td className="font-medium">{lead.score}</Td>
                    <Td className="text-sm">
                      {lead.linkedin_url ? (
                        <a href={lead.linkedin_url} target="_blank" rel="noreferrer" className="hover:underline">
                          LinkedIn
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                      {lead.email ? <div className="text-xs text-muted-foreground">{lead.email}</div> : null}
                    </Td>
                    <Td>
                      <Badge tone="muted">{lead.status}</Badge>
                    </Td>
                    <Td className="text-right">
                      {lead.status === "new" && lead.fit !== "not_fit" ? (
                        <Button size="sm" onClick={() => claim.mutate(lead.id)} disabled={claim.isPending}>
                          Claim
                        </Button>
                      ) : (
                        <Link href={`/leads/${lead.id}`} className="text-sm hover:underline">
                          Open
                        </Link>
                      )}
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

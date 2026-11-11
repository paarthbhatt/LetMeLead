"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { PageHeader } from "@/components/shell";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  Input,
  Skeleton,
  Table,
  Td,
  Th,
  Textarea,
} from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { ageLabel, shortDate } from "@/lib/utils";

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lead = useQuery({ queryKey: ["lead", params.id], queryFn: () => api.lead(params.id) });

  const claim = useMutation({
    mutationFn: () => api.claim(params.id),
    onSuccess: (data) => {
      setNotice(
        data.was_free
          ? "Claimed as a free lead."
          : `Claimed for ${data.credits_charged} credit(s). Balance: ${data.credits_remaining}.`,
      );
      queryClient.invalidateQueries({ queryKey: ["lead", params.id] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["credits"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not claim."),
  });

  const notFit = useMutation({
    mutationFn: () => api.notFit(params.id, reason.trim() || "Not a fit for our offer."),
    onSuccess: () => {
      setNotice("Marked as not a fit. That reason now informs future qualification.");
      queryClient.invalidateQueries({ queryKey: ["lead", params.id] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not update the lead."),
  });

  if (lead.isLoading) return <Skeleton className="h-64 w-full" />;
  if (!lead.data) return <Empty title="Lead not found" hint="It may have been removed or belongs to another workspace." />;

  const data = lead.data;
  const evidence = [...data.evidence].sort(
    (a, b) => new Date(b.published_at ?? 0).getTime() - new Date(a.published_at ?? 0).getTime(),
  );

  return (
    <div className="space-y-5">
      <Link href="/leads" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> All leads
      </Link>

      <PageHeader
        title={data.company}
        description={data.domain}
        actions={
          <div className="flex gap-2">
            {data.status === "new" ? (
              <Button onClick={() => claim.mutate()} disabled={claim.isPending}>
                Claim with credits
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => notFit.mutate()} disabled={notFit.isPending}>
              Mark not a fit
            </Button>
          </div>
        }
      />

      {notice ? <p className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm">{notice}</p> : null}
      {error ? <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Why this lead exists</CardTitle>
            <CardDescription>
              Plain-language reason, built from the evidence below. Signals show timing, not intent to buy.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm leading-relaxed">{data.reason}</p>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge tone="muted">score {data.score}</Badge>
              <Badge tone={data.verification_status === "verified" ? "success" : "warning"}>
                {data.verification_status}
              </Badge>
              <Badge tone={data.fit === "fit" ? "success" : data.fit === "not_fit" ? "danger" : "muted"}>
                fit: {data.fit}
              </Badge>
              <Badge tone="muted">{ageLabel(data.signal_age_days)}</Badge>
            </div>
            {data.fit_reason ? (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <p className="font-medium">Qualification</p>
                <p className="text-muted-foreground">{data.fit_reason}</p>
                {Array.isArray((data.fit_evidence as { limitations?: string[] }).limitations) ? (
                  <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
                    {((data.fit_evidence as { limitations?: string[] }).limitations ?? []).map((limitation) => (
                      <li key={limitation}>{limitation}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Decision makers</CardTitle>
            <CardDescription>Names are only shown when a source stated them.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.contacts.length ? (
              data.contacts.map((contact) => (
                <div key={contact.id} className="rounded-md border p-3 text-sm">
                  <p className="font-medium">{contact.name ?? contact.title ?? "Decision maker"}</p>
                  {contact.name && contact.title ? <p className="text-muted-foreground">{contact.title}</p> : null}
                  {contact.email ? <p className="mt-1 break-all text-xs">{contact.email}</p> : null}
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    <Badge tone={contact.verified ? "success" : "warning"}>
                      {contact.verified ? "verified" : "unverified"}
                    </Badge>
                    <Badge tone="muted">{Math.round(contact.confidence * 100)}%</Badge>
                    {contact.linkedin_url ? (
                      <a
                        href={contact.linkedin_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs hover:underline"
                      >
                        profile <ExternalLink className="size-3" aria-hidden />
                      </a>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No contacts enriched yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Evidence timeline</CardTitle>
          <CardDescription>Each row links to the public source and shows its age.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {evidence.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Signal</Th>
                  <Th>Source</Th>
                  <Th className="text-right">Points</Th>
                </tr>
              </thead>
              <tbody>
                {evidence.map((item) => (
                  <tr key={item.id}>
                    <Td className="whitespace-nowrap text-sm">{shortDate(item.published_at)}</Td>
                    <Td>
                      <p className="text-sm">{item.title}</p>
                      <div className="mt-1 flex gap-1">
                        <Badge tone="muted">{item.type.replaceAll("_", " ")}</Badge>
                        <Badge tone="muted">{item.strength}</Badge>
                      </div>
                    </Td>
                    <Td className="text-sm">
                      {item.url ? (
                        <a href={item.url} target="_blank" rel="noreferrer" className="hover:underline">
                          {item.source}
                        </a>
                      ) : (
                        item.source
                      )}
                    </Td>
                    <Td className="text-right text-sm">{item.points}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <Empty className="m-4" title="No evidence rows" hint="Run a scan to attach signals to this lead." />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Not a fit?</CardTitle>
          <CardDescription>The reason is stored and fed into the next qualification pass.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-2">
          <Textarea
            aria-label="Reason"
            className="min-h-[64px] flex-1"
            placeholder="e.g. too small, agency, student project"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Input readOnly value={`score ${data.score}`} className="w-28" aria-label="Score" />
          <Button variant="destructive" onClick={() => notFit.mutate()} disabled={notFit.isPending}>
            Save reason
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

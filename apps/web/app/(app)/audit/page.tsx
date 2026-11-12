"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ChevronRight, CreditCard, KeyRound, Radio, RefreshCw, ScrollText, Search, Send, Target, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { AccountCopyButton, AccountDetail, AccountPanel, AccountQueryError } from "@/components/account-ui";
import { PageHeader } from "@/components/shell";
import { Avatar, Badge, Button, Dialog, Empty, Input, Select, Skeleton, Stat, Table, Td, Th } from "@/components/ui";
import { accountLabel, auditCategory, auditTargetHref, filterAuditEntries } from "@/lib/account-helpers";
import { api, request, type AuditEntry, type Page } from "@/lib/api";
import { shortDate } from "@/lib/utils";

const CATEGORY_ICONS = { billing: CreditCard, integrations: KeyRound, outreach: Send, leads: Target, signals: Radio, workspace: Users };

export default function AuditPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [actor, setActor] = useState("all");
  const [selected, setSelected] = useState<AuditEntry | null>(null);
  const members = useQuery({ queryKey: ["members"], queryFn: api.members });
  const keys = useQuery({ queryKey: ["api-keys"], queryFn: api.apiKeys });
  const audit = useInfiniteQuery({
    queryKey: ["audit", "history"],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => pageParam ? request<Page<AuditEntry>>(`/v1/audit?limit=50&cursor=${encodeURIComponent(pageParam)}`) : api.audit(),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  });
  const entries = Array.from(new Map((audit.data?.pages.flatMap((page) => page.items) ?? []).map((entry) => [entry.id, entry])).values());
  const actorNames: Record<string, string> = Object.fromEntries([
    ...(members.data ?? []).map((member) => [`user:${member.user_id}`, member.name || member.email]),
    ...(keys.data ?? []).map((key) => [`api_key:${key.id}`, key.name]),
  ]);
  const actorName = (entry: AuditEntry) => actorNames[`${entry.actor_type}:${entry.actor_id}`] ?? accountLabel(entry.actor_type);
  const visible = filterAuditEntries(entries, { query: search, actor, category, actorNames });
  const selectedTarget = selected ? auditTargetHref(selected.target_type, selected.target_id) : null;
  const clearFilters = () => { setSearch(""); setCategory("all"); setActor("all"); };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Audit log" description="A clear record of who did what in your workspace, and when." />
        <Button type="button" variant="outline" disabled={audit.isFetching} onClick={() => void audit.refetch()}><RefreshCw className="size-4" />Refresh</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Events loaded" value={audit.isLoading || (audit.isError && !entries.length) ? "—" : entries.length} hint="Recent history · load older events below" />
        <Stat label="Team actions" value={audit.isLoading || (audit.isError && !entries.length) ? "—" : entries.filter((entry) => entry.actor_type === "user").length} hint="Actions by team members in loaded history" />
        <Stat label="Agent actions" value={audit.isLoading || (audit.isError && !entries.length) ? "—" : entries.filter((entry) => entry.actor_type === "api_key").length} hint="Actions authenticated with workspace API keys" />
      </div>

      <AccountPanel title="Workspace activity" description="Search actions, people and full IDs. Filters apply to loaded history." icon={<ScrollText className="size-4" />} action={<Badge tone="muted">Read-only record</Badge>}>
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1 basis-64"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search actions, people or IDs…" aria-label="Search audit log" className="pl-9" /></div>
          <Select aria-label="Filter audit activity" value={category} onChange={(event) => setCategory(event.target.value)} className="w-full sm:w-40">
            <option value="all">All activity</option><option value="leads">Leads & replies</option><option value="outreach">Outreach</option><option value="billing">Billing</option><option value="workspace">Workspace & team</option><option value="integrations">Keys & webhooks</option><option value="signals">Buying signals</option><option value="other">Other activity</option>
          </Select>
          <Select aria-label="Filter audit actors" value={actor} onChange={(event) => setActor(event.target.value)} className="w-full sm:w-36"><option value="all">All actors</option><option value="user">Team members</option><option value="api_key">Agents / API keys</option><option value="system">System</option></Select>
        </div>

        {audit.isLoading ? <Skeleton className="h-48 w-full" /> : audit.isError && !entries.length ? (
          <AccountQueryError message="The audit log could not be loaded." onRetry={() => void audit.refetch()} />
        ) : !visible.length ? (
          <Empty title={entries.length ? "No matching events" : "Your workspace history starts here"} hint={entries.length ? "Try another search, clear the filters, or load older events." : "Claims, outreach, team changes and billing actions will be recorded here."} icon={<ScrollText className="size-5" />} action={entries.length ? <Button type="button" size="sm" variant="outline" onClick={clearFilters}>Clear filters</Button> : undefined} />
        ) : (
          <Table>
            <thead><tr><Th>Activity</Th><Th>Actor</Th><Th>Target</Th><Th>When</Th><Th><span className="sr-only">Details</span></Th></tr></thead>
            <tbody>
              {visible.map((entry) => {
                const kind = auditCategory(entry.action);
                const Icon = CATEGORY_ICONS[kind as keyof typeof CATEGORY_ICONS] ?? ScrollText;
                const target = auditTargetHref(entry.target_type, entry.target_id);
                return (
                  <tr key={entry.id} className="transition-colors hover:bg-muted/30">
                    <Td>
                      <div className="flex items-start gap-2.5"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-signal/10 text-signal"><Icon className="size-3.5" /></span><div><p className="whitespace-nowrap text-sm font-medium">{accountLabel(entry.action)}</p><code className="mt-1 block text-[11px] text-muted-foreground">{entry.action}</code></div></div>
                    </Td>
                    <Td><div className="flex items-center gap-2"><Avatar name={actorName(entry)} /><div><p className="whitespace-nowrap text-xs font-medium">{actorName(entry)}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{accountLabel(entry.actor_type)}{entry.actor_id ? ` · ${entry.actor_id.slice(0, 8)}` : ""}</p></div></div></Td>
                    <Td><p className="whitespace-nowrap text-xs">{entry.target_type ? accountLabel(entry.target_type) : "Workspace activity"}</p>{entry.target_id ? target ? <Link href={target} className="mt-1 block text-[11px] text-signal hover:underline">{entry.target_id.slice(0, 8)}</Link> : <code className="mt-1 block text-[11px] text-muted-foreground">{entry.target_id.slice(0, 8)}</code> : null}</Td>
                    <Td className="whitespace-nowrap text-xs text-muted-foreground"><time dateTime={entry.created_at} title={new Date(entry.created_at).toLocaleString()}>{shortDate(entry.created_at)}<span className="mt-1 block text-[11px]">{new Date(entry.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span></time></Td>
                    <Td className="text-right"><Button type="button" variant="ghost" size="sm" aria-label={`View ${accountLabel(entry.action)} details`} onClick={() => setSelected(entry)}><ChevronRight className="size-4" /></Button></Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-xs text-muted-foreground">{visible.length} of {entries.length} loaded events{audit.hasNextPage ? " · older history is available" : ""}</p>
          {audit.hasNextPage ? <Button type="button" variant="outline" size="sm" disabled={audit.isFetching} onClick={() => void audit.fetchNextPage()}>{audit.isFetchingNextPage ? "Loading…" : "Load older events"}</Button> : null}
        </div>
        {audit.isError && entries.length ? <div className="mt-4"><AccountQueryError message="The audit refresh failed. Your loaded history is still shown." onRetry={() => void audit.refetch()} /></div> : null}
      </AccountPanel>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }} title={selected ? accountLabel(selected.action) : "Event details"} description="The original event identifiers are kept below for traceability." footer={<Button type="button" variant="outline" onClick={() => setSelected(null)}>Close</Button>}>
        {selected ? <dl>
          <AccountDetail label="When"><time dateTime={selected.created_at}>{new Date(selected.created_at).toLocaleString()}</time></AccountDetail>
          <AccountDetail label="Action"><code className="break-all text-xs">{selected.action}</code></AccountDetail>
          <AccountDetail label="Actor"><p>{actorName(selected)}</p><p className="mt-1 text-xs text-muted-foreground">{accountLabel(selected.actor_type)}</p></AccountDetail>
          <AccountDetail label="Actor ID"><code className="break-all text-xs">{selected.actor_id ?? "No actor ID recorded"}</code></AccountDetail>
          <AccountDetail label="Target type">{selected.target_type ? accountLabel(selected.target_type) : "No target type recorded"}</AccountDetail>
          <AccountDetail label="Target ID">{selectedTarget ? <Link href={selectedTarget} className="break-all text-xs text-signal hover:underline">{selected.target_id}</Link> : <code className="break-all text-xs">{selected.target_id ?? "No target ID recorded"}</code>}</AccountDetail>
          <AccountDetail label="Audit event ID"><div className="flex flex-wrap items-start gap-2"><code className="min-w-0 flex-1 break-all text-xs">{selected.id}</code><AccountCopyButton value={selected.id} label="Copy ID" /></div></AccountDetail>
        </dl> : null}
      </Dialog>
    </div>
  );
}

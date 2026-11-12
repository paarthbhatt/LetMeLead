"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Building2, CircleUserRound, Plug, Target, Users } from "lucide-react";
import Link from "next/link";

import { AccountCopyButton, AccountDetail, AccountPanel, AccountQueryError } from "@/components/account-ui";
import { Avatar, Badge, Empty, Skeleton, Table, Td, Th } from "@/components/ui";
import { accountLabel, buyerBrief, httpUrl } from "@/lib/account-helpers";
import { api } from "@/lib/api";

export function AccountWorkspace() {
  const tenant = useQuery({ queryKey: ["tenant"], queryFn: api.tenant });
  const health = useQuery({ queryKey: ["health"], queryFn: api.health });
  const brief = buyerBrief(tenant.data?.icp);
  const website = httpUrl(tenant.data?.website);

  return (
    <div className="space-y-5">
      <AccountPanel title="Workspace details" description="The workspace your team and agents share." icon={<Building2 className="size-4" />}>
        {tenant.isLoading ? <Skeleton className="h-32 w-full" /> : tenant.isError ? (
          <AccountQueryError message="Workspace details could not be loaded." onRetry={() => void tenant.refetch()} />
        ) : tenant.data ? (
          <>
            <div className="mb-4 flex items-center gap-3">
              <Avatar name={tenant.data.name} />
              <div>
                <p className="text-base font-semibold">{tenant.data.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Your active workspace</p>
              </div>
            </div>
            <dl>
              <AccountDetail label="Website">
                {website ? (
                  <a href={website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-signal hover:underline">
                    {tenant.data.website}<ArrowUpRight className="size-3.5 shrink-0" />
                  </a>
                ) : tenant.data.website ?? "Not added"}
              </AccountDetail>
              <AccountDetail label="Workspace ID">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <code className="break-all text-xs text-muted-foreground">{tenant.data.id}</code>
                  <AccountCopyButton value={tenant.data.id} label="Copy ID" />
                </div>
              </AccountDetail>
            </dl>
          </>
        ) : null}
      </AccountPanel>

      <AccountPanel
        title="Your buyer brief"
        description="What you sell, who should buy it, and where to look. This guides lead qualification."
        icon={<Target className="size-4" />}
        action={<Link href="/onboarding" className="inline-flex items-center gap-1.5 text-xs font-medium text-signal hover:underline">Edit brief<ArrowUpRight className="size-3.5" /></Link>}
      >
        {tenant.isLoading ? <Skeleton className="h-44 w-full" /> : tenant.isError ? (
          <p className="text-sm text-muted-foreground">The brief is unavailable until workspace details load.</p>
        ) : !brief.offer && !brief.buyers.length && !brief.roles.length && !brief.region && !brief.exclusions.length ? (
          <Empty title="Tell us about your buyers" hint="Add a buyer brief to give the engine a clear starting point." icon={<Target className="size-5" />} action={<Link href="/onboarding" className="text-sm font-medium text-signal hover:underline">Set up your brief</Link>} />
        ) : (
          <dl>
            <AccountDetail label="What you offer">{brief.offer ?? <span className="text-muted-foreground">Not specified</span>}</AccountDetail>
            <AccountDetail label="Ideal buyers">
              {brief.buyers.length ? <ul className="space-y-2">{brief.buyers.map((buyer, index) => <li key={`${index}-${buyer}`} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-signal" />{buyer}</li>)}</ul> : <span className="text-muted-foreground">Not specified</span>}
            </AccountDetail>
            <AccountDetail label="Buyer roles">
              {brief.roles.length ? <div className="flex flex-wrap gap-1.5">{brief.roles.map((role, index) => <Badge key={`${index}-${role}`} tone="muted">{role}</Badge>)}</div> : <span className="text-muted-foreground">Not specified</span>}
            </AccountDetail>
            <AccountDetail label="Geography">{brief.region ?? <span className="text-muted-foreground">Not specified</span>}</AccountDetail>
            <AccountDetail label="Exclude">{brief.exclusions.length ? brief.exclusions.join(" · ") : <span className="text-muted-foreground">No exclusions added</span>}</AccountDetail>
          </dl>
        )}
      </AccountPanel>

      <AccountPanel title="Service configuration" description="Reported by your server. These are configuration values, not live connection tests." icon={<Plug className="size-4" />}>
        {health.isLoading ? <Skeleton className="h-28 w-full" /> : health.isError ? (
          <AccountQueryError message="Service configuration is currently unavailable." onRetry={() => void health.refetch()} />
        ) : health.data ? (
          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            <ServiceValue label="AI provider" value={accountLabel(health.data.providers.llm)} />
            <ServiceValue label="Contact enrichment" value={accountLabel(health.data.providers.enrichment)} />
            <ServiceValue label="Stripe payments" configured={health.data.providers.stripe} />
            <ServiceValue label="Google sign-in" configured={health.data.providers.google_oauth} />
          </div>
        ) : null}
      </AccountPanel>
    </div>
  );
}

function ServiceValue({ label, value, configured }: { label: string; value?: string; configured?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      {value ? <span className="text-sm font-medium">{value}</span> : <Badge tone={configured === true ? "success" : "muted"}>{configured === true ? "Configured" : configured === false ? "Not configured" : "Unknown"}</Badge>}
    </div>
  );
}

export function AccountTeam() {
  const members = useQuery({ queryKey: ["members"], queryFn: api.members });

  return (
    <div className="space-y-5">
      <AccountPanel title="Workspace members" description="The people who can access this workspace." icon={<Users className="size-4" />} action={members.data ? <Badge tone="muted">{members.data.length} {members.data.length === 1 ? "member" : "members"}</Badge> : undefined}>
        {members.isLoading ? <Skeleton className="h-28 w-full" /> : members.isError ? (
          <AccountQueryError message="Team members could not be loaded." onRetry={() => void members.refetch()} />
        ) : !members.data?.length ? (
          <Empty title="No members to show" hint="Workspace membership is managed through the API." icon={<CircleUserRound className="size-5" />} />
        ) : (
          <Table>
            <thead><tr><Th>Member</Th><Th className="text-right">Role</Th></tr></thead>
            <tbody>
              {members.data.map((member) => (
                <tr key={member.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar name={member.name ?? member.email} />
                      <div><p className="font-medium">{member.name ?? member.email}</p><p className="mt-0.5 text-xs text-muted-foreground">{member.email}</p></div>
                    </div>
                  </Td>
                  <Td className="text-right"><Badge tone={member.role === "owner" ? "default" : "muted"}>{accountLabel(member.role)}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </AccountPanel>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Owner", "Manages billing, API keys, webhooks and the team."],
          ["Member", "Finds and claims leads, and runs outreach."],
          ["Viewer", "Reads workspace data without making changes."],
        ].map(([role, description]) => (
          <div key={role} className="rounded-xl border bg-card p-4"><p className="text-sm font-semibold">{role}</p><p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{description}</p></div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">This view is read-only. Team invitations and role changes are managed through the workspace API.</p>
    </div>
  );
}

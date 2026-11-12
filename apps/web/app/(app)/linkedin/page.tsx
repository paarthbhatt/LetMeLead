"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ExternalLink, Linkedin, LockKeyhole, Pause, Play, Unplug } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { AccountDetail, AccountPanel, AccountQueryError } from "@/components/account-ui";
import { PageHeader } from "@/components/shell";
import { Avatar, Button, Dialog, Empty, Input, Label, Notice, Skeleton, Stat, StatusBadge, Textarea } from "@/components/ui";
import { accountError, httpUrl, parseLinkedinSession } from "@/lib/account-helpers";
import { api } from "@/lib/api";
import { relative } from "@/lib/utils";

export default function LinkedinPage() {
  const queryClient = useQueryClient();
  const [handle, setHandle] = useState("");
  const [storageState, setStorageState] = useState("");
  const [reason, setReason] = useState("");
  const [riskAccepted, setRiskAccepted] = useState(false);
  const [confirm, setConfirm] = useState<"resume" | "disconnect" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const accounts = useQuery({ queryKey: ["linkedin"], queryFn: api.linkedin });
  const limits = useQuery({ queryKey: ["linkedin", "limits"], queryFn: api.linkedinLimits });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["linkedin"] });
    void queryClient.invalidateQueries({ queryKey: ["audit"] });
  };
  const connect = useMutation({
    mutationFn: () => api.connectLinkedin(parseLinkedinSession(storageState), handle.trim() || undefined),
    onSuccess: () => {
      setStorageState(""); setRiskAccepted(false);
      setNotice("Session stored. This does not verify that LinkedIn still accepts the session. Check your setup in dry-run mode before requesting live outreach.");
      invalidate();
    },
  });
  const pause = useMutation({
    mutationFn: () => api.pauseLinkedin(reason.trim() || "Paused from dashboard"),
    onSuccess: () => { setReason(""); setNotice("Outreach paused. The worker checks the pause before its next send."); invalidate(); },
  });
  const resume = useMutation({
    mutationFn: api.resumeLinkedin,
    onSuccess: () => { setConfirm(null); setNotice("Outreach resumed. Sending still depends on the server's worker and dry-run settings."); invalidate(); },
  });
  const disconnect = useMutation({
    mutationFn: (id: string) => api.disconnectLinkedin(id),
    onSuccess: () => { setConfirm(null); setNotice("The stored session has been removed from this workspace. Your own browser remains signed in to LinkedIn."); invalidate(); },
  });

  const account = accounts.data?.[0];
  const busy = connect.isPending || pause.isPending || resume.isPending || disconnect.isPending;
  const hasSession = account?.status === "connected" || account?.status === "paused";
  const profileUrl = httpUrl(account?.handle);
  const dryRun = limits.data?.dry_run;
  const workerEnabled = limits.data?.outreach_enabled;
  const mode = typeof dryRun !== "boolean" ? "Unknown" : dryRun ? "Dry run" : "Live sending";

  return (
    <div className="space-y-6">
      <PageHeader title="LinkedIn" description="Your account connection, session, and outreach controls in one place." />
      {notice ? <Notice tone="success">{notice}</Notice> : null}

      <AccountPanel
        title="Account connection"
        description="Outreach uses a browser session from your own LinkedIn account."
        icon={<Linkedin className="size-4" />}
        action={account ? <StatusBadge status={account.status} /> : undefined}
      >
        {accounts.isLoading ? <Skeleton className="h-32 w-full" /> : accounts.isError ? (
          <AccountQueryError message="LinkedIn account status could not be loaded." onRetry={() => void accounts.refetch()} />
        ) : !account ? (
          <Empty title="No LinkedIn account connected" hint="Add a stored browser session in the advanced setup below. Connecting a session does not verify it or change the server's sending settings." icon={<Linkedin className="size-5" />} />
        ) : (
          <div className="space-y-5">
            <div className="flex items-start gap-3">
              <Avatar name={account.handle ?? "LinkedIn account"} />
              <div className="min-w-0">
                {profileUrl ? <a href={profileUrl} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1.5 break-all text-sm font-semibold hover:text-signal">{account.handle}<ExternalLink className="size-3.5 shrink-0" /></a> : <p className="break-all text-sm font-semibold">{account.handle ?? "Your LinkedIn account"}</p>}
                <p className="mt-1 text-xs text-muted-foreground">{account.status === "disconnected" ? "No session is stored. Reconnect below to use this account again." : account.connected_at ? `Session last stored ${relative(account.connected_at)} · validity not independently checked` : "Session validity is not independently checked."}</p>
              </div>
            </div>
            {account.paused_reason && account.status === "paused" ? <Notice tone="info"><span className="font-medium">Pause reason:</span> {account.paused_reason}</Notice> : null}
            <div className="flex flex-wrap items-end gap-3 border-t pt-4">
              {account.status === "connected" ? (
                <>
                  <div className="min-w-0 flex-1 basis-64 space-y-2"><Label htmlFor="pause-reason">Pause reason <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="pause-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Reviewing our outreach" maxLength={400} disabled={busy} /></div>
                  <Button type="button" variant="outline" disabled={busy} onClick={() => { setNotice(null); pause.mutate(); }}><Pause className="size-4" />{pause.isPending ? "Pausing…" : "Pause outreach"}</Button>
                </>
              ) : account.status === "paused" ? (
                <Button type="button" disabled={busy} onClick={() => { resume.reset(); setConfirm("resume"); }}><Play className="size-4" />Resume outreach</Button>
              ) : <p className="text-xs text-muted-foreground">A new stored session is required before outreach can resume.</p>}
              {account.status !== "disconnected" ? <Button type="button" variant="ghost" disabled={busy} onClick={() => { disconnect.reset(); setConfirm("disconnect"); }}><Unplug className="size-4" />Disconnect</Button> : null}
            </div>
            {pause.isError && account.status === "connected" ? <Notice tone="error">{accountError(pause.error, "Outreach could not be paused. Please try again.")}</Notice> : null}
          </div>
        )}
      </AccountPanel>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Current daily cap" value={limits.isLoading || limits.isError || !hasSession ? "—" : limits.data?.current_daily_cap ?? "—"} hint={hasSession ? "Invitations per day · controlled by the server" : "Available after a session is connected"} />
        <Stat label="Sending mode" value={limits.isLoading || limits.isError ? "—" : mode} hint={dryRun === true ? "Requests are simulated; nothing is sent" : dryRun === false ? "Live requests may contact LinkedIn" : "Not reported by the server"} />
        <Stat label="Outreach worker" value={limits.isLoading || limits.isError ? "—" : workerEnabled === true ? "Enabled" : workerEnabled === false ? "Disabled" : "Unknown"} hint="Configured on the server, not a live health check" />
      </div>
      {limits.isError ? <AccountQueryError message="Sending settings could not be loaded. Do not assume that live outreach is disabled." onRetry={() => void limits.refetch()} /> : workerEnabled === false ? (
        <Notice tone="info">The outreach worker is disabled on the server. Connecting or resuming an account does not enable it.</Notice>
      ) : dryRun === true ? <Notice tone="info">Dry run is enabled. Outreach requests are simulated rather than sent to LinkedIn.</Notice> : null}

      <Notice tone="info">
        <p className="font-semibold">Understand the platform risk</p>
        <p className="mt-1 leading-relaxed">Automated messaging may violate LinkedIn&apos;s User Agreement and can lead to account restrictions. Daily caps and pacing do not make it permitted or risk-free. Prefer dry run and manual sending if you are unsure.</p>
      </Notice>

      <details open={!accounts.isLoading && !accounts.isError && !hasSession} className="group overflow-hidden rounded-xl border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground"><LockKeyhole className="size-4" /></span><span><span className="block text-sm font-semibold">{hasSession ? "Replace browser session" : "Connect browser session"}</span><span className="mt-1 block text-xs text-muted-foreground">Advanced setup · Playwright storage state</span></span></span>
          <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <form className="space-y-4 border-t p-5" onSubmit={(event) => { event.preventDefault(); if (!busy && riskAccepted) { setNotice(null); connect.mutate(); } }}>
          <p className="text-sm leading-relaxed text-muted-foreground">Sign in yourself, including any two-factor checks, and export a Playwright storage state. The stored session is encrypted at rest and is not returned by the API. We do not ask for your password.</p>
          <div className="rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed"><p className="mb-2 font-medium">From a local checkout of this project:</p><code className="break-all">python scripts/linkedin_session.py --out session.json</code><p className="mt-2 text-muted-foreground">Paste the complete file below. This grants access to the signed-in account; do not share the file or commit it to source control.</p></div>
          <div className="space-y-2"><Label htmlFor="linkedin-handle">Profile URL or handle <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="linkedin-handle" value={handle} onChange={(event) => setHandle(event.target.value)} placeholder="https://www.linkedin.com/in/your-name" disabled={busy} autoComplete="off" /></div>
          <div className="space-y-2"><Label htmlFor="storage-state">Storage state JSON</Label><Textarea id="storage-state" value={storageState} onChange={(event) => setStorageState(event.target.value)} placeholder={'{"cookies": [...], "origins": [...]}'} className="min-h-44 font-mono text-xs" disabled={busy} required spellCheck={false} autoComplete="off" autoCapitalize="none" /><p className="text-xs text-muted-foreground">Only the JSON structure is checked here. A stored session may still be expired or rejected by LinkedIn.</p></div>
          <label className="flex items-start gap-2.5 text-xs leading-relaxed text-muted-foreground"><input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[hsl(var(--signal))]" checked={riskAccepted} onChange={(event) => setRiskAccepted(event.target.checked)} disabled={busy} required /><span>I understand the platform risk and that storing this session can allow outreach when the server has live sending enabled.</span></label>
          {connect.isError ? <Notice tone="error">{accountError(connect.error, "The session could not be stored. Please try again or check the server's encryption configuration.")}</Notice> : null}
          <Button type="submit" disabled={busy || !storageState.trim() || !riskAccepted}>{connect.isPending ? "Storing session…" : hasSession ? "Replace stored session" : "Store session"}</Button>
        </form>
      </details>

      <AccountPanel title="Outreach controls" description="What the software enforces—not a guarantee of platform compliance.">
        <dl>
          <AccountDetail label="Volume">Daily caps and randomized gaps pace send requests. The current cap above comes from your server.</AccountDetail>
          <AccountDetail label="Pause behavior">Account and campaign pauses are checked before the next send.</AccountDetail>
          <AccountDetail label="Replies">A recorded reply stops that lead&apos;s sequence.</AccountDetail>
          <AccountDetail label="Accountability"><Link href="/audit" className="text-signal hover:underline">Review outreach activity in the audit log</Link>.</AccountDetail>
        </dl>
      </AccountPanel>

      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => { if (!open && !busy) setConfirm(null); }}
        title={confirm === "disconnect" ? "Disconnect this LinkedIn session?" : "Resume LinkedIn outreach?"}
        description={confirm === "disconnect" ? "The stored session is removed from this workspace. You must store a new session to reconnect." : "Queued outreach may send when the worker is enabled and dry run is off."}
        footer={<><Button type="button" variant="outline" disabled={busy} onClick={() => setConfirm(null)}>Cancel</Button><Button type="button" variant={confirm === "disconnect" ? "destructive" : "default"} disabled={busy} onClick={() => { if (confirm === "disconnect" && account) disconnect.mutate(account.id); else if (confirm === "resume") resume.mutate(); }}>{busy ? "Updating…" : confirm === "disconnect" ? "Disconnect session" : "Resume outreach"}</Button></>}
      >
        {confirm === "disconnect" ? <p className="text-sm leading-relaxed">This does not sign you out of LinkedIn in your own browser or revoke the session at LinkedIn. Disconnecting removes this workspace&apos;s stored copy.</p> : <p className="text-sm leading-relaxed">Sending mode: <span className="font-semibold">{limits.isError || limits.isLoading ? "Unknown" : mode}</span>. Resuming does not validate the session, change server settings, or remove LinkedIn&apos;s automation risk.</p>}
        {confirm === "resume" && resume.isError ? <Notice tone="error">{accountError(resume.error, "Outreach could not be resumed. Please try again.")}</Notice> : null}
        {confirm === "disconnect" && disconnect.isError ? <Notice tone="error">{accountError(disconnect.error, "The session could not be disconnected. Please try again.")}</Notice> : null}
      </Dialog>
    </div>
  );
}

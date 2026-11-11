"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  Label,
  Skeleton,
  Textarea,
} from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { relative } from "@/lib/utils";

export default function LinkedinPage() {
  const queryClient = useQueryClient();
  const [handle, setHandle] = useState("");
  const [storageState, setStorageState] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const accounts = useQuery({ queryKey: ["linkedin"], queryFn: api.linkedin });
  const limits = useQuery({ queryKey: ["linkedin", "limits"], queryFn: api.linkedinLimits });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["linkedin"] });
    queryClient.invalidateQueries({ queryKey: ["credits"] });
  };

  const connect = useMutation({
    mutationFn: () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(storageState);
      } catch {
        throw new ApiError(0, "invalid_json", "That is not valid JSON. Paste the storage state file as-is.");
      }
      return api.connectLinkedin(parsed, handle || undefined);
    },
    onSuccess: () => {
      setStorageState("");
      setError(null);
      invalidate();
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Could not store the session. Is SESSION_ENCRYPTION_KEY set?"),
  });
  const pause = useMutation({
    mutationFn: () => api.pauseLinkedin(reason || "paused from dashboard"),
    onSuccess: () => {
      setReason("");
      invalidate();
    },
  });
  const resume = useMutation({ mutationFn: api.resumeLinkedin, onSuccess: invalidate });

  const account = accounts.data?.[0];

  return (
    <div className="space-y-5">
      <PageHeader
        title="LinkedIn"
        description="Outreach runs from your own account using a stored browser session. Rate limits ramp up slowly and every send is audited."
      />

      {accounts.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : !account ? (
        <Empty
          title="No account connected"
          hint="Connect the LinkedIn account you want outreach to come from. Nothing can send until this is done."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {account.handle ?? "LinkedIn account"}
              <Badge
                tone={
                  account.status === "connected" ? "success" : account.status === "paused" ? "warning" : "muted"
                }
              >
                {account.status}
              </Badge>
            </CardTitle>
            <CardDescription>
              {account.connected_at ? `Connected ${relative(account.connected_at)}` : "Not connected yet"}
              {account.paused_reason ? ` · ${account.paused_reason}` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <dl className="grid gap-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Daily cap now</dt>
                <dd className="font-medium">{limits.data?.current_daily_cap ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Sending</dt>
                <dd className="font-medium">{limits.data?.dry_run ? "Dry run (nothing sends)" : "Live"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Worker</dt>
                <dd className="font-medium">{limits.data?.outreach_enabled ? "Enabled" : "Disabled by env"}</dd>
              </div>
            </dl>
            <div className="flex flex-wrap items-end gap-2">
              {account.status === "connected" ? (
                <>
                  <div className="min-w-[220px] flex-1 space-y-1.5">
                    <Label htmlFor="pause-reason">Pause reason (optional)</Label>
                    <Input
                      id="pause-reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Reviewing messages this week"
                    />
                  </div>
                  <Button variant="destructive" onClick={() => pause.mutate()} disabled={pause.isPending}>
                    Pause outreach
                  </Button>
                </>
              ) : (
                <Button onClick={() => resume.mutate()} disabled={resume.isPending}>
                  Resume outreach
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{account ? "Replace the session" : "Connect your session"}</CardTitle>
          <CardDescription>
            Export a Playwright storage state after signing in to LinkedIn, then paste it here. The session is
            encrypted at rest and never returned by the API. We do not ask for your password.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="handle">Profile URL or handle (optional)</Label>
            <Input
              id="handle"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="https://www.linkedin.com/in/your-name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="storage-state">Storage state JSON</Label>
            <Textarea
              id="storage-state"
              value={storageState}
              onChange={(e) => setStorageState(e.target.value)}
              className="min-h-[140px] font-mono text-xs"
              placeholder={'{"cookies": [...], "origins": [...]}'}
              spellCheck={false}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Generate it locally with{" "}
            <code className="rounded bg-muted px-1 py-0.5">
              python scripts/linkedin_session.py --out session.json
            </code>
            , then paste the file contents.
          </p>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button onClick={() => connect.mutate()} disabled={connect.isPending || !storageState.trim()}>
            {connect.isPending ? "Storing…" : "Store session"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How sending stays safe</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>New accounts start at 5 invitations a day and ramp to a ceiling of 20, with randomized gaps between actions.</p>
          <p>A reply stops that lead&apos;s sequence immediately, and pausing the account halts the worker mid-queue.</p>
          <p>Every queued, sent, failed and skipped message is audited with the lead, step and timestamp.</p>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, KeyRound, Plus, Unplug } from "lucide-react";
import { useState } from "react";

import { AccountCopyButton, AccountPanel, AccountQueryError } from "@/components/account-ui";
import { Badge, Button, Dialog, Empty, Input, Label, Notice, Skeleton, Table, Td, Th } from "@/components/ui";
import { accountError, buildMcpConfig } from "@/lib/account-helpers";
import { api, MCP_URL, type ApiKey } from "@/lib/api";
import { relative, shortDate } from "@/lib/utils";

export function AccountAgents() {
  const queryClient = useQueryClient();
  const [keyName, setKeyName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [newKeyId, setNewKeyId] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const keys = useQuery({ queryKey: ["api-keys"], queryFn: api.apiKeys });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    void queryClient.invalidateQueries({ queryKey: ["audit"] });
  };
  const createKey = useMutation({
    mutationFn: () => api.createApiKey(keyName.trim() || "Agent key"),
    onSuccess: (data) => {
      setNewKey(data.api_key);
      setNewKeyId(data.id);
      setKeyName("");
      setNotice(null);
      invalidate();
    },
  });
  const revokeKey = useMutation({
    mutationFn: (id: string) => api.revokeApiKey(id),
    onSuccess: (_, id) => {
      if (id === newKeyId) { setNewKey(null); setNewKeyId(null); }
      setRevokeTarget(null);
      setNotice("API key revoked. Clients using it can no longer authenticate.");
      invalidate();
    },
  });
  const mcpConfig = buildMcpConfig(MCP_URL, newKey ?? undefined);

  return (
    <div className="space-y-5">
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      <AccountPanel title="API keys" description="Use the same workspace key for the REST API and MCP. Only owners can create or revoke keys." icon={<KeyRound className="size-4" />} action={<Badge tone="muted">Owner access</Badge>}>
        <div className="space-y-5">
          <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); if (!createKey.isPending && !newKey) createKey.mutate(); }}>
            <div className="min-w-0 flex-1 basis-64 space-y-2">
              <Label htmlFor="key-name">Key name</Label>
              <Input id="key-name" value={keyName} onChange={(event) => setKeyName(event.target.value)} placeholder="e.g. Research agent" maxLength={120} disabled={createKey.isPending} />
            </div>
            <Button type="submit" disabled={createKey.isPending || Boolean(newKey)}><Plus className="size-4" />{createKey.isPending ? "Creating…" : "Create key"}</Button>
          </form>
          {createKey.isError ? <Notice tone="error">{accountError(createKey.error, "The key could not be created. Please try again.")}</Notice> : null}
          {newKey ? (
            <div className="space-y-3 rounded-xl border border-signal/25 bg-signal/5 p-4">
              <div><p className="text-sm font-semibold">Save your new key</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">This is the only time it is shown. Treat it like a password and keep it out of source control.</p></div>
              <div className="flex flex-wrap items-start gap-3">
                <code className="min-w-0 flex-1 break-all rounded-lg border bg-card px-3 py-2 text-xs">{newKey}</code>
                <AccountCopyButton value={newKey} label="Copy key" />
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => { setNewKey(null); setNewKeyId(null); }}>I&apos;ve saved this key</Button>
            </div>
          ) : null}
          {keys.isLoading ? <Skeleton className="h-24 w-full" /> : keys.isError ? (
            <AccountQueryError message="API keys could not be loaded." onRetry={() => void keys.refetch()} />
          ) : !keys.data?.length ? (
            <Empty title="No agent keys yet" hint="Create a named key for each client so you can revoke access independently." icon={<KeyRound className="size-5" />} />
          ) : (
            <Table>
              <thead><tr><Th>Key</Th><Th>Created</Th><Th>Last used</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
              <tbody>
                {keys.data.map((key) => (
                  <tr key={key.id}>
                    <Td><p className="font-medium">{key.name}</p><code className="mt-1 block text-xs text-muted-foreground">{key.prefix}…</code></Td>
                    <Td className="whitespace-nowrap text-xs text-muted-foreground">{shortDate(key.created_at)}</Td>
                    <Td className="whitespace-nowrap text-xs text-muted-foreground" title={key.last_used_at ?? undefined}>{key.last_used_at ? relative(key.last_used_at) : "Never"}</Td>
                    <Td className="text-right"><Button type="button" variant="ghost" size="sm" onClick={() => { revokeKey.reset(); setRevokeTarget(key); }}>Revoke</Button></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </AccountPanel>

      <AccountPanel title="Connect an agent with MCP" description="Give an MCP client access to this workspace's tools using a workspace API key." icon={<Bot className="size-4" />}>
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-xs font-medium">MCP endpoint</p>
            <div className="flex flex-wrap items-start gap-3"><code className="min-w-0 flex-1 break-all rounded-lg border bg-muted/40 px-3 py-2.5 text-xs">{MCP_URL}</code><AccountCopyButton value={MCP_URL} label="Copy endpoint" /></div>
            <p className="text-xs leading-relaxed text-muted-foreground">MCP is a separate service from the REST API. For local development, it runs on port 8765.</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3"><p className="text-xs font-medium">Example client configuration</p><AccountCopyButton value={mcpConfig} label="Copy config" /></div>
            <pre className="overflow-x-auto rounded-xl border bg-muted/40 p-4 text-xs leading-relaxed">{mcpConfig}</pre>
            <p className="text-xs leading-relaxed text-muted-foreground">For clients that use JSON <code>mcpServers</code> configuration. Other clients may need a different format; use the same HTTP endpoint and Bearer authorization header.</p>
            {newKey ? <Notice tone="info">This example includes your new key. Keep the copied configuration private.</Notice> : <p className="text-xs text-muted-foreground">Replace <code>lmk_YOUR_API_KEY</code> with a key you have saved.</p>}
          </div>
          <p className="border-t pt-4 text-xs leading-relaxed text-muted-foreground">Agent requests use member-level access. A key can claim leads and request outreach, so grant it only to clients you trust. Revoking a key affects every client using it.</p>
        </div>
      </AccountPanel>

      <Dialog
        open={Boolean(revokeTarget)}
        onOpenChange={(open) => { if (!open && !revokeKey.isPending) setRevokeTarget(null); }}
        title="Revoke this API key?"
        description="This cannot be undone. You can create a replacement key afterwards."
        footer={<><Button type="button" variant="outline" disabled={revokeKey.isPending} onClick={() => setRevokeTarget(null)}>Keep key</Button><Button type="button" variant="destructive" disabled={revokeKey.isPending} onClick={() => { if (revokeTarget) revokeKey.mutate(revokeTarget.id); }}><Unplug className="size-4" />{revokeKey.isPending ? "Revoking…" : "Revoke key"}</Button></>}
      >
        <p className="text-sm">Every client using <span className="font-semibold">{revokeTarget?.name}</span> will lose access to this workspace.</p>
        {revokeKey.isError ? <Notice tone="error">{accountError(revokeKey.error, "The key could not be revoked. Please try again.")}</Notice> : null}
      </Dialog>
    </div>
  );
}

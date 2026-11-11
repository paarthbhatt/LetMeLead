"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";
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
  Table,
  Td,
  Th,
} from "@/components/ui";
import { API_URL, api, ApiError } from "@/lib/api";
import { getSession } from "@/lib/auth";

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [keyName, setKeyName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const tenant = useQuery({ queryKey: ["tenant"], queryFn: api.tenant });
  const members = useQuery({ queryKey: ["members"], queryFn: api.members });
  const keys = useQuery({ queryKey: ["api-keys"], queryFn: api.apiKeys });
  const webhooks = useQuery({ queryKey: ["webhooks"], queryFn: api.webhooks });

  const createKey = useMutation({
    mutationFn: () => api.createApiKey(keyName || "Agent key"),
    onSuccess: (data) => {
      setNewKey(data.api_key);
      setKeyName("");
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Only owners can create API keys."),
  });
  const revokeKey = useMutation({
    mutationFn: (id: string) => api.revokeApiKey(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-keys"] }),
  });
  const addWebhook = useMutation({
    mutationFn: () =>
      api.createWebhook(webhookUrl, ["lead.created", "lead.claimed", "reply.received"]),
    onSuccess: () => {
      setWebhookUrl("");
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
    },
  });
  const removeWebhook = useMutation({
    mutationFn: (id: string) => api.deleteWebhook(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["webhooks"] }),
  });

  const mcpUrl = `${API_URL}/mcp`;
  const token = newKey ?? "lmk_YOUR_API_KEY";
  const mcpConfig = JSON.stringify(
    {
      mcpServers: {
        letmelead: {
          type: "http",
          url: mcpUrl,
          headers: { Authorization: `Bearer ${token}` },
        },
      },
    },
    null,
    2,
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        description="Workspace, team, API keys and the MCP endpoint your agents connect to."
      />

      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
          <CardDescription>What the engine searches for on your behalf.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">Name:</span> {tenant.data?.name ?? "—"}
          </p>
          <p>
            <span className="text-muted-foreground">Website:</span>{" "}
            {tenant.data?.website ? (
              <a href={tenant.data.website} className="text-primary hover:underline" target="_blank" rel="noreferrer">
                {tenant.data.website}
              </a>
            ) : (
              "—"
            )}
          </p>
          <div>
            <p className="text-muted-foreground">ICP brief</p>
            <pre className="mt-1 overflow-x-auto rounded-md bg-muted p-3 text-xs">
              {JSON.stringify(tenant.data?.icp ?? {}, null, 2)}
            </pre>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Team</CardTitle>
          <CardDescription>Owners manage billing and keys; members run outreach; viewers read.</CardDescription>
        </CardHeader>
        <CardContent>
          {members.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Person</Th>
                  <Th>Role</Th>
                </tr>
              </thead>
              <tbody>
                {(members.data ?? []).map((member) => (
                  <tr key={member.id}>
                    <Td>
                      <p className="font-medium">{member.name ?? member.email}</p>
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    </Td>
                    <Td>
                      <Badge tone={member.role === "owner" ? "default" : "muted"}>{member.role}</Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>API keys</CardTitle>
          <CardDescription>The same key authenticates REST and MCP. It is shown once.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1 space-y-1.5">
              <Label htmlFor="key-name">Key name</Label>
              <Input
                id="key-name"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                placeholder="Claude Desktop"
              />
            </div>
            <Button onClick={() => createKey.mutate()} disabled={createKey.isPending}>
              Create key
            </Button>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {newKey ? (
            <div className="space-y-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3">
              <p className="text-sm font-medium">Copy this now — it will not be shown again.</p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{newKey}</code>
                <CopyButton value={newKey} />
              </div>
            </div>
          ) : null}
          {!keys.data?.length ? (
            <Empty title="No API keys yet" hint="Create one to drive the engine from Claude, Codex or Cursor." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Prefix</Th>
                  <Th>Last used</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {keys.data.map((key) => (
                  <tr key={key.id}>
                    <Td className="font-medium">{key.name}</Td>
                    <Td>
                      <code className="text-xs">{key.prefix}…</code>
                    </Td>
                    <Td className="text-muted-foreground">{key.last_used_at ? "recently" : "never"}</Td>
                    <Td className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => revokeKey.mutate(key.id)}>
                        Revoke
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>MCP connection</CardTitle>
          <CardDescription>
            Every dashboard action has a tool. Point an agent at this endpoint and it can find, qualify, claim and
            contact leads on your behalf.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Endpoint</Label>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{mcpUrl}</code>
              <CopyButton value={mcpUrl} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Client config</Label>
            <div className="relative">
              <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{mcpConfig}</pre>
              <div className="mt-2">
                <CopyButton value={mcpConfig} label="Copy config" />
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Claude Desktop: paste under <code>mcpServers</code> in{" "}
            <code>~/Library/Application Support/Claude/claude_desktop_config.json</code>. Cursor:{" "}
            <code>~/.cursor/mcp.json</code>. Codex: <code>~/.codex/config.toml</code>.
            {getSession()?.tenantId ? ` Tenant ${getSession()?.tenantId?.slice(0, 8)}… is bound by the key.` : ""}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Outbound webhooks</CardTitle>
          <CardDescription>Signed with your secret. Retried on failure, delivery is recorded.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[260px] flex-1 space-y-1.5">
              <Label htmlFor="webhook-url">Endpoint URL</Label>
              <Input
                id="webhook-url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://example.com/hooks/letmelead"
              />
            </div>
            <Button onClick={() => addWebhook.mutate()} disabled={addWebhook.isPending || !webhookUrl.trim()}>
              Add webhook
            </Button>
          </div>
          {!webhooks.data?.length ? (
            <Empty title="No webhooks yet" hint="Send lead.created, lead.claimed and reply.received to your CRM." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>URL</Th>
                  <Th>Events</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {webhooks.data.map((hook) => (
                  <tr key={hook.id}>
                    <Td className="max-w-[320px] truncate">{hook.url}</Td>
                    <Td className="text-xs text-muted-foreground">{hook.events.join(", ")}</Td>
                    <Td className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => removeWebhook.mutate(hook.id)}>
                        Delete
                      </Button>
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

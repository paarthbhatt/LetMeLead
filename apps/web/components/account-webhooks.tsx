"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Webhook } from "lucide-react";
import { useState } from "react";

import { AccountPanel, AccountQueryError } from "@/components/account-ui";
import { Badge, Button, Dialog, Empty, Input, Label, Notice, Skeleton } from "@/components/ui";
import { accountError, httpUrl } from "@/lib/account-helpers";
import { api, type Webhook as WebhookRecord } from "@/lib/api";

const EVENTS = [
  { value: "lead.created", label: "New lead found", hint: "A new lead enters the workspace." },
  { value: "lead.claimed", label: "Lead claimed", hint: "A lead is claimed by your team or an agent." },
  { value: "reply.received", label: "Reply received", hint: "An outreach reply is recorded." },
] as const;

export function AccountWebhooks() {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(EVENTS.map((event) => event.value));
  const [removeTarget, setRemoveTarget] = useState<WebhookRecord | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const webhooks = useQuery({ queryKey: ["webhooks"], queryFn: api.webhooks });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["webhooks"] });
    void queryClient.invalidateQueries({ queryKey: ["audit"] });
  };
  const addWebhook = useMutation({
    mutationFn: () => {
      const endpoint = httpUrl(url);
      if (!endpoint) throw new Error("Enter a complete HTTP or HTTPS endpoint URL.");
      if (!events.length) throw new Error("Choose at least one event to subscribe to.");
      return api.createWebhook(endpoint, events);
    },
    onSuccess: () => { setUrl(""); setNotice("Webhook added. Future matching events will be delivered to this endpoint."); invalidate(); },
  });
  const removeWebhook = useMutation({
    mutationFn: (id: string) => api.deleteWebhook(id),
    onSuccess: () => { setRemoveTarget(null); setNotice("Webhook removed."); invalidate(); },
  });

  return (
    <div className="space-y-5">
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      <AccountPanel title="Add an endpoint" description="Send workspace events to your CRM or another service. Only workspace owners can manage webhooks." icon={<Webhook className="size-4" />}>
        <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); if (!addWebhook.isPending) { setNotice(null); addWebhook.mutate(); } }}>
          <div className="space-y-2">
            <Label htmlFor="webhook-url">Endpoint URL</Label>
            <Input id="webhook-url" type="url" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/hooks/letmelead" disabled={addWebhook.isPending} />
            <p className="text-xs text-muted-foreground">Use HTTPS for production. Local HTTP endpoints are supported for development.</p>
          </div>
          <fieldset disabled={addWebhook.isPending}>
            <legend className="mb-2 text-sm font-medium">Events to receive</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {EVENTS.map((event) => (
                <label key={event.value} className="flex cursor-pointer items-start gap-2.5 rounded-lg border bg-muted/20 p-3">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-[hsl(var(--signal))]"
                    checked={events.includes(event.value)}
                    onChange={(change) => setEvents((current) => change.target.checked ? [...current, event.value] : current.filter((value) => value !== event.value))}
                  />
                  <span><span className="block text-xs font-semibold">{event.label}</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{event.hint}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          {addWebhook.isError ? <Notice tone="error">{accountError(addWebhook.error, "The webhook could not be added. Please try again.")}</Notice> : null}
          <Button type="submit" disabled={addWebhook.isPending || !url.trim() || !events.length}><Plus className="size-4" />{addWebhook.isPending ? "Adding…" : "Add webhook"}</Button>
        </form>
      </AccountPanel>

      <AccountPanel title="Subscribed endpoints" description="Each endpoint receives only the events listed below." action={webhooks.data ? <Badge tone="muted">{webhooks.data.length} {webhooks.data.length === 1 ? "endpoint" : "endpoints"}</Badge> : undefined}>
        {webhooks.isLoading ? <Skeleton className="h-28 w-full" /> : webhooks.isError ? (
          <AccountQueryError message="Webhook endpoints could not be loaded." onRetry={() => void webhooks.refetch()} />
        ) : !webhooks.data?.length ? (
          <Empty title="No endpoints yet" hint="Subscribe an endpoint to keep another service up to date with your workspace." icon={<Webhook className="size-5" />} />
        ) : (
          <div className="divide-y">
            {webhooks.data.map((hook) => (
              <div key={hook.id} className="flex flex-wrap items-start justify-between gap-3 py-4 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1 basis-72 space-y-2">
                  <div className="flex flex-wrap items-center gap-2"><p className="break-all text-sm font-medium">{hook.url}</p><Badge tone={hook.active ? "success" : "muted"}>{hook.active ? "Active" : "Inactive"}</Badge></div>
                  <div className="flex flex-wrap gap-1.5">{hook.events.map((event) => <Badge key={event} tone="muted">{EVENTS.find((option) => option.value === event)?.label ?? event}</Badge>)}</div>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => { removeWebhook.reset(); setRemoveTarget(hook); }}><Trash2 className="size-3.5" />Remove</Button>
              </div>
            ))}
          </div>
        )}
      </AccountPanel>
      <p className="text-xs leading-relaxed text-muted-foreground">Deliveries are signed by the server and retried on failure. Signing secrets and delivery history are not exposed in this dashboard.</p>

      <Dialog
        open={Boolean(removeTarget)}
        onOpenChange={(open) => { if (!open && !removeWebhook.isPending) setRemoveTarget(null); }}
        title="Remove this webhook?"
        description="This removes the endpoint's subscription to future workspace events."
        footer={<><Button type="button" variant="outline" disabled={removeWebhook.isPending} onClick={() => setRemoveTarget(null)}>Keep endpoint</Button><Button type="button" variant="destructive" disabled={removeWebhook.isPending} onClick={() => { if (removeTarget) removeWebhook.mutate(removeTarget.id); }}>{removeWebhook.isPending ? "Removing…" : "Remove webhook"}</Button></>}
      >
        <p className="break-all rounded-lg bg-muted/40 p-3 text-sm">{removeTarget?.url}</p>
        {removeWebhook.isError ? <Notice tone="error">{accountError(removeWebhook.error, "The webhook could not be removed. Please try again.")}</Notice> : null}
      </Dialog>
    </div>
  );
}

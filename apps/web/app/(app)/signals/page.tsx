"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Radio } from "lucide-react";
import { useState } from "react";

import { PageHeader } from "@/components/shell";
import { Badge, Button, Card, CardContent, Skeleton } from "@/components/ui";
import { api, ApiError, type SignalDef } from "@/lib/api";
import { cn } from "@/lib/utils";

const CHANNEL_LABEL: Record<string, string> = {
  linkedin: "LinkedIn",
  email: "Email",
  x: "X",
};

const STATUS_TONE: Record<SignalDef["status"], "success" | "default" | "muted"> = {
  live: "success",
  partly_live: "default",
  by_hand: "muted",
};

function Channels({ channels }: { channels: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {channels.map((channel) => (
        <Badge key={channel} tone="muted">
          {CHANNEL_LABEL[channel] ?? channel}
        </Badge>
      ))}
    </div>
  );
}

function StatusBadge({ signal }: { signal: SignalDef }) {
  return (
    <Badge tone={STATUS_TONE[signal.status]} title={signal.status_label}>
      {signal.status_label}
    </Badge>
  );
}

function SignalDetails({ signal }: { signal: SignalDef }) {
  return (
    <div className="mt-2 space-y-1.5 text-xs">
      <p>
        <span className="font-semibold text-foreground">Why now</span>{" "}
        <span className="text-muted-foreground">{signal.why_now}</span>
      </p>
      <p>
        <span className="font-semibold text-foreground">How it works</span>{" "}
        <span className="text-muted-foreground">{signal.how_it_works}</span>
      </p>
    </div>
  );
}

function Toggle({
  checked,
  disabled,
  onChange,
  busy,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  busy?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled || busy}
      onClick={onChange}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        checked ? "bg-primary border-primary" : "bg-input border-transparent",
        disabled && "cursor-not-allowed opacity-40",
      )}
    >
      <span
        className={cn(
          "pointer-events-none block h-4 w-4 rounded-full bg-background shadow transition-transform",
          checked ? "translate-x-4" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

export default function SignalsPage() {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const catalog = useQuery({ queryKey: ["signalCatalog"], queryFn: api.signalCatalog });

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => api.setSignal(id, enabled),
    onSuccess: (data) => {
      setNotice(data.enabled ? "Signal on. Its sources are live for your next search." : "Signal off.");
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["signalCatalog"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not change the signal."),
  });

  const findLeads = useMutation({
    mutationFn: (sources: string[]) => api.scan({ sources, wait: false }),
    onSuccess: () => {
      setNotice("Search started. New leads appear on the Leads page once it finishes.");
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not start the search."),
  });

  if (catalog.isLoading) {
    return (
      <div className="space-y-3">
        <PageHeader title="Your signals" />
        <Skeleton className="h-24" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (catalog.isError || !catalog.data) {
    return (
      <div className="space-y-3">
        <PageHeader title="Your signals" />
        <p role="alert" className="text-sm text-destructive">Could not load the signal catalog. Is the API running?</p>
      </div>
    );
  }

  const { categories, legend } = catalog.data;
  const allSignals = categories.flatMap((category) => category.signals);
  const onSignals = allSignals.filter((signal) => signal.enabled);
  const onCount = onSignals.length;

  const shownCategories = showAll ? categories : categories.map((c) => ({
    ...c,
    signals: c.signals.filter((s) => s.enabled),
  })).filter((c) => c.signals.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Your signals"
        description={
          `Set up for you by the LetMeLead engine. ${onCount} on. Leads with these signals come first. ` +
          "Change them any time below."
        }
        actions={
          <Button variant={showAll ? "outline" : "default"} onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Show your signals" : "Show all signals"}
          </Button>
        }
      />

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

      {shownCategories.map((category) => (
        <section key={category.id} aria-label={category.label} className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold tracking-tight">{category.label}</h2>
            <span className="text-xs text-muted-foreground">
              {category.signals.filter((s) => s.enabled).length} on of {category.signals.length}
            </span>
          </div>
          <div className="space-y-2">
            {category.signals.map((signal) => (
              <Card key={signal.id}>
                <CardContent className="flex gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{signal.label}</h3>
                      <StatusBadge signal={signal} />
                      {signal.enabled ? <Badge tone="muted">In your signals</Badge> : null}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{signal.description}</p>
                    {signal.enabled ? (
                      <>
                        <SignalDetails signal={signal} />
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Channels channels={signal.channels} />
                          {signal.automatic ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => findLeads.mutate(signal.adapters)}
                              disabled={findLeads.isPending}
                            >
                              <Radio className="size-3.5" aria-hidden />
                              Find leads
                            </Button>
                          ) : null}
                        </div>
                      </>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <Toggle
                      checked={signal.enabled}
                      disabled={!signal.automatic}
                      busy={toggle.isPending && toggle.variables?.id === signal.id}
                      label={`${signal.enabled ? "Turn off" : "Turn on"} ${signal.label}`}
                      onChange={() => toggle.mutate({ id: signal.id, enabled: !signal.enabled })}
                    />
                    {signal.status === "by_hand" ? (
                      <span className="text-[10px] text-muted-foreground">by hand</span>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ))}

      <footer className="space-y-1 border-t pt-4 text-xs text-muted-foreground">
        <p><span className="font-medium text-foreground">Live</span> — {legend.live}</p>
        <p><span className="font-medium text-foreground">Partly live</span> — {legend.partly_live}</p>
        <p><span className="font-medium text-foreground">By hand</span> — {legend.by_hand}</p>
        <p className="pt-1">Signals show timing, not intent to buy. Every lead carries its source URL, a plain-language reason and the age of the evidence.</p>
      </footer>
    </div>
  );
}

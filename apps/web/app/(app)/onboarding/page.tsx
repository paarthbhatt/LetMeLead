"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { PageHeader } from "@/components/shell";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
} from "@/components/ui";
import { api, ApiError } from "@/lib/api";

export default function OnboardingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const tenant = useQuery({ queryKey: ["tenant"], queryFn: api.tenant });
  const [website, setWebsite] = useState("");
  const [offer, setOffer] = useState("");
  const [buyers, setBuyers] = useState("");
  const [roles, setRoles] = useState("");
  const [targets, setTargets] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenant.data) return;
    setWebsite((current) => current || tenant.data?.website || "");
    setOffer((current) => current || String(tenant.data?.icp?.offer ?? ""));
    setBuyers((current) => current || ((tenant.data?.icp?.buyers as string[]) ?? []).join(", "));
    setRoles((current) => current || ((tenant.data?.icp?.roles as string[]) ?? []).join(", "));
  }, [tenant.data]);

  const run = useMutation({
    mutationFn: async () => {
      const parsedTargets = targets
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [company, domain, country] = line.split(",").map((part) => part.trim());
          return { company, domain, country: country || undefined };
        })
        .filter((t) => t.company && t.domain);

      return api.onboarding({
        website: website || undefined,
        offer: offer || undefined,
        buyers: buyers ? buyers.split(",").map((b) => b.trim()).filter(Boolean) : undefined,
        roles: roles ? roles.split(",").map((r) => r.trim()).filter(Boolean) : undefined,
        targets: parsedTargets,
        discover: false,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tenant"] });
      router.push("/leads");
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Onboarding failed."),
  });

  const scan = useMutation({
    mutationFn: () => api.scan({ wait: false }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Set up your workspace"
        description="Paste your website once. The brief drives which signals count, and the target list drives who gets scanned."
        actions={
          <Button variant="outline" onClick={() => router.push("/leads")}>
            Skip for now
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>1. Your website → ICP brief</CardTitle>
          <CardDescription>
            We fetch the page, extract your offer and buyer personas. Bot-protected pages are refused, not guessed at.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Input
              aria-label="Website"
              placeholder="https://your-company.com"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="max-w-md"
            />
            <Button onClick={() => run.mutate()} disabled={run.isPending || !website}>
              {run.isPending ? "Building brief…" : "Build brief"}
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="offer">What you sell (one sentence)</Label>
              <Textarea id="offer" value={offer} onChange={(e) => setOffer(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="buyers">Buyer personas (comma separated)</Label>
              <Textarea id="buyers" value={buyers} onChange={(e) => setBuyers(e.target.value)} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="roles">Role keywords used to spot hiring signals</Label>
              <Input id="roles" value={roles} onChange={(e) => setRoles(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Target companies</CardTitle>
          <CardDescription>
            One per line as <code>company,domain,country</code>. These are scanned for news, job postings and public
            discussions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            aria-label="Targets"
            className="min-h-[120px] font-mono text-xs"
            placeholder={"Acme AI,acme.ai,US\nVector Labs,vectorlabs.io,GB"}
            value={targets}
            onChange={(e) => setTargets(e.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            Adding targets saves your brief and list, then you can run the first scan.
          </p>
        </CardContent>
      </Card>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button size="md" onClick={() => run.mutate()} disabled={run.isPending}>
          Save and continue
        </Button>
        <Button
          variant="outline"
          onClick={() => scan.mutate()}
          disabled={scan.isPending}
        >
          {scan.isPending ? "Starting scan…" : "Save and run first scan"}
        </Button>
        {scan.data ? <Badge tone="success">Scan {scan.data.status}</Badge> : null}
        {tenant.data?.onboarding_complete ? <Badge tone="muted">Brief complete</Badge> : null}
      </div>
    </div>
  );
}

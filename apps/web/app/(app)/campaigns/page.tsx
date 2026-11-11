"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
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
} from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { shortDate } from "@/lib/utils";

export default function CampaignsPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const campaigns = useQuery({ queryKey: ["campaigns"], queryFn: api.campaigns });
  const create = useMutation({
    mutationFn: () => api.createCampaign({ name }),
    onSuccess: () => {
      setName("");
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not create the campaign."),
  });
  const pause = useMutation({
    mutationFn: (id: string) => api.pauseCampaign(id, "paused from dashboard"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["campaigns"] }),
  });
  const resume = useMutation({
    mutationFn: (id: string) => api.resumeCampaign(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["campaigns"] }),
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Campaigns"
        description="A campaign is a sequence plus the leads you approved. Nothing sends until a LinkedIn account is connected."
      />

      <Card>
        <CardHeader>
          <CardTitle>New campaign</CardTitle>
          <CardDescription>Starts with a two-step, signal-led sequence you can edit.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim()) create.mutate();
            }}
          >
            <div className="min-w-[240px] flex-1 space-y-1.5">
              <Label htmlFor="campaign-name">Name</Label>
              <Input id="campaign-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Q4 compliance push" />
            </div>
            <Button type="submit" disabled={create.isPending || !name.trim()}>
              {create.isPending ? "Creating…" : "Create draft"}
            </Button>
          </form>
          {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>

      {campaigns.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : !campaigns.data?.length ? (
        <Empty title="No campaigns yet" hint="Claim a few leads, then create a campaign to reach out." />
      ) : (
        <div className="grid gap-3">
          {campaigns.data.map((campaign) => (
            <Card key={campaign.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <Link href={`/campaigns/${campaign.id}`} className="font-medium hover:underline">
                    {campaign.name}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge tone={campaign.status === "active" ? "success" : campaign.status === "paused" ? "warning" : "muted"}>
                      {campaign.status}
                    </Badge>
                    <span>created {shortDate(campaign.created_at)}</span>
                    {campaign.daily_cap ? <span>cap {campaign.daily_cap}/day</span> : null}
                    {campaign.pause_reason ? <span>· {campaign.pause_reason}</span> : null}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link href={`/campaigns/${campaign.id}`}>
                    <Button size="sm" variant="outline">
                      Open
                    </Button>
                  </Link>
                  {campaign.status === "active" ? (
                    <Button size="sm" variant="destructive" onClick={() => pause.mutate(campaign.id)}>
                      Pause
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => resume.mutate(campaign.id)}>
                      Resume
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Eye, Send } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
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
  Empty,
  Input,
  Label,
  Skeleton,
  Table,
  Td,
  Th,
  Textarea,
} from "@/components/ui";
import { api, ApiError, type SequenceStepInput } from "@/lib/api";
import { relative, shortDate } from "@/lib/utils";

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [steps, setSteps] = useState<SequenceStepInput[]>([]);
  const [leadId, setLeadId] = useState("");
  const [preview, setPreview] = useState<{ step_no: number; kind: string; body: string; lead: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const campaign = useQuery({ queryKey: ["campaign", params.id], queryFn: () => api.campaign(params.id) });
  const messages = useQuery({ queryKey: ["campaign-messages", params.id], queryFn: () => api.campaignMessages(params.id) });
  const leads = useQuery({ queryKey: ["leads", "claimed"], queryFn: () => api.leads({ status: "claimed", limit: 50 }) });

  useEffect(() => {
    if (campaign.data?.sequence?.steps) setSteps(campaign.data.sequence.steps);
  }, [campaign.data]);

  const saveSequence = useMutation({
    mutationFn: () => api.updateSequence(params.id, { name: campaign.data?.sequence?.name ?? "Sequence", steps }),
    onSuccess: () => {
      setNotice("Sequence saved.");
      queryClient.invalidateQueries({ queryKey: ["campaign", params.id] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not save the sequence."),
  });

  const queue = useMutation({
    mutationFn: () => api.queueCampaign(params.id, leadId ? [leadId] : []),
    onSuccess: (data) => {
      setNotice(`${data.queued} message(s) queued.`);
      queryClient.invalidateQueries({ queryKey: ["campaign", params.id] });
      queryClient.invalidateQueries({ queryKey: ["campaign-messages", params.id] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not queue messages."),
  });

  const send = useMutation({
    mutationFn: () => api.sendCampaign(params.id),
    onSuccess: (data) => {
      setNotice(`Send run: ${JSON.stringify(data)}`);
      queryClient.invalidateQueries({ queryKey: ["campaign", params.id] });
      queryClient.invalidateQueries({ queryKey: ["campaign-messages", params.id] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not run the sender."),
  });

  const pause = useMutation({
    mutationFn: () => api.pauseCampaign(params.id, "paused from dashboard"),
    onSuccess: () => {
      setNotice("Campaign paused immediately.");
      queryClient.invalidateQueries({ queryKey: ["campaign", params.id] });
    },
  });

  const resume = useMutation({
    mutationFn: () => api.resumeCampaign(params.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["campaign", params.id] }),
  });

  async function loadPreview() {
    if (!leadId) return;
    setError(null);
    try {
      setPreview(await api.preview(params.id, leadId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not render the preview.");
    }
  }

  if (campaign.isLoading) return <Skeleton className="h-64 w-full" />;
  if (!campaign.data) return <Empty title="Campaign not found" />;
  const data = campaign.data;

  return (
    <div className="space-y-5">
      <Link href="/campaigns" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> All campaigns
      </Link>

      <PageHeader
        title={data.name}
        description={`${data.lead_count} leads · ${data.messages_sent} sent · ${data.pending} pending · ${data.replies} replies`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => queue.mutate()} disabled={queue.isPending}>
              Queue next step
            </Button>
            <Button onClick={() => send.mutate()} disabled={send.isPending || data.status !== "active"}>
              <Send className="size-4" aria-hidden />
              {send.isPending ? "Sending…" : "Send due"}
            </Button>
            {data.status === "active" ? (
              <Button variant="destructive" onClick={() => pause.mutate()}>
                Pause
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => resume.mutate()}>
                Resume
              </Button>
            )}
          </div>
        }
      />

      {notice ? <p className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm">{notice}</p> : null}
      {error ? <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Sequence</CardTitle>
            <CardDescription>
              Placeholders: {"{signal}"}, {"{company}"}, {"{offer}"}, {"{title}"}. Without placeholders the text is written
              per lead from its evidence.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {steps.map((step, index) => (
              <div key={step.step_no} className="space-y-2 rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="muted">step {step.step_no}</Badge>
                  <select
                    aria-label={`Step ${step.step_no} kind`}
                    className="h-8 rounded-md border bg-background px-2 text-xs"
                    value={step.kind}
                    onChange={(e) => {
                      const next = [...steps];
                      next[index] = { ...step, kind: e.target.value };
                      setSteps(next);
                    }}
                  >
                    <option value="connect">connection request</option>
                    <option value="message">message</option>
                  </select>
                  <Label htmlFor={`delay-${step.step_no}`} className="text-xs text-muted-foreground">
                    delay (days)
                  </Label>
                  <Input
                    id={`delay-${step.step_no}`}
                    type="number"
                    min={0}
                    max={30}
                    className="h-8 w-20"
                    value={step.delay_days}
                    onChange={(e) => {
                      const next = [...steps];
                      next[index] = { ...step, delay_days: Number(e.target.value) };
                      setSteps(next);
                    }}
                  />
                </div>
                <Textarea
                  aria-label={`Step ${step.step_no} body`}
                  value={step.body_template}
                  onChange={(e) => {
                    const next = [...steps];
                    next[index] = { ...step, body_template: e.target.value };
                    setSteps(next);
                  }}
                />
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => saveSequence.mutate()} disabled={saveSequence.isPending}>
                Save sequence
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  setSteps([
                    ...steps,
                    { step_no: steps.length + 1, kind: "message", body_template: "Following up — worth a quick chat?", delay_days: 4 },
                  ])
                }
                disabled={steps.length >= 10}
              >
                Add step
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preview a message</CardTitle>
            <CardDescription>Rendered for one lead, from its own evidence. Nothing is sent.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <select
              aria-label="Lead"
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={leadId}
              onChange={(e) => setLeadId(e.target.value)}
            >
              <option value="">Select a claimed lead…</option>
              {leads.data?.items.map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {lead.company}
                </option>
              ))}
            </select>
            <Button variant="outline" onClick={loadPreview} disabled={!leadId}>
              <Eye className="size-4" aria-hidden /> Preview
            </Button>
            {preview ? (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <p className="text-xs text-muted-foreground">
                  step {preview.step_no} · {preview.kind} · {preview.lead}
                </p>
                <p className="mt-2 whitespace-pre-wrap">{preview.body}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Messages</CardTitle>
          <CardDescription>Every send is recorded, including failures and dry runs.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {!messages.data?.length ? (
            <Empty className="m-4" title="Nothing queued yet" hint="Queue the next step for your claimed leads." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Lead</Th>
                  <Th>Step</Th>
                  <Th>Status</Th>
                  <Th>Message</Th>
                  <Th>When</Th>
                </tr>
              </thead>
              <tbody>
                {messages.data.map((message) => (
                  <tr key={message.id}>
                    <Td className="text-xs">{message.lead_id.slice(0, 8)}</Td>
                    <Td>{message.step_no}</Td>
                    <Td>
                      <Badge
                        tone={
                          message.status === "sent"
                            ? "success"
                            : message.status === "failed"
                              ? "danger"
                              : message.status === "skipped"
                                ? "muted"
                                : "warning"
                        }
                      >
                        {message.status}
                      </Badge>
                    </Td>
                    <Td className="max-w-[28rem]">
                      <p className="line-clamp-2 text-sm">{message.body}</p>
                      {message.error ? <p className="text-xs text-destructive">{message.error}</p> : null}
                    </Td>
                    <Td className="whitespace-nowrap text-xs text-muted-foreground">
                      {message.sent_at ? relative(message.sent_at) : shortDate(message.scheduled_at)}
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

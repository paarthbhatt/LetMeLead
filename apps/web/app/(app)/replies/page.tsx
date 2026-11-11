"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { PageHeader } from "@/components/shell";
import { Badge, Button, Card, CardContent, Empty, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { relative } from "@/lib/utils";

export default function RepliesPage() {
  const queryClient = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const replies = useQuery({ queryKey: ["replies", unreadOnly], queryFn: () => api.replies(unreadOnly) });
  const leads = useQuery({ queryKey: ["leads", "reply-names"], queryFn: () => api.leads({ limit: 100 }) });

  const markRead = useMutation({
    mutationFn: (id: string) => api.markReplyRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["replies"] }),
  });

  const names = new Map((leads.data?.items ?? []).map((lead) => [lead.id, lead.company]));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Replies"
        description="A reply stops that lead's sequence automatically, so nobody gets pitched after they answer."
        actions={
          <Button variant={unreadOnly ? "default" : "outline"} size="sm" onClick={() => setUnreadOnly(!unreadOnly)}>
            {unreadOnly ? "Showing unread" : "Show unread only"}
          </Button>
        }
      />

      {replies.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !replies.data?.items.length ? (
        <Empty
          title="No replies yet"
          hint="Replies arrive from the LinkedIn worker or via POST /v1/replies/ingest. Both stop the sequence."
        />
      ) : (
        <div className="grid gap-3">
          {replies.data.items.map((reply) => (
            <Card key={reply.id} className={reply.read_at ? "opacity-80" : undefined}>
              <CardContent className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Link href={`/leads/${reply.lead_id}`} className="font-medium hover:underline">
                      {names.get(reply.lead_id) ?? reply.lead_id.slice(0, 8)}
                    </Link>
                    {reply.read_at ? <Badge tone="muted">read</Badge> : <Badge tone="warning">new</Badge>}
                    {reply.stop_sequence ? <Badge tone="success">sequence stopped</Badge> : null}
                  </div>
                  <span className="text-xs text-muted-foreground">{relative(reply.received_at)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm">{reply.body}</p>
                {!reply.read_at ? (
                  <Button size="sm" variant="outline" onClick={() => markRead.mutate(reply.id)}>
                    Mark read
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

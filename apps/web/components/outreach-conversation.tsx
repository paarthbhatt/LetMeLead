"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight, Check, CheckCheck, ExternalLink, GitBranch, Linkedin, MessageSquare, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";

import { Avatar, Badge, Button, Empty, Notice, Skeleton } from "@/components/ui";
import { api, type Reply, type Thread } from "@/lib/api";
import { messagePresentation, outreachError } from "@/lib/outreach-campaigns";
import { conversationDate, conversationItems, replyCampaignIds, safeLinkedinProfileUrl } from "@/lib/outreach-inbox";
import { cn } from "@/lib/utils";

export function OutreachConversation({
  thread,
  replies,
  loading,
  error,
  hasMore,
  loadingMore,
  loadingMoreError,
  markingRead,
  onMarkRead,
  onLoadMore,
  onRetry,
  onBack,
}: {
  thread: Thread;
  replies: Reply[];
  loading: boolean;
  error: unknown;
  hasMore: boolean;
  loadingMore: boolean;
  loadingMoreError: boolean;
  markingRead: boolean;
  onMarkRead: (replies: Reply[]) => void;
  onLoadMore: () => void;
  onRetry: () => void;
  onBack: () => void;
}) {
  const lead = useQuery({ queryKey: ["lead", thread.lead_id], queryFn: () => api.lead(thread.lead_id) });
  const campaigns = useQuery({ queryKey: ["campaigns"], queryFn: api.campaigns });
  const incoming = replies.filter((reply) => reply.lead_id === thread.lead_id);
  const unread = incoming.filter((reply) => !reply.read_at);
  const campaignIds = replyCampaignIds(replies, thread.lead_id);
  const history = useQueries({
    queries: campaignIds.map((id) => ({ queryKey: ["campaign-messages", id], queryFn: () => api.campaignMessages(id) })),
  });
  const items = conversationItems(thread.lead_id, replies, history.map((query, index) => ({ campaignId: campaignIds[index], messages: query.data ?? [] })));
  const campaignNames = new Map((campaigns.data ?? []).map((campaign) => [campaign.id, campaign.name]));
  const person = lead.data?.contact?.name || thread.company;
  const stopped = incoming.some((reply) => reply.stop_sequence);
  const profile = [
    lead.data?.contact?.linkedin_url,
    ...[...(lead.data?.contacts ?? [])].sort((a, b) => b.confidence - a.confidence).map((contact) => contact.linkedin_url),
    lead.data?.linkedin_url,
  ].map(safeLinkedinProfileUrl).find((url) => url !== null);

  return (
    <div className="flex min-h-[620px] min-w-0 flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b p-5">
        <div className="flex min-w-0 items-center gap-3">
          <Button size="sm" variant="ghost" className="h-8 w-8 shrink-0 px-0 md:hidden" onClick={onBack} aria-label="Back to conversations"><ArrowLeft className="size-4" aria-hidden /></Button>
          <Avatar name={person} />
          <div className="min-w-0"><h2 className="truncate text-base font-semibold">{person}</h2><p className="mt-1 truncate text-xs text-muted-foreground">{person !== thread.company ? `${thread.company} · ` : ""}{thread.domain || "LinkedIn conversation"}</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/leads/${thread.lead_id}`} className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium hover:bg-accent">View lead<ArrowUpRight className="size-3.5" aria-hidden /></Link>
          <Button size="sm" variant="outline" disabled={!unread.length || markingRead || loading} onClick={() => onMarkRead(unread)}><CheckCheck className="size-3.5" aria-hidden />{markingRead ? "Marking read…" : unread.length && unread.length < thread.unread ? `Mark ${unread.length} loaded read` : "Mark read"}</Button>
        </div>
      </div>

      <div className="grid gap-4 border-b bg-muted/15 p-5 sm:grid-cols-2">
        <div className="min-w-0">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><Sparkles className="size-3 text-blue-600 dark:text-blue-400" aria-hidden />Why this lead</p>
          {lead.isLoading ? <Skeleton className="h-10 w-full" /> : lead.isError ? <p className="text-xs text-muted-foreground">Lead context could not load. <button type="button" className="font-medium text-blue-600 hover:underline dark:text-blue-400" onClick={() => lead.refetch()}>Retry context</button></p> : <p className="line-clamp-2 text-xs leading-relaxed text-foreground/80">{lead.data?.reason || "Open the lead to review its qualification and evidence."}</p>}
          <Link href={`/leads/${thread.lead_id}`} className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400">Review evidence<ArrowUpRight className="size-3" aria-hidden /></Link>
        </div>
        <div className="min-w-0">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><GitBranch className="size-3 text-blue-600 dark:text-blue-400" aria-hidden />Outreach context</p>
          {campaignIds.length ? <div className="space-y-1.5">{campaignIds.map((id) => <Link key={id} href={`/campaigns/${id}`} className="flex items-center gap-1.5 text-xs font-medium hover:text-blue-600 dark:hover:text-blue-400"><span className="truncate">{campaignNames.get(id) ?? "View linked campaign"}</span><ArrowUpRight className="size-3 shrink-0" aria-hidden /></Link>)}</div> : <p className="text-xs text-muted-foreground">No campaign linked to the loaded replies.</p>}
          {stopped ? <div className="mt-2"><Badge tone="success"><ShieldCheck className="mr-1 size-3" aria-hidden />Lead outreach stopped</Badge></div> : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col px-5 py-5 sm:px-6">
        {error ? <div className="mb-4 space-y-2"><Notice tone="error">{outreachError(error, "We couldn't load reply history.")}{incoming.length ? " Previously loaded replies remain below." : ""}</Notice><Button size="sm" variant="outline" onClick={onRetry}>Retry replies</Button></div> : null}
        {history.some((query) => query.isError) ? <div className="mb-4 space-y-2"><Notice tone="error">Some outgoing activity could not load. Incoming replies are still available; missing records do not confirm delivery.</Notice><Button size="sm" variant="outline" onClick={() => { void Promise.all(history.filter((query) => query.isError).map((query) => query.refetch())); }}>Retry outgoing activity</Button></div> : null}
        {hasMore ? <div className="mb-5 flex flex-wrap items-center justify-center gap-2"><Button size="sm" variant="outline" disabled={loadingMore} onClick={onLoadMore}>{loadingMore ? "Loading older replies…" : "Load older replies"}</Button><span className="text-[11px] text-muted-foreground">History is loaded across the inbox.</span></div> : null}
        {loadingMoreError ? <Notice tone="error">Older replies could not load. The conversation below has not been cleared. Retry loading older replies.</Notice> : null}
        {unread.length < thread.unread && hasMore ? <p className="mb-4 text-center text-[11px] text-muted-foreground">{unread.length} of {thread.unread} unread replies are loaded for this conversation.</p> : null}

        {loading ? <div role="status" aria-label="Loading conversation" className="space-y-4"><Skeleton className="h-24 w-4/5 rounded-xl" /><Skeleton className="ml-auto h-24 w-3/4 rounded-xl" /><Skeleton className="h-20 w-4/5 rounded-xl" /></div> : !incoming.length && !error ? <Empty className="my-auto border-0 px-0 py-10" title={hasMore ? "This conversation is in older history" : "Reply history unavailable"} hint={hasMore ? "The conversation summary is available, but its replies aren't in the loaded pages yet. Load older replies to view them." : "The summary and loaded history don't match yet. Refresh the inbox to check again."} icon={<MessageSquare className="size-5" />} action={hasMore ? <Button variant="outline" disabled={loadingMore} onClick={onLoadMore}>Load older replies</Button> : <Button variant="outline" onClick={onRetry}>Refresh reply history</Button>} /> : <>
          {history.some((query) => query.isLoading) ? <p className="mb-4 text-center text-[11px] text-muted-foreground" role="status">Loading recorded outreach for this conversation…</p> : null}
          <ol className="space-y-5" aria-label={`Conversation with ${thread.company}`}>
            {items.map((item) => {
              if (item.kind === "reply") return <li key={item.id} className="mr-4 max-w-[92%] sm:max-w-[85%]"><div className="mb-2 flex items-center gap-2 text-[11px]"><span className="font-semibold">{person}</span>{!item.reply.read_at ? <Badge>Unread</Badge> : <span className="flex items-center gap-1 text-muted-foreground"><Check className="size-3" aria-hidden />Read</span>}</div><div className="rounded-xl rounded-tl-sm border bg-background/60 px-4 py-3.5"><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{item.reply.body}</p></div><time dateTime={item.at ?? undefined} className="mt-2 block text-[11px] text-muted-foreground">{conversationDate(item.at)} · Received</time></li>;
              const presentation = messagePresentation(item.message);
              return <li key={item.id} className="ml-auto max-w-[92%] sm:max-w-[85%]"><div className="mb-2 flex flex-wrap items-center justify-end gap-2 text-[11px]"><span className="font-medium text-muted-foreground">Your outreach · Step {item.message.step_no}</span><Badge tone={presentation.tone} title={presentation.hint}>{presentation.label}</Badge></div><div className={cn("rounded-xl rounded-tr-sm border border-primary/15 bg-primary/5 px-4 py-3.5", (item.message.status !== "sent" || presentation.label === "Dry run") && "border-dashed")}><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{item.message.body}</p><p className={cn("mt-3 text-[11px] leading-relaxed text-muted-foreground", item.message.status === "failed" && "text-destructive")}>{presentation.hint}</p></div><div className="mt-2 flex flex-wrap items-center justify-end gap-x-2 text-[11px] text-muted-foreground"><time dateTime={item.at ?? undefined}>{conversationDate(item.at)} · {item.message.sent_at ? "Send recorded" : "Recorded schedule"}</time><Link href={`/campaigns/${item.campaignId}`} className="hover:text-primary">View campaign</Link></div></li>;
            })}
          </ol>
          {campaignIds.length ? <p className="mt-6 text-center text-[11px] leading-relaxed text-muted-foreground">Outgoing activity uses up to 100 recent records per campaign linked to the loaded replies. Older or unlinked activity may not appear.</p> : null}
        </>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t bg-muted/20 p-5">
        <div className="flex max-w-lg items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border bg-card"><Linkedin className="size-4 text-blue-600 dark:text-blue-400" aria-hidden /></span>
          <div>
            <h3 className="text-sm font-semibold">Continue in LinkedIn</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Sending replies from LetMeLead is not supported yet. Respond in LinkedIn; no message is sent from this page.</p>
            {profile ? <a href={profile} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-blue-600 dark:text-blue-400">View LinkedIn profile<ExternalLink className="size-3" aria-hidden /></a> : null}
          </div>
        </div>
        <a href="https://www.linkedin.com/messaging/" target="_blank" rel="noopener noreferrer" className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border bg-card px-3 text-xs font-semibold hover:bg-accent">Open LinkedIn inbox<ExternalLink className="size-3.5" aria-hidden /></a>
      </div>
    </div>
  );
}

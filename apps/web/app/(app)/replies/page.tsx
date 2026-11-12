"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { Check, Inbox, Mail, MessageSquare, RefreshCw, Search, ShieldCheck, X } from "lucide-react";
import { useState } from "react";

import { OutreachConversation } from "@/components/outreach-conversation";
import { PageHeader } from "@/components/shell";
import { Avatar, Badge, Button, Card, Empty, Input, Notice, Skeleton, Stat } from "@/components/ui";
import { api, request, type Page, type Reply, type Thread } from "@/lib/api";
import { outreachError, type OutreachNotice } from "@/lib/outreach-campaigns";
import { applyReadReplies, filterInboxThreads, flattenReplyPages } from "@/lib/outreach-inbox";
import { cn, relative } from "@/lib/utils";

const repliesKey = ["replies", "inbox"] as const;
const threadsKey = ["replies", "threads"] as const;

export default function RepliesPage() {
  const queryClient = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [notice, setNotice] = useState<OutreachNotice | null>(null);
  const threads = useQuery({ queryKey: threadsKey, queryFn: api.threads });
  // Keep read replies in the history even when the master list is filtered to unread threads.
  const replies = useInfiniteQuery({
    queryKey: repliesKey,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => pageParam
      ? request<Page<Reply>>(`/v1/replies?limit=50&unread_only=false&cursor=${encodeURIComponent(pageParam)}`)
      : api.replies(false),
    getNextPageParam: (lastPage) => lastPage.next_cursor,
  });

  const markRead = useMutation({
    mutationFn: async (unread: Reply[]) => {
      const results = await Promise.allSettled(unread.map((reply) => api.markReplyRead(reply.id)));
      const updated = results.flatMap((result) => result.status === "fulfilled" && result.value.read_at ? [result.value] : []);
      return { updated, failed: unread.length - updated.length };
    },
    onSuccess: ({ updated, failed }, unread) => {
      queryClient.setQueryData<InfiniteData<Page<Reply>, string | null>>(repliesKey, (current) => current ? { ...current, pages: applyReadReplies(current.pages, updated) } : current);
      const confirmed = new Set(updated.map((reply) => reply.id));
      const readCounts = new Map<string, number>();
      unread.filter((reply) => !reply.read_at && confirmed.has(reply.id)).forEach((reply) => readCounts.set(reply.lead_id, (readCounts.get(reply.lead_id) ?? 0) + 1));
      queryClient.setQueryData<{ threads: Thread[] }>(threadsKey, (current) => current ? { threads: current.threads.map((thread) => ({ ...thread, unread: Math.max(0, thread.unread - (readCounts.get(thread.lead_id) ?? 0)) })) } : current);
      setNotice({
        tone: failed ? "error" : "success",
        text: failed ? `${updated.length} replies marked read; ${failed} could not be updated. Retry the remaining unread replies.` : `${updated.length} ${updated.length === 1 ? "reply" : "replies"} marked read. This does not restart outreach or send a response.`,
      });
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ["replies"] }),
        queryClient.invalidateQueries({ queryKey: ["threads"] }),
      ]);
    },
    onError: (error) => setNotice({ tone: "error", text: outreachError(error, "We couldn't confirm the read-state update. Please try again.") }),
  });

  const allThreads = threads.data?.threads ?? [];
  const visibleThreads = filterInboxThreads(allThreads, search, unreadOnly);
  const selectedThread = visibleThreads.find((thread) => thread.lead_id === selectedLeadId) ?? visibleThreads[0];
  const allReplies = flattenReplyPages(replies.data?.pages ?? []);
  const unreadTotal = threads.data ? allThreads.reduce((total, thread) => total + thread.unread, 0) : "—";
  const refreshing = threads.isFetching || replies.isFetching;

  async function refreshInbox() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["replies"] }),
      queryClient.invalidateQueries({ queryKey: ["campaign-messages"] }),
      queryClient.invalidateQueries({ queryKey: ["lead"] }),
    ]);
  }

  function clearFilters() {
    setSearch("");
    setUnreadOnly(false);
    setSelectedLeadId(null);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Inbox" description="The conversation, the signal, and the next decision. Together." actions={<div className="flex items-center gap-2"><Badge tone="muted">Incoming replies</Badge><Button variant="outline" onClick={refreshInbox} disabled={refreshing}><RefreshCw className={cn("size-4", refreshing && "animate-spin motion-reduce:animate-none")} aria-hidden />{refreshing ? "Refreshing…" : "Refresh"}</Button></div>} />
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Conversations" value={threads.data ? allThreads.length : "—"} hint="Grouped by lead" icon={<MessageSquare className="size-4" />} />
        <Stat label="Unread replies" value={unreadTotal} hint="Across the entire inbox" icon={<Mail className="size-4" />} />
        <Stat label="Needs attention" value={threads.data ? allThreads.filter((thread) => thread.unread > 0).length : "—"} hint="Conversations with unread replies" icon={<Inbox className="size-4" />} />
      </div>

      <div className="flex items-start gap-2.5 text-xs leading-relaxed text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden /><p>Received replies stop outreach for that lead automatically. Marking a reply read never resumes outreach.</p></div>

      {threads.isError && threads.data ? <Notice tone="error">Conversation summaries could not refresh. The last loaded list is shown. <Button size="sm" variant="outline" className="ml-2" onClick={() => threads.refetch()} disabled={threads.isFetching}>Retry summaries</Button></Notice> : null}

      <Card className="overflow-hidden rounded-xl">
        <div className="grid min-h-[620px] md:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[330px_minmax(0,1fr)]">
          <aside className={cn("min-w-0 border-b md:border-b-0 md:border-r", selectedLeadId && selectedThread && "hidden md:block")} aria-label="Conversations">
            <div className="space-y-3 border-b p-4">
              <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input value={search} onChange={(event) => { setSearch(event.target.value); setSelectedLeadId(null); }} placeholder="Search conversations…" className="pl-9 pr-8" aria-label="Search conversations by company, domain, or reply" />{search ? <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label="Clear conversation search" onClick={() => { setSearch(""); setSelectedLeadId(null); }}><X className="size-3.5" aria-hidden /></button> : null}</div>
              <div className="flex items-center justify-between gap-2"><span className="text-xs font-medium text-muted-foreground">{unreadOnly ? "Unread conversations" : "All conversations"}</span><Button size="sm" variant={unreadOnly ? "secondary" : "ghost"} aria-pressed={unreadOnly} onClick={() => { setUnreadOnly(!unreadOnly); setSelectedLeadId(null); }} className={cn("h-7", unreadOnly && "bg-primary/10 text-primary")}><span className={cn("size-1.5 rounded-full", unreadOnly ? "bg-primary" : "bg-muted-foreground")} aria-hidden />Unread</Button></div>
            </div>

            {threads.isLoading ? <div role="status" aria-label="Loading conversations" className="space-y-3 p-4"><span className="sr-only">Loading conversations…</span>{[0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-[90px] w-full rounded-xl" />)}</div> : threads.isError && !threads.data ? <div className="space-y-3 p-4"><Notice tone="error">{outreachError(threads.error, "We couldn't load your conversations.")}</Notice><Button variant="outline" size="sm" disabled={threads.isFetching} onClick={() => threads.refetch()}>Try again</Button></div> : !allThreads.length ? <Empty className="m-4 border-0 px-1 py-12" title="Room for a new conversation" hint="Incoming replies will appear here. No sample messages, just real responses from your leads." icon={<Inbox className="size-5" />} /> : !visibleThreads.length ? <Empty className="m-4 border-0 px-1 py-10" title={search.trim() ? "No matching conversations" : "All caught up"} hint={search.trim() ? "Try another company, domain, or phrase from a reply." : "There are no unread conversations. Your read history is still available."} icon={search.trim() ? <Search className="size-5" /> : <Check className="size-5" />} action={<Button size="sm" variant="outline" onClick={clearFilters}>{search.trim() ? "Clear filters" : "Show all conversations"}</Button>} /> : <ul className="max-h-[760px] overflow-y-auto">
              {visibleThreads.map((thread) => <li key={thread.lead_id}><button type="button" onClick={() => setSelectedLeadId(thread.lead_id)} aria-current={selectedThread?.lead_id === thread.lead_id ? "true" : undefined} aria-label={`Open conversation with ${thread.company}${thread.unread ? `, ${thread.unread} unread replies` : ", all read"}`} className={cn("relative w-full border-b px-4 py-4 text-left transition-colors hover:bg-muted/40", selectedThread?.lead_id === thread.lead_id && "bg-primary/5 before:absolute before:inset-y-3 before:left-0 before:w-[3px] before:rounded-r before:bg-primary")}><div className="flex gap-3"><Avatar name={thread.company} /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><p className={cn("truncate text-sm", thread.unread ? "font-semibold" : "font-medium")}>{thread.company}</p><span className="shrink-0 text-[10px] text-muted-foreground">{relative(thread.last_reply_at)}</span></div><p className="mt-0.5 truncate text-[11px] text-muted-foreground">{thread.domain || "LinkedIn"}</p><div className="mt-2 flex items-start justify-between gap-3"><p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{thread.preview}</p>{thread.unread ? <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold tabular-nums text-primary">{thread.unread > 99 ? "99+" : thread.unread}</span> : <Check className="mt-0.5 size-3 shrink-0 text-muted-foreground" aria-hidden />}</div></div></div></button></li>)}
            </ul>}
            {threads.data ? <div className="px-4 py-3 text-[11px] text-muted-foreground">{visibleThreads.length} {visibleThreads.length === 1 ? "conversation" : "conversations"} shown</div> : null}
          </aside>

          <section className={cn("min-w-0", selectedLeadId && selectedThread ? "block" : "hidden md:block")} aria-label="Selected conversation">
            {threads.isLoading ? <div role="status" aria-label="Loading inbox" className="space-y-5 p-6"><Skeleton className="h-12 w-1/2" /><Skeleton className="h-20 w-full" /><Skeleton className="h-36 w-4/5" /></div> : selectedThread ? <OutreachConversation
              key={selectedThread.lead_id}
              thread={selectedThread}
              replies={allReplies}
              loading={replies.isLoading}
              error={replies.isError && !replies.isFetchNextPageError ? replies.error : null}
              hasMore={!!replies.hasNextPage}
              loadingMore={replies.isFetchingNextPage}
              loadingMoreError={replies.isFetchNextPageError}
              markingRead={markRead.isPending}
              onMarkRead={(unread) => { if (unread.length && !markRead.isPending) { setNotice(null); markRead.mutate(unread); } }}
              onLoadMore={() => { if (replies.hasNextPage && !replies.isFetching) void replies.fetchNextPage(); }}
              onRetry={() => { void replies.refetch(); }}
              onBack={() => setSelectedLeadId(null)}
            /> : <div className="flex min-h-[620px] items-center justify-center p-8"><Empty className="border-0" title={threads.isError && !threads.data ? "Conversation list unavailable" : allThreads.length ? "Select a conversation" : "Your inbox, without the noise"} hint={threads.isError && !threads.data ? "Retry the conversation list to load your inbox." : allThreads.length ? "Choose a conversation to review its replies and lead context." : "Real incoming replies and their outreach context will live here. Responses are currently sent in LinkedIn."} icon={<MessageSquare className="size-6" />} /></div>}
          </section>
        </div>
      </Card>
    </div>
  );
}

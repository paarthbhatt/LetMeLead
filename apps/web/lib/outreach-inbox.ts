import type { Message, Page, Reply, Thread } from "./api";
import { matchesOutreachSearch } from "./outreach-campaigns";

export function filterInboxThreads(threads: Thread[], query: string, unreadOnly: boolean): Thread[] {
  return threads
    .filter((thread) => !unreadOnly || thread.unread > 0)
    .filter((thread) => matchesOutreachSearch([thread.company, thread.domain, thread.preview], query))
    .sort((a, b) => (Date.parse(b.last_reply_at) || 0) - (Date.parse(a.last_reply_at) || 0));
}

export function flattenReplyPages(pages: Page<Reply>[]): Reply[] {
  const replies = new Map<string, Reply>();
  for (const page of pages) {
    for (const reply of page.items) {
      const previous = replies.get(reply.id);
      // Read state is monotonic: a stale overlapping page must not make a read reply unread again.
      replies.set(reply.id, previous?.read_at && !reply.read_at ? previous : reply);
    }
  }
  return [...replies.values()];
}

export function applyReadReplies(pages: Page<Reply>[], updated: Reply[]): Page<Reply>[] {
  const byId = new Map(updated.filter((reply) => reply.read_at).map((reply) => [reply.id, reply]));
  return pages.map((page) => ({ ...page, items: page.items.map((reply) => byId.get(reply.id) ?? reply) }));
}

export function replyCampaignIds(replies: Reply[], leadId: string): string[] {
  return [...new Set(replies.filter((reply) => reply.lead_id === leadId && reply.campaign_id).map((reply) => reply.campaign_id!))];
}

export type ConversationItem =
  | { id: string; kind: "reply"; at: string | null; reply: Reply }
  | { id: string; kind: "outreach"; at: string | null; message: Message; campaignId: string };

export function conversationItems(
  leadId: string,
  replies: Reply[],
  campaignMessages: { campaignId: string; messages: Message[] }[],
): ConversationItem[] {
  const items = new Map<string, ConversationItem>();
  replies.filter((reply) => reply.lead_id === leadId).forEach((reply) => {
    items.set(`reply:${reply.id}`, { id: `reply:${reply.id}`, kind: "reply", at: reply.received_at, reply });
  });
  campaignMessages.forEach(({ campaignId, messages }) => {
    messages.filter((message) => message.lead_id === leadId).forEach((message) => {
      items.set(`message:${message.id}`, {
        id: `message:${message.id}`,
        kind: "outreach",
        at: message.sent_at ?? message.scheduled_at,
        message,
        campaignId,
      });
    });
  });
  const timestamp = (item: ConversationItem) => item.at ? Date.parse(item.at) || 0 : 0;
  return [...items.values()].sort((a, b) => timestamp(a) - timestamp(b) || a.id.localeCompare(b.id));
}

export function conversationDate(value: string | null | undefined): string {
  if (!value || Number.isNaN(Date.parse(value))) return "Time unavailable";
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function safeLinkedinProfileUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (url.hostname !== "linkedin.com" && !url.hostname.endsWith(".linkedin.com")) return null;
    if (!url.pathname.startsWith("/in/")) return null;
    return url.href;
  } catch {
    return null;
  }
}

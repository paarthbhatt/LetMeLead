import { describe, expect, it } from "vitest";
import type { Message, Page, Reply, Thread } from "./api";
import { applyReadReplies, conversationDate, conversationItems, filterInboxThreads, flattenReplyPages, replyCampaignIds, safeLinkedinProfileUrl } from "./outreach-inbox";

const reply = (overrides: Partial<Reply> = {}): Reply => ({
  id: "reply", campaign_id: "campaign", lead_id: "lead", body: "Interested. Tell me more.",
  received_at: "2026-11-11T12:00:00Z", stop_sequence: true, read_at: null, ...overrides,
});
const page = (items: Reply[], cursor: string | null = null): Page<Reply> => ({ items, next_cursor: cursor });
const thread = (overrides: Partial<Thread> = {}): Thread => ({
  lead_id: "lead", company: "Acme", domain: "acme.com", last_reply_at: "2026-11-11T12:00:00Z",
  unread: 2, preview: "Interested in compliance", ...overrides,
});
const message = (overrides: Partial<Message> = {}): Message => ({
  id: "outgoing", lead_id: "lead", step_no: 1, body: "Hello from our team", status: "queued",
  scheduled_at: "2026-11-10T12:00:00Z", sent_at: null, error: null, ...overrides,
});

describe("inbox discovery", () => {
  it("filters unread conversations and searches company, domain, and preview", () => {
    const input = [thread(), thread({ lead_id: "other", company: "Other", domain: "other.com", unread: 0 })];
    expect(filterInboxThreads(input, "ACME compliance", true).map((item) => item.lead_id)).toEqual(["lead"]);
    expect(filterInboxThreads(input, "other", true)).toEqual([]);
    expect(filterInboxThreads(input, "acme.com", false)).toHaveLength(1);
    expect(input).toHaveLength(2);
  });

  it("sorts most recent conversations first without inventing unread counts", () => {
    const input = [thread({ lead_id: "old", last_reply_at: "2026-11-01T12:00:00Z", unread: 0 }), thread({ lead_id: "new", unread: 7 })];
    expect(filterInboxThreads(input, "", false).map((item) => [item.lead_id, item.unread])).toEqual([["new", 7], ["old", 0]]);
  });
});

describe("paginated replies and read state", () => {
  it("deduplicates overlapping pages and preserves confirmed read state", () => {
    const read = reply({ read_at: "2026-11-11T13:00:00Z" });
    expect(flattenReplyPages([page([read]), page([reply(), reply({ id: "older" })])])).toEqual([read, reply({ id: "older" })]);
  });

  it("updates only read states actually returned by the API and keeps cursors", () => {
    const input = [page([reply(), reply({ id: "untouched" })], "older")];
    const read = reply({ read_at: "2026-11-11T13:00:00Z" });
    const updated = applyReadReplies(input, [read]);
    expect(updated[0].items[0].read_at).toBe(read.read_at);
    expect(updated[0].items[1].read_at).toBeNull();
    expect(updated[0].next_cursor).toBe("older");
    expect(input[0].items[0].read_at).toBeNull();
    expect(applyReadReplies(input, [reply()])).toEqual(input);
  });
});

describe("conversation context", () => {
  it("requests only campaigns linked to this lead's actual replies", () => {
    expect(replyCampaignIds([reply(), reply({ id: "two" }), reply({ id: "three", campaign_id: null }), reply({ id: "four", lead_id: "other", campaign_id: "unrelated" })], "lead")).toEqual(["campaign"]);
  });

  it("merges real incoming and outgoing records chronologically and excludes other leads", () => {
    const outgoing = message();
    const items = conversationItems("lead", [reply(), reply({ id: "other", lead_id: "other" })], [
      { campaignId: "campaign", messages: [outgoing, message({ id: "someone-else", lead_id: "other" })] },
      { campaignId: "campaign", messages: [outgoing] },
    ]);
    expect(items.map((item) => item.kind)).toEqual(["outreach", "reply"]);
    expect(items).toHaveLength(2);
    expect(items[0].kind === "outreach" && items[0].message.status).toBe("queued");
    expect(conversationDate(null)).toBe("Time unavailable");
    expect(conversationDate("bad-date")).toBe("Time unavailable");
  });
});

describe("LinkedIn context links", () => {
  it("accepts HTTPS LinkedIn profiles and rejects unrelated or unsafe URLs", () => {
    expect(safeLinkedinProfileUrl("https://www.linkedin.com/in/alex")).toBe("https://www.linkedin.com/in/alex");
    expect(safeLinkedinProfileUrl("https://linkedin.com.evil.test/in/alex")).toBeNull();
    expect(safeLinkedinProfileUrl("javascript:alert(1)")).toBeNull();
    expect(safeLinkedinProfileUrl("https://name:password@linkedin.com/in/alex")).toBeNull();
    expect(safeLinkedinProfileUrl("http://linkedin.com/in/alex")).toBeNull();
    expect(safeLinkedinProfileUrl("https://linkedin.com/messaging/")).toBeNull();
  });
});

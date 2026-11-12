import { describe, expect, it } from "vitest";

import { leadDraftKey, parseLeadDraftReview, readLeadDraftReview, storeLeadDraftReview, type LeadDraftReview } from "./lead-drafts";

const draft: LeadDraftReview = {
  version: 1, campaignId: "campaign-1", createdAt: "2026-11-11T12:00:00Z", excludedCount: 2,
  recipients: [{ leadId: "lead-1", company: "Acme", contactName: null, body: "Hello", kind: "message", stepNo: 1, error: null }],
};

describe("preview-only draft handoff", () => {
  it("round-trips a reviewed recipient bundle under its own campaign key", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    expect(storeLeadDraftReview(draft, storage)).toBe(true);
    expect(values.has(leadDraftKey("campaign-1"))).toBe(true);
    expect(readLeadDraftReview("campaign-1", storage)).toEqual(draft);
    expect(readLeadDraftReview("campaign-2", storage)).toBeNull();
  });

  it("does not load stale, malformed, duplicate or wrong-campaign recipients", () => {
    expect(parseLeadDraftReview("invalid", "campaign-1")).toBeNull();
    expect(parseLeadDraftReview(JSON.stringify({ ...draft, version: 2 }), "campaign-1")).toBeNull();
    expect(parseLeadDraftReview(JSON.stringify(draft), "campaign-2")).toBeNull();
    expect(parseLeadDraftReview(JSON.stringify({ ...draft, recipients: [draft.recipients[0], draft.recipients[0]] }), "campaign-1")).toBeNull();
    expect(parseLeadDraftReview(JSON.stringify({ ...draft, recipients: [{ ...draft.recipients[0], body: {} }] }), "campaign-1")).toBeNull();
    expect(parseLeadDraftReview(JSON.stringify({ ...draft, recipients: [] }), "campaign-1")).toBeNull();
  });

  it("tolerates blocked storage without failing an already-created draft", () => {
    const blocked = {
      getItem: () => { throw new Error("Storage disabled"); },
      setItem: () => { throw new Error("Storage disabled"); },
    };
    expect(storeLeadDraftReview(draft, blocked)).toBe(false);
    expect(readLeadDraftReview("campaign-1", blocked)).toBeNull();
    expect(storeLeadDraftReview(draft, null)).toBe(false);
  });
});

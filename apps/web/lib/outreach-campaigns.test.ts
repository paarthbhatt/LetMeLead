import { describe, expect, it } from "vitest";
import type { Campaign, Lead, Message, SequenceStepInput } from "./api";
import type { LeadDraftReview } from "./lead-drafts";
import {
  approvedQueueLeadIds,
  campaignStateHint,
  filterCampaigns,
  messagePresentation,
  normalizeSequence,
  outreachError,
  parseOutreachPreview,
  queueRecipientsStillApproved,
  reviewedQueueLeadIds,
  sequenceFingerprint,
  stepDelayLabel,
  summarizeQueueResult,
  summarizeSendResult,
  validateSequence,
} from "./outreach-campaigns";

const step: SequenceStepInput = { step_no: 1, kind: "connect", body_template: "Hi {company}, your recent signal caught my eye.", delay_days: 0 };
const campaign = (overrides: Partial<Campaign>): Campaign => ({
  id: "campaign", name: "Compliance outreach", status: "draft", daily_cap: null,
  pause_reason: null, created_at: "2026-11-10T12:00:00Z", ...overrides,
});
const lead = (id: string, status = "claimed", fit = "fit") => ({ id, status, fit }) as Lead;
const message = (overrides: Partial<Message> = {}): Message => ({
  id: "message", lead_id: "lead", step_no: 1, body: "Hello there", status: "sent",
  scheduled_at: null, sent_at: null, error: null, ...overrides,
});

describe("campaign discovery", () => {
  it("searches names and pause reasons without mutating the original list", () => {
    const input = [campaign({ id: "old", status: "paused", pause_reason: "Review Q4 evidence" }), campaign({ id: "new", created_at: "2026-11-11T12:00:00Z" })];
    expect(filterCampaigns(input, " Q4 REVIEW ", "paused").map((row) => row.id)).toEqual(["old"]);
    expect(filterCampaigns(input, "", "all").map((row) => row.id)).toEqual(["new", "old"]);
    expect(input[0].id).toBe("old");
  });

  it("keeps finished campaigns out of draft and paused filters", () => {
    const input = [campaign({ status: "completed" })];
    expect(filterCampaigns(input, "", "paused")).toEqual([]);
    expect(campaignStateHint(input[0])).toContain("finished");
  });
});

describe("sequence editing", () => {
  it("orders and renumbers steps without changing API objects", () => {
    const input = [{ ...step, step_no: 4 }, { ...step, step_no: 2 }];
    expect(normalizeSequence(input).map((item) => item.step_no)).toEqual([1, 2]);
    expect(input.map((item) => item.step_no)).toEqual([4, 2]);
    expect(sequenceFingerprint([step])).not.toBe(sequenceFingerprint([{ ...step, delay_days: 2 }]));
  });

  it("accepts supported steps and validates text, kinds, numbering, and integer delays", () => {
    expect(validateSequence([step])).toEqual([]);
    expect(validateSequence([])[0].field).toBe("steps");
    expect(validateSequence(Array.from({ length: 11 }, (_, index) => ({ ...step, step_no: index + 1 })))[0].field).toBe("steps");
    const issues = validateSequence([{ ...step, step_no: 3, kind: "email", body_template: "    ", delay_days: 1.5 }]);
    expect(issues.map((issue) => issue.field)).toEqual(["step_no", "kind", "body_template", "delay_days"]);
    expect(validateSequence([{ ...step, body_template: "a".repeat(2001), delay_days: 31 }])).toHaveLength(2);
    expect(validateSequence([{ ...step, delay_days: Number.NaN }])[0].field).toBe("delay_days");
  });

  it("does not imply that manually queued first steps honor a follow-up delay", () => {
    expect(stepDelayLabel({ ...step, delay_days: 4 }, 0)).toBe("Starts when queued");
    expect(stepDelayLabel({ ...step, delay_days: 1 }, 1)).toContain("1 day after");
    expect(stepDelayLabel(step, 1)).toContain("No additional wait");
  });
});

describe("explicit queue recipients", () => {
  it("only queues eligible claimed leads and deduplicates IDs", () => {
    const input = [lead("approved"), lead("approved"), lead("new", "new"), lead("replied", "replied"), lead("not-fit", "claimed", "not_fit")];
    expect(approvedQueueLeadIds(input)).toEqual(["approved"]);
    expect(approvedQueueLeadIds(input, "new")).toEqual([]);
    expect(approvedQueueLeadIds(input, "missing")).toEqual([]);
  });

  it("does not fall back to everyone when the selected lead is unavailable", () => {
    expect(approvedQueueLeadIds([lead("one"), lead("two")], "unavailable")).toEqual([]);
    expect(approvedQueueLeadIds([lead("one"), lead("two")], "two")).toEqual(["two"]);
  });

  it("keeps tab-local review selections inside the reviewed audience, including beyond list limits", () => {
    const review: LeadDraftReview = {
      version: 1, campaignId: "campaign", createdAt: "2026-11-11T12:00:00Z", excludedCount: 1,
      recipients: ["one", "outside-first-page"].map((leadId) => ({ leadId, company: leadId, contactName: null, body: null, kind: null, stepNo: null, error: null })),
    };
    expect(reviewedQueueLeadIds(review, ["outside-first-page", "unreviewed"])).toEqual(["outside-first-page"]);
    expect(reviewedQueueLeadIds(review, [])).toEqual([]);
    expect(reviewedQueueLeadIds(null, ["one"])).toEqual([]);
  });

  it("requires every requested ID to still be claimed and fit before a queue request", () => {
    expect(queueRecipientsStillApproved(["one", "two"], [lead("one"), lead("two")])).toBe(true);
    expect(queueRecipientsStillApproved(["one", "two"], [lead("one"), lead("two", "replied")])).toBe(false);
    expect(queueRecipientsStillApproved(["one", "missing"], [lead("one")])).toBe(false);
    expect(queueRecipientsStillApproved(["one"], [lead("one", "claimed", "not_fit")])).toBe(false);
    expect(queueRecipientsStillApproved([], [lead("one")])).toBe(false);
  });
});

describe("honest sender outcomes", () => {
  it("labels dry runs and does not report confirmed delivery", () => {
    const result = summarizeSendResult({ sent: 2, failed: 0, skipped: 1, next_steps_queued: 1 }, true);
    expect(result.text).toContain("dry-run mode");
    expect(result.text).toContain("not delivery confirmations");
    expect(result.text).toContain("1 message was skipped");
    expect(result.text).toContain("1 follow-up was queued");
  });

  it("treats send counts as records, not proof of delivery", () => {
    const result = summarizeSendResult({ sent: 3, failed: 0, skipped: 0 }, false);
    expect(result.text).toContain("3 sends recorded");
    expect(result.text).toContain("receipts are not verified");
    expect(result.text).not.toContain("delivered successfully");
  });

  it("explains blocked and partial runs without raw JSON", () => {
    expect(summarizeSendResult({ sent: 0, failed: 0, note: "daily cap reached (10)" }).text).toContain("sending limit");
    expect(summarizeSendResult({ sent: 1, failed: 2 }).tone).toBe("error");
    expect(summarizeSendResult({ note: '{"error":"details"}' }).text).not.toContain("{");
    expect(summarizeSendResult({ sent: "3" }).text).toContain("no delivery counts");
    expect(summarizeSendResult({ sent: -1 }).tone).toBe("info");
    expect(summarizeSendResult({ sent: 1.5 }).text).toContain("no delivery counts");
  });

  it("does not turn zero queued messages into a delivery success", () => {
    expect(summarizeQueueResult(0).tone).toBe("info");
    expect(summarizeQueueResult(2).text).toContain("not confirmed delivered");
    expect(summarizeQueueResult(undefined).text).toContain("without a message count");
  });

  it("uses actual simulation metadata and stays cautious when metadata is absent", () => {
    expect(messagePresentation({ ...message(), meta: { simulated: true } } as Message).label).toBe("Dry run");
    expect(messagePresentation({ ...message(), meta: { simulated: false } } as Message).tone).toBe("success");
    expect(messagePresentation(message()).hint).toContain("may include a dry run");
    expect(messagePresentation(message({ status: "queued" })).hint).toContain("Not delivered");
    expect(messagePresentation(message({ status: "failed", error: '{"error":"private"}' })).hint).not.toContain("{");
  });
});

describe("preview response handling", () => {
  it("handles the API's untyped end-of-sequence response", () => {
    expect(parseOutreachPreview({ done: true, step_no: 3 })).toEqual({ state: "complete" });
  });

  it("only displays complete, valid previews", () => {
    expect(parseOutreachPreview({ step_no: 1, kind: "connect", body: "Hi there", lead: "Acme" })).toEqual({ state: "ready", step: 1, kind: "connect", body: "Hi there", company: "Acme" });
    expect(parseOutreachPreview({ body: "Partial response" })).toEqual({ state: "invalid" });
    expect(parseOutreachPreview(null)).toEqual({ state: "invalid" });
  });
});

describe("readable request errors", () => {
  it("uses contextual guidance for network errors and never prints JSON diagnostics", () => {
    expect(outreachError(new TypeError("Failed to fetch"), "Please retry loading the inbox.")).toBe("Please retry loading the inbox.");
    expect(outreachError(new Error('{"error":"private"}'), "Could not load.")).not.toContain("{");
  });
});

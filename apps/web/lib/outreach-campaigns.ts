import type { Campaign, Lead, Message, SequenceStepInput } from "./api";
import type { LeadDraftReview } from "./lead-drafts";

export type CampaignFilter = "all" | "active" | "draft" | "paused" | "completed";
export type OutreachNotice = { tone: "success" | "error" | "info"; text: string };
export type SequenceIssue = {
  step: number | null;
  field: "steps" | "step_no" | "kind" | "body_template" | "delay_days";
  message: string;
};

export function matchesOutreachSearch(values: (string | null | undefined)[], query: string): boolean {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const text = values.filter(Boolean).join(" ").toLocaleLowerCase();
  return words.every((word) => text.includes(word));
}

export function filterCampaigns(campaigns: Campaign[], query: string, status: CampaignFilter): Campaign[] {
  return campaigns
    .filter((campaign) => status === "all" || campaign.status === status)
    .filter((campaign) => matchesOutreachSearch([campaign.name, campaign.status, campaign.pause_reason], query))
    .sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));
}

export function campaignStateHint(campaign: Pick<Campaign, "status" | "pause_reason">): string {
  if (campaign.status === "draft") return "Review your sequence before starting outreach.";
  if (campaign.status === "active") return "Eligible queued messages may be sent automatically.";
  if (campaign.status === "paused") return campaign.pause_reason || "Outreach is on hold. Queued messages are kept.";
  if (campaign.status === "completed") return "This campaign has finished.";
  return "Open the campaign to review its current state.";
}

export function normalizeSequence(steps: SequenceStepInput[]): SequenceStepInput[] {
  return [...steps].sort((a, b) => a.step_no - b.step_no).map((step, index) => ({ ...step, step_no: index + 1 }));
}

export function sequenceFingerprint(steps: SequenceStepInput[]): string {
  return JSON.stringify(steps.map(({ step_no, kind, body_template, delay_days }) => [step_no, kind, body_template, delay_days]));
}

export function validateSequence(steps: SequenceStepInput[]): SequenceIssue[] {
  const issues: SequenceIssue[] = [];
  if (!steps.length || steps.length > 10) {
    issues.push({ step: null, field: "steps", message: "A sequence needs between 1 and 10 steps." });
  }
  steps.forEach((step, index) => {
    const number = index + 1;
    if (step.step_no !== number) {
      issues.push({ step: number, field: "step_no", message: "Steps must be numbered in order, starting at 1." });
    }
    if (step.kind !== "connect" && step.kind !== "message") {
      issues.push({ step: number, field: "kind", message: "Choose a connection request or a message." });
    }
    if (step.body_template.trim().length < 5 || step.body_template.length > 2000) {
      issues.push({ step: number, field: "body_template", message: "Use between 5 and 2,000 characters of message text." });
    }
    if (!Number.isInteger(step.delay_days) || step.delay_days < 0 || step.delay_days > 30) {
      issues.push({ step: number, field: "delay_days", message: "Enter a whole number of days from 0 to 30." });
    }
  });
  return issues;
}

export function stepDelayLabel(step: SequenceStepInput, index: number): string {
  if (index === 0) return "Starts when queued";
  if (step.delay_days === 0) return "No additional wait after the previous send record";
  return `Wait ${step.delay_days} ${step.delay_days === 1 ? "day" : "days"} after the previous send record`;
}

/** Always send explicit, approved IDs. The API's empty-array fallback also includes unclaimed leads. */
export function approvedQueueLeadIds(leads: Lead[], selectedId = ""): string[] {
  return [...new Set(leads
    .filter((lead) => lead.status === "claimed" && lead.fit !== "not_fit")
    .filter((lead) => !selectedId || lead.id === selectedId)
    .map((lead) => lead.id))];
}

/** A tab-local review is intent, not an attached or currently verified campaign audience. */
export function reviewedQueueLeadIds(review: LeadDraftReview | null, selectedIds: readonly string[]): string[] {
  const selected = new Set(selectedIds);
  return review?.recipients.filter((recipient) => selected.has(recipient.leadId)).map((recipient) => recipient.leadId) ?? [];
}

export function queueRecipientsStillApproved(ids: readonly string[], currentLeads: Lead[]): boolean {
  if (!ids.length || new Set(ids).size !== ids.length) return false;
  const approved = new Set(approvedQueueLeadIds(currentLeads));
  return ids.every((id) => approved.has(id));
}

function nonNegativeCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function plainDiagnostic(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const text = value.trim();
  if (text.startsWith("{") || text.startsWith("[")) return "Additional diagnostics are available in the activity log.";
  return text.slice(0, 500);
}

export function friendlySenderNote(value: unknown): string | null {
  const note = plainDiagnostic(value);
  if (!note) return null;
  if (note === "nothing due") return "No queued messages are due yet.";
  if (note === "connect a LinkedIn account first") return "Connect an available LinkedIn account before sending.";
  if (note.startsWith("daily cap reached")) return "Today's sending limit has been reached. Remaining messages stay queued.";
  if (note.startsWith("campaign is ")) return "The campaign is not active. No new sends were started in this run.";
  if (note.includes("session expired")) return "Your LinkedIn session expired. Reconnect the account before trying again.";
  if (note.includes("No LinkedIn session")) return "No LinkedIn session is available. Reconnect the account before trying again.";
  if (note.includes("presented a challenge")) return "LinkedIn requested a security check. The sender stopped; review the account in LinkedIn.";
  if (note.includes("Outreach is disabled")) return "The sender is disabled. No live messages can be sent until outreach is enabled.";
  return note;
}

export function summarizeSendResult(result: Record<string, unknown>, dryRun?: boolean): OutreachNotice {
  const sent = nonNegativeCount(result.sent);
  const failed = nonNegativeCount(result.failed);
  const skipped = nonNegativeCount(result.skipped);
  const queued = nonNegativeCount(result.next_steps_queued);
  const note = friendlySenderNote(result.note);
  const parts: string[] = [];
  if (sent !== undefined) {
    parts.push(sent === 0 ? "No sends were recorded." : `${sent} ${sent === 1 ? "send" : "sends"} recorded${dryRun ? " in dry-run mode" : ""}.`);
  }
  if (failed) parts.push(`${failed} ${failed === 1 ? "message" : "messages"} failed.`);
  if (skipped) parts.push(`${skipped} ${skipped === 1 ? "message was" : "messages were"} skipped.`);
  if (queued) parts.push(`${queued} ${queued === 1 ? "follow-up was" : "follow-ups were"} queued.`);
  if (note) parts.push(note);
  if (sent === undefined && failed === undefined && skipped === undefined) {
    parts.push("The sender returned no delivery counts. Check the activity log before retrying.");
  } else if (sent && dryRun) {
    parts.push("Dry-run records are simulations, not delivery confirmations. Review the message log below.");
  } else if (sent) {
    parts.push("Send records may include dry runs; delivery and read receipts are not verified here.");
  }
  return { tone: failed ? "error" : sent ? "success" : "info", text: parts.join(" ") };
}

export function summarizeQueueResult(value: unknown): OutreachNotice {
  const queued = nonNegativeCount(value);
  if (queued === undefined) return { tone: "info", text: "Queue request completed without a message count. Check the activity log before retrying." };
  if (queued === 0) return { tone: "info", text: "No new messages were queued. Leads may have replied or reached the end of the sequence. Review the activity log before queueing again." };
  return { tone: "success", text: `${queued} ${queued === 1 ? "message is" : "messages are"} queued, not confirmed delivered. Active campaigns can send eligible messages automatically.` };
}

export type OutreachPreview =
  | { state: "ready"; step: number; kind: string; body: string; company: string }
  | { state: "complete" }
  | { state: "invalid" };

export function parseOutreachPreview(value: unknown): OutreachPreview {
  if (!value || typeof value !== "object") return { state: "invalid" };
  const result = value as Record<string, unknown>;
  if (result.done === true) return { state: "complete" };
  if (
    typeof result.step_no === "number" && Number.isInteger(result.step_no) && result.step_no > 0 &&
    (result.kind === "connect" || result.kind === "message") &&
    typeof result.body === "string" && result.body.trim() && typeof result.lead === "string"
  ) {
    return { state: "ready", step: result.step_no, kind: result.kind, body: result.body, company: result.lead };
  }
  return { state: "invalid" };
}

export function messagePresentation(message: Message): {
  label: string;
  tone: "default" | "success" | "warning" | "danger" | "muted";
  hint: string;
} {
  if (message.status === "sent") {
    const meta = "meta" in message && message.meta && typeof message.meta === "object"
      ? message.meta as Record<string, unknown>
      : null;
    if (meta?.simulated === true) return { label: "Dry run", tone: "muted", hint: "Simulated only. This record does not represent a delivered message." };
    if (meta?.simulated === false) return { label: "Send recorded", tone: "success", hint: "The worker recorded a live send. Delivery and read receipts are unavailable." };
    return { label: "Send recorded", tone: "muted", hint: "Delivery details are unavailable. This record may include a dry run." };
  }
  if (message.status === "queued") return { label: "Queued", tone: "default", hint: "Waiting for a sender run and pacing limits. Not delivered." };
  if (message.status === "failed") return { label: "Failed", tone: "danger", hint: friendlySenderNote(message.error) || "The sender could not complete this message." };
  if (message.status === "skipped") return { label: "Skipped", tone: "muted", hint: plainDiagnostic(message.error) || "No send was recorded for this message." };
  return { label: "Unknown status", tone: "muted", hint: "Check the campaign activity before retrying." };
}

export function outreachError(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    if (/failed to fetch|networkerror|network error|load failed/i.test(error.message)) return fallback;
    return plainDiagnostic(error.message) || fallback;
  }
  return fallback;
}

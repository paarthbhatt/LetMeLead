/**
 * The create-campaign endpoint records lead_ids in its audit log, but does not
 * attach recipients. Queueing would activate the campaign. Keep preview-only
 * recipients in this tab so the campaign UI can review them without queueing.
 */
export type LeadDraftRecipient = {
  leadId: string;
  company: string;
  contactName: string | null;
  body: string | null;
  kind: string | null;
  stepNo: number | null;
  error: string | null;
};

export type LeadDraftReview = {
  version: 1;
  campaignId: string;
  createdAt: string;
  recipients: LeadDraftRecipient[];
  excludedCount: number;
};

type DraftStorage = Pick<Storage, "getItem" | "setItem">;

export function leadDraftKey(campaignId: string): string {
  return `letmelead:lead-draft:${campaignId}`;
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

export function parseLeadDraftReview(text: string | null, campaignId: string): LeadDraftReview | null {
  if (!text) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object") return null;
    const draft = value as Partial<LeadDraftReview>;
    if (draft.version !== 1 || draft.campaignId !== campaignId || !campaignId ||
      typeof draft.createdAt !== "string" || !Number.isFinite(Date.parse(draft.createdAt)) ||
      !Number.isInteger(draft.excludedCount) || (draft.excludedCount ?? -1) < 0 ||
      !Array.isArray(draft.recipients) || !draft.recipients.length || draft.recipients.length > 200) return null;
    const ids = new Set<string>();
    for (const recipient of draft.recipients) {
      if (!recipient || typeof recipient !== "object" || typeof recipient.leadId !== "string" ||
        !recipient.leadId || ids.has(recipient.leadId) || typeof recipient.company !== "string" ||
        !nullableString(recipient.contactName) || !nullableString(recipient.body) ||
        !nullableString(recipient.kind) || !nullableString(recipient.error) ||
        (recipient.stepNo !== null && (!Number.isInteger(recipient.stepNo) || recipient.stepNo < 1))) return null;
      ids.add(recipient.leadId);
    }
    return draft as LeadDraftReview;
  } catch {
    return null;
  }
}

function tabStorage(): DraftStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function storeLeadDraftReview(draft: LeadDraftReview, storage: DraftStorage | null = tabStorage()): boolean {
  try {
    if (!storage) return false;
    storage.setItem(leadDraftKey(draft.campaignId), JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function readLeadDraftReview(campaignId: string, storage: DraftStorage | null = tabStorage()): LeadDraftReview | null {
  try {
    return storage ? parseLeadDraftReview(storage.getItem(leadDraftKey(campaignId)), campaignId) : null;
  } catch {
    return null;
  }
}

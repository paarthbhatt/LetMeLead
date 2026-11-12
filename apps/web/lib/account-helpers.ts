export const SETTINGS_SECTIONS = ["workspace", "team", "agents", "webhooks"] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export function settingsSectionFromHash(hash: string): SettingsSection {
  const section = hash.replace(/^#/, "");
  return SETTINGS_SECTIONS.includes(section as SettingsSection) ? (section as SettingsSection) : "workspace";
}

function briefText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function briefList(value: unknown): string[] {
  return (Array.isArray(value) ? value : [value]).flatMap((item) => {
    const text = briefText(item);
    return text ? [text] : [];
  });
}

export function buyerBrief(icp: Record<string, unknown> | null | undefined) {
  return {
    offer: briefText(icp?.offer),
    buyers: briefList(icp?.buyers),
    roles: briefList(icp?.roles),
    region: briefText(icp?.region),
    exclusions: briefList(icp?.exclusions),
  };
}

export function httpUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

export function buildMcpConfig(endpoint: string, key = "lmk_YOUR_API_KEY"): string {
  return JSON.stringify(
    {
      mcpServers: {
        letmelead: {
          type: "http",
          url: endpoint,
          headers: { Authorization: `Bearer ${key}` },
        },
      },
    },
    null,
    2,
  );
}

export function accountError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function parseLinkedinSession(input: string): Record<string, unknown> {
  let state: unknown;
  try {
    state = JSON.parse(input);
  } catch {
    throw new Error("That is not valid JSON. Paste the complete storage state file.");
  }
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new Error("The session must be a Playwright storage state object containing cookies.");
  }
  const record = state as Record<string, unknown>;
  if (!Array.isArray(record.cookies) || record.cookies.length === 0) {
    throw new Error("No cookies found. Export a new storage state after signing in to LinkedIn.");
  }
  if (record.cookies.some((cookie) => {
    if (!cookie || typeof cookie !== "object" || Array.isArray(cookie)) return true;
    return typeof cookie.name !== "string" || typeof cookie.value !== "string" || typeof cookie.domain !== "string";
  })) {
    throw new Error("The cookies are not in Playwright storage state format. Paste the exported file as-is.");
  }
  if (record.origins !== undefined && !Array.isArray(record.origins)) {
    throw new Error("The origins field must be an array. Paste the exported storage state file as-is.");
  }
  return record;
}

const LABELS: Record<string, string> = {
  user: "Team member", api_key: "API key", system: "System", tenant: "Workspace",
  linkedin_account: "LinkedIn account", owner: "Owner", member: "Member", viewer: "Viewer",
  "tenant.updated": "Workspace updated", "tenant.onboarding": "Buyer brief saved",
  "member.added": "Team member added", "member.role_changed": "Team role changed", "member.removed": "Team member removed",
  "api_key.created": "API key created", "api_key.revoked": "API key revoked",
  "webhook.created": "Webhook added", "webhook.deleted": "Webhook removed",
  "linkedin.connected": "LinkedIn session connected", "linkedin.paused": "LinkedIn outreach paused",
  "linkedin.resumed": "LinkedIn outreach resumed", "linkedin.disconnected": "LinkedIn session disconnected",
  "lead.created": "Lead found", "lead.claimed": "Lead claimed", "lead.not_fit": "Lead marked not a fit", "lead.updated": "Lead updated",
  "reply.received": "Reply received", "campaign.created": "Campaign created", "campaign.paused": "Campaign paused",
  "campaign.resumed": "Campaign resumed", "campaign.queued": "Campaign messages queued", "campaign.send_run": "Campaign sending requested",
  "sequence.updated": "Message sequence updated", "outreach.sent": "Outreach message sent",
  "outreach.failed": "Outreach message failed", "outreach.withdrawn": "Invitation withdrawn",
  "signal.toggled": "Buying signal updated", "source.updated": "Signal source updated", "scan.queued": "Signal scan queued",
  "target.added": "Target company added", "target.imported": "Target companies imported",
  "order.created": "Credit order created", "order.paid": "Credit order paid",
};

export function accountLabel(value: string | null | undefined): string {
  if (!value) return "—";
  if (Object.hasOwn(LABELS, value)) return LABELS[value];
  const text = value.replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
  return text ? text[0].toUpperCase() + text.slice(1) : "—";
}

export function auditCategory(action: string): string {
  const prefix = action.split(".")[0];
  if (["outreach", "campaign", "sequence", "linkedin"].includes(prefix)) return "outreach";
  if (["lead", "reply"].includes(prefix)) return "leads";
  if (["tenant", "member"].includes(prefix)) return "workspace";
  if (["order", "invoice", "credit", "credits"].includes(prefix)) return "billing";
  if (["api_key", "webhook"].includes(prefix)) return "integrations";
  if (["source", "signal", "scan", "target"].includes(prefix)) return "signals";
  return "other";
}

type SearchableAuditEntry = {
  id?: string; action: string; actor_type: string; actor_id: string | null; target_type: string | null; target_id: string | null;
};

export function filterAuditEntries<T extends SearchableAuditEntry>(
  entries: T[],
  { query = "", actor = "all", category = "all", actorNames = {} }: {
    query?: string; actor?: string; category?: string; actorNames?: Readonly<Record<string, string>>;
  } = {},
): T[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter((entry) => {
    if (actor !== "all" && entry.actor_type !== actor) return false;
    if (category !== "all" && auditCategory(entry.action) !== category) return false;
    const text = [entry.id, entry.action, accountLabel(entry.action), entry.actor_type, accountLabel(entry.actor_type),
      entry.actor_id, actorNames[`${entry.actor_type}:${entry.actor_id}`], entry.target_type,
      accountLabel(entry.target_type), entry.target_id].join(" ").toLowerCase();
    return terms.every((term) => text.includes(term));
  });
}

export function auditTargetHref(type: string | null, id: string | null): string | null {
  if (!id) return null;
  if (type === "lead") return `/leads/${encodeURIComponent(id)}`;
  if (type === "campaign") return `/campaigns/${encodeURIComponent(id)}`;
  return null;
}

export function ledgerLabel(reason: string): string {
  if (reason.startsWith("free lead ")) return `Free lead claimed · ${reason.slice(10)}`;
  if (reason.startsWith("claimed lead: ")) return `Lead claimed · ${reason.slice(14)}`;
  if (reason.startsWith("top-up: ")) return `Credit top-up · ${reason.slice(8)}`;
  return accountLabel(reason);
}

export type CheckoutNotice = { tone: "success" | "error" | "info"; title: string; message: string };

export function checkoutNotice(
  returnStatus: string | null,
  order: { status: string } | null | undefined,
  loading = false,
): CheckoutNotice | null {
  if (returnStatus !== "success" && returnStatus !== "cancelled") return null;
  if (loading) {
    return { tone: "info", title: "Checking your order", message: "Checkout has returned. We are checking the workspace order for payment confirmation." };
  }
  if (order?.status === "paid") {
    return { tone: "success", title: "Payment confirmed", message: "The server has marked this order paid. Check the balance and credit ledger for the granted credits." };
  }
  if (!order) {
    return { tone: "info", title: "Payment not verified", message: "This return could not be matched to a workspace order. Check the order history below; the URL alone does not confirm a payment." };
  }
  if (returnStatus === "cancelled") {
    return { tone: "info", title: "Checkout closed", message: "You returned without a confirmed payment. Check the order status below before starting another checkout." };
  }
  if (order.status !== "pending") {
    return { tone: "info", title: "Payment not confirmed", message: `The order is marked ${accountLabel(order.status).toLowerCase()}. Its payment has not been confirmed.` };
  }
  return { tone: "info", title: "Waiting for payment confirmation", message: "Checkout has returned, but this order is still pending. Credits are added only after the server confirms payment." };
}

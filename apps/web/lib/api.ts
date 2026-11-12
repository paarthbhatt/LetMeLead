"use client";

import { clearSession, getSession, saveTokens } from "./auth";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
export const MCP_URL = process.env.NEXT_PUBLIC_MCP_URL ?? "http://localhost:8765/mcp";

export class ApiError extends Error {
  status: number;
  code: string;
  details: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Options = Omit<RequestInit, "body"> & { body?: unknown; idempotencyKey?: string };

async function refresh(): Promise<boolean> {
  const session = getSession();
  if (!session?.refreshToken) return false;
  const res = await fetch(`${API_URL}/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: session.refreshToken }),
  });
  if (!res.ok) {
    clearSession();
    return false;
  }
  const data = (await res.json()) as { access_token: string; refresh_token: string };
  saveTokens(data);
  return true;
}

export async function request<T>(path: string, options: Options = {}, retried = false): Promise<T> {
  const session = getSession();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (session?.accessToken) headers.set("Authorization", `Bearer ${session.accessToken}`);
  if (session?.tenantId) headers.set("X-Tenant-Id", session.tenantId);
  if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey);

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (res.status === 401 && !retried && session?.refreshToken) {
    if (await refresh()) return request<T>(path, options, true);
    clearSession();
  }
  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: Record<string, unknown> } }).error;
    throw new ApiError(res.status, err?.code ?? "http_error", err?.message ?? res.statusText, err?.details ?? {});
  }
  return data as T;
}

export const api = {
  health: () => request<Health>("/v1/health"),
  stats: () => request<{ signals_7d: number; replies_unread: number }>("/v1/stats"),
  signup: (body: { email: string; password: string; name?: string; company_name?: string }) =>
    request<{ access_token: string; refresh_token: string }>("/v1/auth/signup", { method: "POST", body }),
  login: (body: { email: string; password: string }) =>
    request<{ access_token: string; refresh_token: string }>("/v1/auth/login", { method: "POST", body }),
  me: () =>
    request<{
      user: { id: string; email: string; name: string | null };
      tenants: { id: string; name: string; slug: string; role: string }[];
      active_tenant_id: string | null;
    }>("/v1/auth/me"),
  switchTenant: (tenant_id: string) =>
    request<{ access_token: string; refresh_token: string }>("/v1/auth/switch-tenant?tenant_id=" + tenant_id, {
      method: "POST",
    }),

  tenant: () =>
    request<{
      id: string;
      name: string;
      website: string | null;
      icp: Record<string, unknown>;
      onboarding_complete: boolean;
    }>("/v1/tenant"),
  onboarding: (body: Record<string, unknown>) =>
    request<{ id: string; name: string; icp: Record<string, unknown> }>("/v1/tenant/onboarding", {
      method: "POST",
      body,
    }),
  updateTenant: (body: Record<string, unknown>) =>
    request<Record<string, unknown>>("/v1/tenant", { method: "PATCH", body }),

  members: () => request<Member[]>("/v1/tenant/members"),
  apiKeys: () => request<ApiKey[]>("/v1/tenant/api-keys"),
  createApiKey: (name: string) =>
    request<ApiKey & { api_key: string }>("/v1/tenant/api-keys", { method: "POST", body: { name } }),
  revokeApiKey: (id: string) => request<void>(`/v1/tenant/api-keys/${id}`, { method: "DELETE" }),

  sources: () => request<Source[]>("/v1/sources"),
  updateSource: (id: string, body: Record<string, unknown>) =>
    request<Source>(`/v1/sources/${id}`, { method: "PATCH", body }),
  signalCatalog: () => request<SignalCatalog>("/v1/signals/catalog"),
  setSignal: (id: string, enabled: boolean) =>
    request<{ id: string; enabled: boolean }>(`/v1/signals/${id}`, { method: "PUT", body: { enabled } }),
  scan: (body: { sources?: string[]; wait?: boolean; limit_targets?: number }) =>
    request<{ status: string; report?: Record<string, unknown> }>("/v1/sources/scan", { method: "POST", body }),
  targets: (limit = 100) => request<Page<Target>>(`/v1/targets?limit=${limit}`),
  addTarget: (body: { company: string; domain: string; country?: string }) =>
    request<Target>("/v1/targets", { method: "POST", body }),
  importTargets: (text: string) =>
    request<{ added: number; skipped: number }>(`/v1/targets/import?text=${encodeURIComponent(text)}`, {
      method: "POST",
    }),

  leads: (params: Record<string, string | number | undefined> = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== "") query.set(key, String(value));
    });
    return request<Page<Lead>>(`/v1/leads?${query.toString()}`);
  },
  lead: (id: string) => request<LeadDetail>(`/v1/leads/${id}`),
  claim: (id: string) =>
    request<{ lead: Lead; credits_charged: number; was_free: boolean; credits_remaining: number }>(
      `/v1/leads/${id}/claim`,
      { method: "POST", idempotencyKey: `claim-${id}` },
    ),
  notFit: (id: string, reason: string) =>
    request<Lead>(`/v1/leads/${id}/not-fit`, { method: "POST", body: { reason } }),

  campaigns: () => request<Campaign[]>("/v1/campaigns"),
  campaign: (id: string) => request<CampaignDetail>(`/v1/campaigns/${id}`),
  createCampaign: (body: { name: string; lead_ids?: string[] }) =>
    request<CampaignDetail>("/v1/campaigns", { method: "POST", body }),
  pauseCampaign: (id: string, reason?: string) =>
    request<CampaignDetail>(`/v1/campaigns/${id}/pause`, { method: "POST", body: { reason } }),
  resumeCampaign: (id: string) => request<CampaignDetail>(`/v1/campaigns/${id}/resume`, { method: "POST" }),
  updateSequence: (id: string, body: { name: string; steps: SequenceStepInput[] }) =>
    request<Sequence>(`/v1/campaigns/${id}/sequence`, { method: "PUT", body }),
  queueCampaign: (id: string, lead_ids: string[]) =>
    request<{ queued: number }>(`/v1/campaigns/${id}/queue`, { method: "POST", body: { lead_ids } }),
  sendCampaign: (id: string) =>
    request<Record<string, unknown>>(`/v1/campaigns/${id}/send`, { method: "POST" }),
  preview: (campaignId: string, leadId: string) =>
    request<{ step_no: number; kind: string; body: string; lead: string }>(
      `/v1/campaigns/${campaignId}/preview/${leadId}`,
    ),
  campaignMessages: (id: string) => request<Message[]>(`/v1/campaigns/${id}/messages`),

  replies: (unreadOnly = false) =>
    request<Page<Reply>>(`/v1/replies?limit=50&unread_only=${unreadOnly}`),
  threads: () => request<{ threads: Thread[] }>("/v1/replies/threads"),
  markReplyRead: (id: string) => request<Reply>(`/v1/replies/${id}/read`, { method: "POST" }),

  linkedin: () => request<LinkedinAccount[]>("/v1/linkedin"),
  linkedinLimits: () =>
    request<{ connected: boolean; current_daily_cap: number | null; dry_run: boolean; outreach_enabled: boolean }>(
      "/v1/linkedin/limits",
    ),
  connectLinkedin: (storage_state: unknown, handle?: string) =>
    request<LinkedinAccount>("/v1/linkedin/connect", {
      method: "POST",
      body: { storage_state, handle },
    }),
  pauseLinkedin: (reason?: string) =>
    request<LinkedinAccount>("/v1/linkedin/pause", { method: "POST", body: { reason } }),
  resumeLinkedin: () => request<LinkedinAccount>("/v1/linkedin/resume", { method: "POST" }),
  disconnectLinkedin: (id: string) => request<void>(`/v1/linkedin/${id}`, { method: "DELETE" }),

  credits: () =>
    request<{
      balance: number;
      free_leads_used: number;
      free_leads_remaining: number;
      lead_price_credits: number;
      spend_report: { credits_spent: number; credits_purchased: number };
    }>("/v1/credits"),
  ledger: () => request<Page<LedgerEntry>>("/v1/credits/ledger?limit=50"),
  topUp: (pack: number) =>
    request<Order>("/v1/orders/top-up", {
      method: "POST",
      body: { pack },
      idempotencyKey: `topup-${pack}-${Date.now()}`,
    }),
  orders: () => request<Order[]>("/v1/orders"),
  invoices: () => request<Invoice[]>("/v1/invoices"),

  audit: () => request<Page<AuditEntry>>("/v1/audit?limit=50"),
  webhooks: () => request<Webhook[]>("/v1/webhooks"),
  createWebhook: (url: string, events: string[]) =>
    request<Webhook>("/v1/webhooks", { method: "POST", body: { url, events } }),
  deleteWebhook: (id: string) => request<void>(`/v1/webhooks/${id}`, { method: "DELETE" }),
};

export type Page<T> = { items: T[]; next_cursor: string | null };
export type Health = {
  status: string;
  version: string;
  providers: {
    llm: string;
    enrichment: string;
    stripe: boolean;
    google_oauth: boolean;
    outreach_enabled: boolean;
    outreach_dry_run: boolean;
  };
};
export type Member = { id: string; user_id: string; email: string; name: string | null; role: string };
export type ApiKey = { id: string; name: string; prefix: string; last_used_at: string | null; created_at: string };
export type Source = {
  id: string;
  kind: string;
  name: string;
  enabled: boolean;
  config: Record<string, unknown>;
  daily_quota: number;
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
};
export type Target = { id: string; company: string; domain: string; country: string | null; active: boolean };
export type SignalStatus = "live" | "partly_live" | "by_hand";
export type SignalDef = {
  id: string;
  label: string;
  description: string;
  why_now: string;
  how_it_works: string;
  status: SignalStatus;
  status_label: string;
  channels: string[];
  adapters: string[];
  automatic: boolean;
  enabled: boolean;
};
export type SignalCategory = { id: string; label: string; signals: SignalDef[] };
export type SignalCatalog = { categories: SignalCategory[]; legend: Record<string, string> };
export type Lead = {
  id: string;
  company: string;
  domain: string;
  reason: string;
  signal_at: string | null;
  signal_age_days: number | null;
  score: number;
  fit: string;
  fit_confidence: number;
  fit_reason: string | null;
  verification_status: string;
  status: string;
  linkedin_url: string | null;
  email: string | null;
  claimed_at: string | null;
  created_at: string;
  contact: { name: string | null; title: string | null; linkedin_url: string | null } | null;
};
export type Evidence = {
  id: string;
  source: string;
  type: string;
  strength: string;
  title: string;
  url: string | null;
  published_at: string | null;
  points: number;
};
export type Contact = {
  id: string;
  name: string | null;
  title: string | null;
  linkedin_url: string | null;
  email: string | null;
  phone: string | null;
  confidence: number;
  verified: boolean;
};
export type LeadDetail = Lead & {
  evidence: Evidence[];
  contacts: Contact[];
  fit_evidence: Record<string, unknown>;
};
export type Campaign = {
  id: string;
  name: string;
  status: string;
  daily_cap: number | null;
  pause_reason: string | null;
  created_at: string;
};
export type SequenceStepInput = { step_no: number; kind: string; body_template: string; delay_days: number };
export type Sequence = { id: string; name: string; steps: SequenceStepInput[] };
export type CampaignDetail = Campaign & {
  sequence: Sequence | null;
  lead_count: number;
  messages_sent: number;
  pending: number;
  replies: number;
};
export type Message = {
  id: string;
  lead_id: string;
  step_no: number;
  body: string;
  status: string;
  scheduled_at: string | null;
  sent_at: string | null;
  error: string | null;
};
export type Reply = {
  id: string;
  campaign_id: string | null;
  lead_id: string;
  body: string;
  received_at: string;
  stop_sequence: boolean;
  read_at: string | null;
};
export type Thread = {
  lead_id: string;
  company: string;
  domain: string;
  last_reply_at: string;
  unread: number;
  preview: string;
};
export type LinkedinAccount = {
  id: string;
  handle: string | null;
  status: string;
  connected_at: string | null;
  paused_reason: string | null;
};
export type LedgerEntry = {
  id: string;
  delta: number;
  reason: string;
  ref_type: string | null;
  balance_after: number;
  created_at: string;
};
export type Order = {
  id: string;
  credits: number;
  amount_cents: number;
  currency: string;
  status: string;
  checkout_url: string | null;
  created_at: string;
};
export type Invoice = {
  id: string;
  number: string;
  amount_cents: number;
  url: string | null;
  issued_at: string;
};
export type AuditEntry = {
  id: string;
  actor_type: string;
  actor_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  created_at: string;
};
export type Webhook = { id: string; url: string; events: string[]; active: boolean; created_at: string };

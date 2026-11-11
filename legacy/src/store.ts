import { getDb, nowIso } from "./db.js";

export interface Settings {
  account_id: number;
  website: string;
  offer: string;
  buyers: string[];
  roles: string[];
  region: string;
  exclusions: string[];
  target_list: string;
  sources: string[];
  brief_complete: boolean;
  updated_at: string | null;
}

function parseArray(value: unknown): string[] {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return value.split(",").map((s) => s.trim()).filter(Boolean);
  }
}

function rowToSettings(row: Record<string, unknown> | undefined): Settings {
  return {
    account_id: Number(row?.account_id ?? 1),
    website: String(row?.website ?? ""),
    offer: String(row?.offer ?? ""),
    buyers: parseArray(row?.buyers),
    roles: parseArray(row?.roles),
    region: String(row?.region ?? ""),
    exclusions: parseArray(row?.exclusions),
    target_list: String(row?.target_list ?? ""),
    sources: parseArray(row?.sources),
    brief_complete: Boolean(row?.brief_complete),
    updated_at: (row?.updated_at as string) ?? null,
  };
}

export interface AccountRow {
  id: number;
  name: string;
  email: string | null;
}

export function getAccount(accountId = 1): AccountRow {
  const row = getDb().prepare("SELECT id, name, email FROM accounts WHERE id = ?").get(accountId) as unknown as
    | AccountRow
    | undefined;
  return row ?? { id: accountId, name: "LetMeLead", email: null };
}

export function getSettings(accountId = 1): Settings {
  const row = getDb().prepare("SELECT * FROM settings WHERE account_id = ?").get(accountId) as
    | Record<string, unknown>
    | undefined;
  return rowToSettings(row);
}

export function updateSettings(accountId: number, patch: Partial<Settings>): Settings {
  const cur = getSettings(accountId);
  const next: Settings = { ...cur, ...patch, account_id: accountId, updated_at: nowIso() };
  getDb()
    .prepare(
      `UPDATE settings SET website=?, offer=?, buyers=?, roles=?, region=?, exclusions=?, target_list=?, sources=?, brief_complete=?, updated_at=? WHERE account_id=?`
    )
    .run(
      next.website,
      next.offer,
      JSON.stringify(next.buyers),
      JSON.stringify(next.roles),
      next.region,
      JSON.stringify(next.exclusions),
      next.target_list,
      JSON.stringify(next.sources),
      next.brief_complete ? 1 : 0,
      next.updated_at,
      accountId
    );
  return getSettings(accountId);
}

export function getBalance(accountId = 1): number {
  const row = getDb().prepare("SELECT COALESCE(SUM(delta),0) AS bal FROM credits_ledger WHERE account_id = ?").get(accountId) as {
    bal: number;
  };
  return Math.round(Number(row.bal) * 100) / 100;
}

export function addCredits(accountId: number, delta: number, reason: string): number {
  getDb().prepare("INSERT INTO credits_ledger (account_id, delta, reason) VALUES (?, ?, ?)").run(accountId, delta, reason);
  return getBalance(accountId);
}

export interface LeadRow {
  id: number;
  account_id: number;
  name: string | null;
  role: string | null;
  company: string | null;
  domain: string | null;
  linkedin: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  signal: string | null;
  signal_label: string | null;
  signal_date: string | null;
  signal_age_days: number | null;
  source_url: string | null;
  reason: string | null;
  score: number;
  confidence: number;
  fit: string;
  fit_reason: string | null;
  credits_spent: number;
  status: string;
  created_at: string;
}

export function listLeads(accountId = 1, opts: { limit?: number; status?: string } = {}): LeadRow[] {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 1000);
  if (opts.status) {
    return getDb()
      .prepare("SELECT * FROM leads WHERE account_id = ? AND status = ? ORDER BY score DESC, signal_age_days ASC LIMIT ?")
      .all(accountId, opts.status, limit) as unknown as LeadRow[];
  }
  return getDb()
    .prepare("SELECT * FROM leads WHERE account_id = ? ORDER BY score DESC, signal_age_days ASC LIMIT ?")
    .all(accountId, limit) as unknown as LeadRow[];
}

export function getLead(id: number): LeadRow | undefined {
  return getDb().prepare("SELECT * FROM leads WHERE id = ?").get(id) as unknown as LeadRow | undefined;
}

export function updateLead(id: number, patch: { status?: string; fit?: string; email?: string; phone?: string; linkedin?: string }): LeadRow | undefined {
  const lead = getLead(id);
  if (!lead) return undefined;
  getDb()
    .prepare("UPDATE leads SET status=?, fit=?, email=?, phone=?, linkedin=? WHERE id=?")
    .run(
      patch.status ?? lead.status,
      patch.fit ?? lead.fit,
      patch.email ?? lead.email,
      patch.phone ?? lead.phone,
      patch.linkedin ?? lead.linkedin,
      id
    );
  return getLead(id);
}

export interface UpsertLeadInput {
  accountId: number;
  company: string;
  domain: string;
  name?: string | null;
  role?: string | null;
  linkedin?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  signal: string;
  signalLabel: string;
  signalDate: string;
  signalAgeDays: number | null;
  sourceUrl: string | null;
  reason: string;
  score: number;
  confidence?: number;
  fit?: string;
  fitReason?: string | null;
  creditsSpent?: number;
}

export function upsertLead(input: UpsertLeadInput): { lead: LeadRow; created: boolean } {
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM leads WHERE account_id = ? AND domain = ?")
    .get(input.accountId, input.domain) as unknown as LeadRow | undefined;
  if (existing) {
    if (input.score >= existing.score) {
      db.prepare(
        `UPDATE leads SET company=?, name=?, role=?, linkedin=?, email=?, phone=?, source=?, signal=?, signal_label=?, signal_date=?, signal_age_days=?, source_url=?, reason=?, score=?, confidence=?, fit=?, fit_reason=? WHERE id=?`
      ).run(
        input.company,
        input.name ?? existing.name,
        input.role ?? existing.role,
        input.linkedin ?? existing.linkedin,
        input.email ?? existing.email,
        input.phone ?? existing.phone,
        input.source ?? existing.source,
        input.signal,
        input.signalLabel,
        input.signalDate,
        input.signalAgeDays,
        input.sourceUrl,
        input.reason,
        input.score,
        input.confidence ?? existing.confidence,
        input.fit ?? existing.fit,
        input.fitReason ?? existing.fit_reason,
        existing.id
      );
    }
    return { lead: getLead(existing.id)!, created: false };
  }
  const res = db
    .prepare(
      `INSERT INTO leads (account_id, name, role, company, domain, linkedin, email, phone, source, signal, signal_label, signal_date, signal_age_days, source_url, reason, score, confidence, fit, fit_reason, credits_spent, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')`
    )
    .run(
      input.accountId,
      input.name ?? null,
      input.role ?? null,
      input.company,
      input.domain,
      input.linkedin ?? null,
      input.email ?? null,
      input.phone ?? null,
      input.source ?? null,
      input.signal,
      input.signalLabel,
      input.signalDate,
      input.signalAgeDays,
      input.sourceUrl,
      input.reason,
      input.score,
      input.confidence ?? 0,
      input.fit ?? "unknown",
      input.fitReason ?? null,
      input.creditsSpent ?? 0
    );
  return { lead: getLead(Number(res.lastInsertRowid))!, created: true };
}

export function countLeads(accountId = 1): number {
  const row = getDb().prepare("SELECT COUNT(*) AS n FROM leads WHERE account_id = ?").get(accountId) as { n: number };
  return Number(row.n);
}

export function setLeadCredits(id: number, amount: number): void {
  getDb().prepare("UPDATE leads SET credits_spent = ? WHERE id = ?").run(amount, id);
}

export function addSignal(accountId: number, leadId: number | null, domain: string, s: { source?: string; type: string; label: string; date: string; sourceUrl?: string; detail?: string; points?: number }): void {
  getDb()
    .prepare("INSERT INTO signals (account_id, lead_id, domain, source, type, label, date, source_url, detail, points) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(accountId, leadId, domain, s.source ?? null, s.type, s.label, s.date, s.sourceUrl ?? null, s.detail ?? null, s.points ?? null);
}

export function clearSignalsForLead(leadId: number): void {
  getDb().prepare("DELETE FROM signals WHERE lead_id = ?").run(leadId);
}

export function listSignalsForLead(leadId: number): Array<{ source: string | null; type: string; label: string; date: string; source_url: string | null; points: number | null }> {
  return getDb()
    .prepare("SELECT source, type, label, date, source_url, points FROM signals WHERE lead_id = ? ORDER BY points DESC")
    .all(leadId) as unknown as Array<{ source: string | null; type: string; label: string; date: string; source_url: string | null; points: number | null }>;
}

export interface CampaignRow {
  id: number;
  account_id: number;
  name: string;
  status: string;
  sender: string;
  send_automatically: number;
  warm_up: number;
  created_at: string;
}

export function listCampaigns(accountId = 1): CampaignRow[] {
  return getDb().prepare("SELECT * FROM campaigns WHERE account_id = ? ORDER BY id DESC").all(accountId) as unknown as CampaignRow[];
}

export function getCampaign(id: number): CampaignRow | undefined {
  return getDb().prepare("SELECT * FROM campaigns WHERE id = ?").get(id) as unknown as CampaignRow | undefined;
}

export function createCampaign(accountId: number, name: string, sender = "manual"): CampaignRow {
  const res = getDb().prepare("INSERT INTO campaigns (account_id, name, sender) VALUES (?, ?, ?)").run(accountId, name, sender);
  return getCampaign(Number(res.lastInsertRowid))!;
}

export function setCampaignSender(campaignId: number, sender: string): CampaignRow | undefined {
  getDb().prepare("UPDATE campaigns SET sender = ? WHERE id = ?").run(sender, campaignId);
  return getCampaign(campaignId);
}

export function setSequence(campaignId: number, steps: string[]): void {
  const db = getDb();
  db.prepare("DELETE FROM sequences WHERE campaign_id = ?").run(campaignId);
  const stmt = db.prepare("INSERT INTO sequences (campaign_id, step, body) VALUES (?, ?, ?)");
  steps.forEach((body, i) => stmt.run(campaignId, i + 1, body));
}

export function getSequences(campaignId: number): Array<{ step: number; body: string }> {
  return getDb().prepare("SELECT step, body FROM sequences WHERE campaign_id = ? ORDER BY step").all(campaignId) as unknown as Array<{
    step: number;
    body: string;
  }>;
}

export function addLeadsToCampaign(campaignId: number, leadIds: number[]): number {
  const db = getDb();
  const stmt = db.prepare("INSERT OR IGNORE INTO campaign_leads (campaign_id, lead_id, state) VALUES (?, ?, 'queued')");
  let added = 0;
  for (const id of leadIds) {
    const r = stmt.run(campaignId, id);
    added += Number(r.changes);
  }
  return added;
}

export function campaignLeadIds(campaignId: number): number[] {
  const rows = getDb().prepare("SELECT lead_id FROM campaign_leads WHERE campaign_id = ?").all(campaignId) as unknown as Array<{
    lead_id: number;
  }>;
  return rows.map((r) => r.lead_id);
}

export function queuedCampaignLeads(campaignId: number, limit: number): number[] {
  const rows = getDb()
    .prepare("SELECT lead_id FROM campaign_leads WHERE campaign_id = ? AND state = 'queued' ORDER BY id LIMIT ?")
    .all(campaignId, limit) as unknown as Array<{ lead_id: number }>;
  return rows.map((r) => r.lead_id);
}

export function setCampaignLeadState(campaignId: number, leadId: number, state: string): void {
  getDb()
    .prepare("UPDATE campaign_leads SET state = ?, updated_at = datetime('now') WHERE campaign_id = ? AND lead_id = ?")
    .run(state, campaignId, leadId);
}

export function logActivity(campaignId: number, leadId: number | null, type: string): void {
  getDb().prepare("INSERT INTO activity (campaign_id, lead_id, type) VALUES (?, ?, ?)").run(campaignId, leadId, type);
}

export function setCampaignStatus(campaignId: number, status: string): CampaignRow | undefined {
  getDb().prepare("UPDATE campaigns SET status = ? WHERE id = ?").run(status, campaignId);
  return getCampaign(campaignId);
}

export function setCampaignFlags(campaignId: number, patch: { send_automatically?: boolean; warm_up?: boolean }): CampaignRow | undefined {
  const c = getCampaign(campaignId);
  if (!c) return undefined;
  getDb()
    .prepare("UPDATE campaigns SET send_automatically = ?, warm_up = ? WHERE id = ?")
    .run(
      (patch.send_automatically ?? Boolean(c.send_automatically)) ? 1 : 0,
      (patch.warm_up ?? Boolean(c.warm_up)) ? 1 : 0,
      campaignId
    );
  return getCampaign(campaignId);
}

export function campaignActivity(campaignId: number): { sent: number; accepted: number; replied: number; byState: Record<string, number> } {
  const rows = getDb().prepare("SELECT state, COUNT(*) AS n FROM campaign_leads WHERE campaign_id = ? GROUP BY state").all(campaignId) as unknown as Array<{
    state: string;
    n: number;
  }>;
  const byState: Record<string, number> = {};
  for (const r of rows) byState[r.state] = Number(r.n);
  return {
    sent: Object.values(byState).reduce((a, b) => a + b, 0),
    accepted: byState["accepted"] || 0,
    replied: byState["replied"] || 0,
    byState,
  };
}

export function listLinkedinAccounts(accountId = 1): Array<{ id: number; handle: string | null; status: string }> {
  return getDb().prepare("SELECT id, handle, status FROM linkedin_accounts WHERE account_id = ?").all(accountId) as unknown as Array<{
    id: number;
    handle: string | null;
    status: string;
  }>;
}

export function addRequest(accountId: number, note: string): { id: number; status: string } {
  const res = getDb().prepare("INSERT INTO requests (account_id, note) VALUES (?, ?)").run(accountId, note);
  return { id: Number(res.lastInsertRowid), status: "noted" };
}

export function listRequests(accountId = 1): Array<{ id: number; note: string; status: string; created_at: string }> {
  return getDb().prepare("SELECT id, note, status, created_at FROM requests WHERE account_id = ? ORDER BY id DESC").all(accountId) as unknown as Array<{
    id: number;
    note: string;
    status: string;
    created_at: string;
  }>;
}

export function listPlays(): Array<{ key: string; title: string; description: string }> {
  return [
    { key: "find_leads", title: "Find leads", description: "Scan your target list for fresh buying signals and rank the best accounts." },
    { key: "review_leads", title: "Review leads", description: "Read each lead's signal in plain words and mark fit / not fit." },
    { key: "draft_campaign", title: "Draft a LinkedIn campaign", description: "Write a short, signal-specific sequence and approve it before sending." },
    { key: "run_outreach", title: "Run outreach", description: "Queue approved leads for LinkedIn outreach from your own account." },
  ];
}

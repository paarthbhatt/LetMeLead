import type { Evidence, Lead } from "./api";

export type LeadSort = "strongest" | "newest";

function compareNewest(a: string | null, b: string | null) {
  const aTime = a ? Date.parse(a) : NaN;
  const bTime = b ? Date.parse(b) : NaN;
  const left = Number.isFinite(aTime) ? aTime : -Infinity;
  const right = Number.isFinite(bTime) ? bTime : -Infinity;
  return left === right ? 0 : left > right ? -1 : 1;
}

function compareScore(a: number, b: number) {
  const left = Number.isFinite(a) ? a : -Infinity;
  const right = Number.isFinite(b) ? b : -Infinity;
  return left === right ? 0 : left > right ? -1 : 1;
}

/** The API pages by creation date. Score sorting is deliberately page-local. */
export function sortLeads(leads: readonly Lead[], sort: LeadSort): Lead[] {
  return [...leads].sort((a, b) =>
    (sort === "strongest" ? compareScore(a.score, b.score) : 0) ||
    compareNewest(a.created_at, b.created_at) ||
    a.company.localeCompare(b.company) ||
    a.id.localeCompare(b.id),
  );
}

export function sortEvidence(evidence: readonly Evidence[]): Evidence[] {
  return [...evidence].sort((a, b) =>
    compareNewest(a.published_at, b.published_at) ||
    compareScore(a.points, b.points) ||
    a.id.localeCompare(b.id),
  );
}

export function scoreLabel(score: number): string {
  return Number.isFinite(score)
    ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(score)
    : "—";
}

export function confidenceLabel(confidence: number): string {
  return Number.isFinite(confidence)
    ? `${Math.round(Math.max(0, Math.min(1, confidence)) * 100)}%`
    : "Not scored";
}

export function fitLabel(fit: string): string {
  if (fit === "fit") return "Good fit";
  if (fit === "not_fit") return "Not a fit";
  return "Fit unknown";
}

export function canClaimLead(lead: Pick<Lead, "status" | "fit" | "claimed_at">): boolean {
  return lead.status.toLowerCase() === "new" && lead.fit !== "not_fit" && !lead.claimed_at;
}

export function isDraftEligible(lead: Pick<Lead, "status" | "fit">): boolean {
  return lead.status.toLowerCase() === "claimed" && lead.fit !== "not_fit";
}

export function reviewLeadSelection(leads: readonly Lead[]) {
  const eligible: Lead[] = [];
  const excluded: { lead: Lead; reason: string }[] = [];
  const seen = new Set<string>();
  for (const lead of leads) {
    if (seen.has(lead.id)) continue;
    seen.add(lead.id);
    if (isDraftEligible(lead)) {
      eligible.push(lead);
    } else {
      excluded.push({
        lead,
        reason: lead.fit === "not_fit"
          ? "Not a fit — excluded"
          : lead.status.toLowerCase() === "new"
            ? "Claim first — excluded"
            : "Not in claimed status — excluded",
      });
    }
  }
  return { eligible, excluded };
}

export function toggleLeadSelection(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((value) => value !== id) : [...new Set([...ids, id])];
}

export function togglePageSelection(ids: readonly string[], pageIds: readonly string[]): string[] {
  if (!pageIds.length) return [...ids];
  if (pageIds.every((id) => ids.includes(id))) {
    const page = new Set(pageIds);
    return ids.filter((id) => !page.has(id));
  }
  return [...new Set([...ids, ...pageIds])];
}

/** Public-source URLs must not execute code or carry embedded credentials. */
export function safeExternalUrl(value: string | null | undefined): string | null {
  if (!value || /[\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value.trim());
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function companyWebsite(domain: string | null | undefined): string | null {
  const value = domain?.trim();
  if (!value || value.startsWith("//")) return null;
  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(value);
  const url = safeExternalUrl(hasScheme ? value : `https://${value}`);
  if (!url) return null;
  return new URL(url).hostname.includes(".") ? url : null;
}

export function emailHref(value: string | null | undefined): string | null {
  const email = value?.trim();
  if (!email || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) || /[\u0000-\u001f\u007f]/.test(value ?? "")) {
    return null;
  }
  return `mailto:${encodeURIComponent(email).replace("%40", "@")}`;
}

/** Never manufacture a person's name when only a role or company channel exists. */
export function leadContactSummary(lead: Pick<Lead, "contact" | "linkedin_url" | "email">) {
  const name = lead.contact?.name?.trim();
  const title = lead.contact?.title?.trim();
  const profile = safeExternalUrl(lead.contact?.linkedin_url);
  const linkedinUrl = profile ?? safeExternalUrl(lead.linkedin_url);
  // The list API can return ContactOut.email even though the client summary
  // type only declares name, title and linkedin_url. Preserve that fallback.
  const contact = lead.contact as (NonNullable<Lead["contact"]> & { email?: string | null }) | null;
  const email = [contact?.email, lead.email].find((value) => emailHref(value))?.trim() ?? null;
  return {
    label: name || title || email || (linkedinUrl ? "LinkedIn available" : "No named contact yet"),
    detail: name
      ? title || "Role not provided"
      : title
        ? "Name not stated in source"
        : email
          ? "Company email · no named contact"
          : profile
            ? "Name not stated in source"
            : "Use evidence or the company website",
    named: Boolean(name),
    href: name || title ? linkedinUrl : email ? emailHref(email) : linkedinUrl,
    linkedinUrl,
    email,
  };
}

export type ClaimBalance = {
  balance: number;
  free_leads_remaining: number;
  lead_price_credits: number;
};

export function claimQuote(balance: ClaimBalance) {
  if ([balance.balance, balance.free_leads_remaining, balance.lead_price_credits]
    .some((value) => !Number.isFinite(value) || value < 0)) return null;
  const free = balance.free_leads_remaining > 0;
  const credits = free ? 0 : balance.lead_price_credits;
  return { credits, free, canAfford: balance.balance >= credits };
}

export function notFitReasonError(reason: string): string | null {
  if (!reason.trim()) return "Add a reason before archiving this lead.";
  if (reason.trim().length > 500) return "Keep the reason to 500 characters or fewer.";
  return null;
}

export function qualificationLimitations(evidence: Record<string, unknown>): string[] {
  return Array.isArray(evidence.limitations)
    ? evidence.limitations.filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    : [];
}

function quoteCsvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

/** Quoting alone does not stop spreadsheet formula execution. */
export function safeCsvCell(value: string | number | null | undefined): string {
  const text = String(value ?? "");
  const formula = /^[\s\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060\ufeff]*[=+\-@]/.test(text);
  const controlPrefix = /^[\t\r\n]/.test(text);
  return quoteCsvCell(formula || controlPrefix ? `'${text}` : text);
}

export function leadsToCsv(leads: readonly Lead[]): string {
  const header = ["company", "domain", "person", "title", "linkedin", "email", "reason", "status", "found_at", "signal_at", "score", "fit"];
  const rows = leads.map((lead) => [
    lead.company,
    lead.domain,
    lead.contact?.name,
    lead.contact?.title,
    safeExternalUrl(lead.contact?.linkedin_url) ?? safeExternalUrl(lead.linkedin_url),
    leadContactSummary(lead).email ?? lead.email,
    lead.reason,
    lead.status,
    lead.created_at,
    lead.signal_at,
    Number.isFinite(lead.score) ? lead.score : null,
    lead.fit,
  ].map(safeCsvCell).join(","));
  return [header.join(","), ...rows].join("\r\n");
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let closedQuote = false;
  const finishCell = () => {
    row.push(cell);
    cell = "";
    closedQuote = false;
  };
  const finishRow = () => {
    finishCell();
    if (row.some((value) => value.trim())) rows.push(row);
    row = [];
  };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
          closedQuote = true;
        }
      } else {
        cell += char;
      }
    } else if (char === ",") {
      finishCell();
    } else if (char === "\n" || char === "\r") {
      finishRow();
      if (char === "\r" && text[index + 1] === "\n") index += 1;
    } else if (closedQuote) {
      if (char !== " " && char !== "\t") throw new Error("Unexpected text after a quoted CSV field.");
    } else if (char === '"') {
      if (cell.length) throw new Error("Quote CSV fields that contain quotation marks.");
      quoted = true;
    } else {
      cell += char;
    }
  }
  if (quoted) throw new Error("A quoted CSV field is missing its closing quotation mark.");
  finishRow();
  return rows;
}

// importTargets sends text in the URL. Bound the encoded payload, not just file bytes.
export const MAX_TARGET_CSV_URL_LENGTH = 6_000;
const TARGET_COLUMNS = new Set(["company", "domain", "country", "employer", "news_query", "careers_url"]);

export function validateTargetCsv(text: string): { csv: string; rowCount: number } {
  const rows = parseCsv(text.replace(/^\ufeff/, "").trim());
  if (!rows.length) throw new Error("Add a CSV with a company,domain header and at least one target company.");
  const headers = rows[0].map((value) => value.trim().toLowerCase());
  if (!headers.includes("company") || !headers.includes("domain")) {
    throw new Error("The header must include company and domain. This imports targets, not leads.");
  }
  if (new Set(headers).size !== headers.length) throw new Error("Each CSV column needs a unique header.");
  if (headers.some((header) => !TARGET_COLUMNS.has(header))) {
    throw new Error("Use target columns only: company, domain, country, employer, news_query, careers_url.");
  }
  const targets = rows.slice(1);
  if (!targets.length) throw new Error("Add at least one target company below the header.");
  for (const [index, row] of targets.entries()) {
    if (row.length !== headers.length) throw new Error(`Target row ${index + 1} has a different number of fields than the header.`);
    if (!row[headers.indexOf("company")].trim()) throw new Error(`Target row ${index + 1} needs a company name.`);
    if (!companyWebsite(row[headers.indexOf("domain")])) throw new Error(`Target row ${index + 1} needs a valid company domain.`);
  }
  const csv = [headers, ...targets].map((row) => row.map(quoteCsvCell).join(",")).join("\r\n");
  if (encodeURIComponent(csv).length > MAX_TARGET_CSV_URL_LENGTH) {
    throw new Error("This CSV is too large for the import API. Split it into smaller files (up to 6 KB URL-encoded).");
  }
  return { csv, rowCount: targets.length };
}

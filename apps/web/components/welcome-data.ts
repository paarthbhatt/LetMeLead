import type { api, Campaign, Lead, Page, Source } from "@/lib/api";

export type WelcomeCredits = Awaited<ReturnType<typeof api.credits>>;
export type WelcomeStats = Awaited<ReturnType<typeof api.stats>>;
export type WelcomeTenant = Awaited<ReturnType<typeof api.tenant>>;
export type WelcomeTone = "default" | "success" | "warning" | "danger" | "muted";

export function welcomeError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function welcomeNumber(value: number | undefined) {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value.toLocaleString("en-US") : "—";
}

export function welcomeDate(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Not dated";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

export function welcomeSourceHealth(source: Source): { label: string; tone: WelcomeTone; hint: string; needsAttention: boolean } {
  if (!source.enabled) return { label: "Off", tone: "muted", hint: "Not included in scans.", needsAttention: false };
  if (source.last_status === "unconfigured") {
    return { label: "Needs setup", tone: "warning", hint: source.last_error || "The last scan found missing provider credentials.", needsAttention: true };
  }
  if (source.last_status === "blocked") {
    return { label: "Blocked", tone: "warning", hint: source.last_error || "The provider refused the last scan.", needsAttention: true };
  }
  if (source.last_status === "error" || source.last_error) {
    return { label: "Scan failed", tone: "danger", hint: source.last_error || "The last scan could not finish.", needsAttention: true };
  }
  if (source.last_status === "ok") {
    return { label: "Last scan OK", tone: "success", hint: "The previous scan completed successfully.", needsAttention: false };
  }
  if (!source.last_status) return { label: "Not scanned", tone: "muted", hint: "Enabled, but no scan result has been recorded yet.", needsAttention: false };
  return { label: "Status unknown", tone: "muted", hint: `Last reported status: ${source.last_status}.`, needsAttention: false };
}

export function welcomeSortedSources(sources: Source[]) {
  const rank = (source: Source) => welcomeSourceHealth(source).needsAttention ? 0 : source.enabled ? 1 : 2;
  return [...sources].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

export type WelcomeAction = { id: string; title: string; hint: string; href: string; kind: "brief" | "replies" | "sources" | "credits" | "leads" | "campaigns" };

export function welcomeNextActions(input: {
  tenant?: WelcomeTenant;
  stats?: WelcomeStats;
  sources?: Source[];
  leads?: Page<Lead>;
  campaigns?: Campaign[];
  credits?: WelcomeCredits;
}): WelcomeAction[] {
  const actions: WelcomeAction[] = [];
  if (input.stats && input.stats.replies_unread > 0) {
    const count = input.stats.replies_unread;
    actions.push({ id: "replies", kind: "replies", title: `Review ${welcomeNumber(count)} unread ${count === 1 ? "reply" : "replies"}`, hint: "Pick up the conversations already waiting for you.", href: "/replies" });
  }
  if (input.tenant?.onboarding_complete === false) {
    actions.push({ id: "brief", kind: "brief", title: "Define your ideal buyer", hint: "Add your offer and buyer roles so signals are judged against the right brief.", href: "/onboarding" });
  }
  if (input.sources) {
    const issues = input.sources.filter((source) => welcomeSourceHealth(source).needsAttention);
    if (issues.length) {
      actions.push({ id: "sources", kind: "sources", title: `Check ${issues.length} ${issues.length === 1 ? "source" : "sources"} needing attention`, hint: "Review the last scan errors and provider setup before your next scan.", href: "/signals" });
    } else if (!input.sources.some((source) => source.enabled)) {
      actions.push({ id: "sources", kind: "sources", title: "Turn on a signal source", hint: "Choose which public feeds should look for buying moments.", href: "/signals" });
    }
  }
  if (input.credits && input.credits.free_leads_remaining === 0 && input.credits.balance < input.credits.lead_price_credits) {
    actions.push({ id: "credits", kind: "credits", title: "Add credits for your next lead", hint: "Your balance is below the price of one claim. Review credit packs before claiming.", href: "/credits" });
  }
  if (input.leads?.items.some((lead) => lead.status === "new" && lead.fit !== "not_fit")) {
    actions.push({ id: "leads", kind: "leads", title: "Review your recent leads", hint: "Check the evidence and buyer fit, then claim the right people.", href: "/leads" });
  }
  if (input.campaigns?.some((campaign) => campaign.status === "paused")) {
    actions.push({ id: "campaigns", kind: "campaigns", title: "Review paused campaigns", hint: "Check the pause reason and sequence before resuming outreach.", href: "/campaigns" });
  } else if (input.campaigns?.length === 0 && input.leads?.items.some((lead) => lead.status === "claimed")) {
    actions.push({ id: "campaigns", kind: "campaigns", title: "Build your first campaign", hint: "Turn claimed leads into a sequence you can review before sending.", href: "/campaigns" });
  }
  if (!actions.length && input.tenant?.onboarding_complete && input.sources?.some((source) => source.enabled)) {
    actions.push({ id: "sources", kind: "sources", title: "Keep your signals in tune", hint: "Review enabled sources or run a fresh scan when you are ready.", href: "/signals" });
  }
  return actions.slice(0, 3);
}

export function welcomeStatus(status: string) {
  const text = status.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export type WelcomeBuyerForm = { website: string; offer: string; buyers: string; roles: string; targets: string };
export type WelcomeTarget = { company: string; domain: string; country?: string };
export type WelcomeSetupPayload = { website?: string; offer: string; buyers: string[]; roles: string[]; targets: WelcomeTarget[]; discover: false };

export function welcomeBriefFields(icp: Record<string, unknown>) {
  const list = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").join(", ") : "";
  return { offer: typeof icp.offer === "string" ? icp.offer : "", buyers: list(icp.buyers), roles: list(icp.roles) };
}

export function welcomeList(value: string) {
  const seen = new Set<string>();
  return value.split(",").map((item) => item.trim()).filter((item) => {
    if (!item || seen.has(item.toLowerCase())) return false;
    seen.add(item.toLowerCase());
    return true;
  });
}

export function welcomeWebsite(value: string): { url?: string; error?: string } {
  const input = value.trim();
  if (!input) return {};
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `https://${input}`);
    const labels = url.hostname.split(".");
    const validHost = labels.length > 1 && labels.every((label) => /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label)) && !/^\d+$/.test(labels[labels.length - 1]);
    if (!/^https?:$/.test(url.protocol) || !validHost || url.username || url.password) throw new Error("Invalid website");
    return { url: url.href };
  } catch {
    return { error: "Enter a public website, such as https://your-company.com." };
  }
}

function welcomeCsvFields(line: string) {
  const fields: string[] = [];
  let value = "";
  let quoted = false;
  let closed = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index++; }
      else if (quoted) { quoted = false; closed = true; }
      else if (!value.trim() && !closed) { quoted = true; }
      else return null;
    } else if (character === "," && !quoted) {
      fields.push(value.trim()); value = ""; closed = false;
    } else {
      if (closed && character.trim()) return null;
      value += character;
    }
  }
  if (quoted) return null;
  fields.push(value.trim());
  return fields;
}

export function welcomeTargets(text: string): { targets: WelcomeTarget[]; errors: string[]; duplicates: number } {
  const targets: WelcomeTarget[] = [];
  const errors: string[] = [];
  const domains = new Set<string>();
  let duplicates = 0;
  let firstRow = true;
  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    const fields = welcomeCsvFields(line);
    if (firstRow && fields?.[0]?.toLowerCase() === "company" && fields?.[1]?.toLowerCase() === "domain") { firstRow = false; return; }
    firstRow = false;
    if (!fields || fields.length < 2 || fields.length > 3 || !fields[0] || !fields[1]) {
      errors.push(`Line ${index + 1}: use company, domain, and an optional two-letter country.`);
      return;
    }
    const [company, rawDomain, rawCountry] = fields;
    const website = welcomeWebsite(rawDomain);
    if (!website.url) { errors.push(`Line ${index + 1}: enter a valid company domain.`); return; }
    if (rawCountry && !/^[a-z]{2}$/i.test(rawCountry)) { errors.push(`Line ${index + 1}: use a two-letter country code, such as US or GB.`); return; }
    const domain = new URL(website.url).hostname.toLowerCase().replace(/^www\./, "");
    if (domains.has(domain)) { duplicates++; return; }
    domains.add(domain);
    targets.push({ company, domain, ...(rawCountry ? { country: rawCountry.toUpperCase() } : {}) });
  });
  return { targets, errors, duplicates };
}

export function welcomeSetupPayload(form: WelcomeBuyerForm): { payload?: WelcomeSetupPayload; errors: string[] } {
  const website = welcomeWebsite(form.website);
  const targets = welcomeTargets(form.targets);
  const errors = [...(website.error ? [website.error] : []), ...targets.errors];
  if (!form.offer.trim()) errors.unshift("Describe what you sell, or build the brief from your website first.");
  if (errors.length) return { errors };
  return { errors, payload: { website: website.url, offer: form.offer.trim(), buyers: welcomeList(form.buyers), roles: welcomeList(form.roles), targets: targets.targets, discover: false } };
}

/** A scan failure must not make an already-saved buyer setup look unsaved. */
export async function welcomeSaveThenScan(input: {
  payload: WelcomeSetupPayload;
  save: (payload: WelcomeSetupPayload) => Promise<unknown>;
  scan: () => Promise<{ status: string }>;
  scanAfterSave: boolean;
}): Promise<{ scanStatus?: string; scanError?: unknown }> {
  await input.save(input.payload);
  if (!input.scanAfterSave) return {};
  try {
    const result = await input.scan();
    return { scanStatus: result.status };
  } catch (scanError) {
    return { scanError };
  }
}

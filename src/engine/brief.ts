import { callLlm, extractJson } from "../llm.js";
import { config } from "../config.js";
import { updateSettings, getSettings, type Settings } from "../store.js";

const ROLE_KEYWORDS = [
  "security", "appsec", "application security", "ai", "ml", "machine learning", "llm", "genai",
  "compliance", "soc2", "iso 27001", "red team", "penetration", "platform", "engineering",
  "cto", "ciso", "head of engineering", "vp engineering", "product", "devops", "mlops",
];

function stripHtml(html: string): { text: string; title: string; description: string } {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/\s+/g, " ").trim();
  const description = (
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)?.[1] ||
    ""
  ).trim();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return { text, title, description };
}

async function fetchSite(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "epimetheus-leads/0.1 (+local research tool)" },
      redirect: "follow",
    });
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function heuristicBrief(website: string, page: { text: string; title: string; description: string }): Omit<Settings, "account_id" | "target_list" | "brief_complete" | "updated_at"> {
  const hay = `${page.title} ${page.description} ${page.text}`.toLowerCase();
  const roles = ROLE_KEYWORDS.filter((k) => hay.includes(k)).slice(0, 12);
  return {
    website,
    offer: page.description || page.title || `Products and services from ${website}`,
    buyers: [
      "Founders and CTOs shipping AI apps or agents",
      "AI/ML and platform engineering leaders",
      "Security, risk and compliance leads at AI product companies",
    ],
    roles: roles.length ? roles : ["security", "ai", "engineering", "compliance"],
    region: "Global (English-speaking)",
    exclusions: [],
    sources: [],
  };
}

export async function generateBrief(accountId: number, website: string): Promise<{ settings: Settings; source: "llm" | "heuristic"; note?: string }> {
  const url = website.startsWith("http") ? website : `https://${website}`;
  let page = { text: "", title: "", description: "" };
  try {
    const html = await fetchSite(url);
    page = stripHtml(html);
  } catch (err) {
    return {
      settings: getSettings(accountId),
      source: "heuristic",
      note: `Could not fetch ${url}: ${(err as Error).message}. Set the brief manually in the dashboard.`,
    };
  }

  const fallback = heuristicBrief(url, page);
  if (!config.llm.enabled) {
    const settings = updateSettings(accountId, { ...fallback, brief_complete: true });
    return { settings, source: "heuristic", note: "LLM not configured; used heuristic brief. Edit it in the dashboard." };
  }

  const prompt = `You are an ICP (ideal customer profile) analyst. Read this company's website and produce a concise B2B outbound brief.
Return STRICT JSON with keys: offer (one sentence), buyers (array of 2-5 buyer personas), roles (array of job-title keywords that indicate a buyer or user of this offer), region (string), exclusions (array of companies/types to exclude).
Only use what the page supports; if unsure, keep it general.

URL: ${url}
TITLE: ${page.title}
DESCRIPTION: ${page.description}
PAGE TEXT (trimmed): ${page.text.slice(0, 6000)}`;

  const res = await callLlm(
    [
      { role: "system", content: "You output only valid JSON. No prose." },
      { role: "user", content: prompt },
    ],
    { json: true, maxTokens: 700 }
  );

  if (res.ok) {
    const parsed = extractJson<{ offer?: string; buyers?: string[]; roles?: string[]; region?: string; exclusions?: string[] }>(res.text);
    if (parsed) {
      const settings = updateSettings(accountId, {
        website: url,
        offer: parsed.offer || fallback.offer,
        buyers: Array.isArray(parsed.buyers) && parsed.buyers.length ? parsed.buyers.map(String) : fallback.buyers,
        roles: Array.isArray(parsed.roles) && parsed.roles.length ? parsed.roles.map(String) : fallback.roles,
        region: parsed.region || fallback.region,
        exclusions: Array.isArray(parsed.exclusions) ? parsed.exclusions.map(String) : fallback.exclusions,
        brief_complete: true,
      });
      return { settings, source: "llm" };
    }
  }

  const settings = updateSettings(accountId, { ...fallback, brief_complete: true });
  return { settings, source: "heuristic", note: res.error || "LLM returned no usable JSON; used heuristic brief." };
}

import { fetchJson, isoDateFromUnix, sleep } from "../util.js";
import type { Source, SourceContext, SourceResult, RawSignal } from "./types.js";

const SWITCH = /(recommend|alternative|switch(ing)?|replace|migrat|looking for|instead of)/i;
const PROBLEM = /(problem|issue|security|breach|vulnerab|compliance|soc ?2|incident|outage|leak|prompt injection|red ?team|attack|exploit)/i;
function classify(text: string): "switching_intent" | "problem_post" | null {
  if (SWITCH.test(text)) return "switching_intent";
  if (PROBLEM.test(text)) return "problem_post";
  return null;
}

// ---- X (Twitter) ----
interface XResp {
  data?: Array<{ id: string; text: string; created_at?: string; author_id?: string }>;
}

export async function runX(ctx: SourceContext): Promise<SourceResult> {
  const token = process.env.X_BEARER_TOKEN;
  const base = { source: "x", label: "X / Twitter posts" };
  if (!token) return { ...base, enabled: false, ok: true, candidates: [], note: "Set X_BEARER_TOKEN to enable." };
  const candidates: RawSignal[] = [];
  const errors: string[] = [];
  for (const t of ctx.targets.slice(0, Math.min(ctx.limit, 15))) {
    try {
      const q = `"${t.company}" (security OR breach OR compliance OR switch OR recommend OR problem) -is:retweet lang:en`;
      const url = `https://api.x.com/2/tweets/search/recent?query=${encodeURIComponent(q)}&max_results=25&tweet.fields=created_at,author_id`;
      const data = await fetchJson<XResp>(url, { headers: { Authorization: `Bearer ${token}` } });
      for (const tw of data.data || []) {
        const signal = classify(tw.text);
        if (!signal) continue;
        candidates.push({
          company: t.company,
          domain: t.domain,
          signal,
          date: (tw.created_at || new Date().toISOString()).slice(0, 10),
          source: "x",
          source_url: `https://x.com/i/web/status/${tw.id}`,
          summary: tw.text.slice(0, 180),
        });
      }
    } catch (err) {
      errors.push(`${t.domain}: ${(err as Error).message}`);
    }
    await sleep(800);
  }
  return { ...base, enabled: true, ok: errors.length < ctx.targets.length, candidates, error: errors.slice(0, 4).join("; ") || undefined };
}

export const xSource: Source = {
  name: "x",
  label: "X / Twitter posts",
  requires: "X_BEARER_TOKEN (X API v2)",
  enabled: () => Boolean(process.env.X_BEARER_TOKEN),
  run: runX,
};

// ---- Google Maps / Places ----
interface PlacesResp {
  places?: Array<{ displayName?: { text?: string }; websiteUri?: string; formattedAddress?: string; userRatingCount?: number }>;
}

export async function runMaps(ctx: SourceContext): Promise<SourceResult> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  const query = process.env.MAPS_QUERY;
  const base = { source: "maps", label: "Google Maps businesses" };
  if (!key || !query) {
    return { ...base, enabled: false, ok: true, candidates: [], note: "Set GOOGLE_MAPS_API_KEY and MAPS_QUERY (e.g. 'AI startups, Berlin')." };
  }
  try {
    const data = await fetchJson<PlacesResp>("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "places.displayName,places.websiteUri,places.formattedAddress,places.userRatingCount",
      },
      body: JSON.stringify({ textQuery: query, pageSize: 20 }),
    });
    const candidates: RawSignal[] = [];
    for (const place of data.places || []) {
      const name = place.displayName?.text || "";
      const target = ctx.targets.find((t) => name.toLowerCase().includes(t.company.toLowerCase()));
      if (!target) continue;
      candidates.push({
        company: target.company,
        domain: target.domain,
        signal: "local_business",
        date: new Date().toISOString().slice(0, 10),
        source: "maps",
        summary: `Listed on Google Maps: ${name}${place.formattedAddress ? " — " + place.formattedAddress : ""}`,
        detail: { rating_count: place.userRatingCount },
      });
    }
    return { ...base, enabled: true, ok: true, candidates, note: candidates.length ? undefined : "No Places results matched your target list." };
  } catch (err) {
    return { ...base, enabled: true, ok: false, candidates: [], error: (err as Error).message };
  }
}

export const mapsSource: Source = {
  name: "maps",
  label: "Google Maps businesses",
  requires: "GOOGLE_MAPS_API_KEY + MAPS_QUERY",
  enabled: () => Boolean(process.env.GOOGLE_MAPS_API_KEY && process.env.MAPS_QUERY),
  run: runMaps,
};

// ---- Facebook (Graph API page monitoring hook) ----
export async function runFacebook(ctx: SourceContext): Promise<SourceResult> {
  const token = process.env.FB_ACCESS_TOKEN;
  const pages = (process.env.FB_PAGE_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const base = { source: "facebook", label: "Facebook pages" };
  if (!token || !pages.length) {
    return { ...base, enabled: false, ok: true, candidates: [], note: "Set FB_ACCESS_TOKEN and FB_PAGE_IDS to enable page monitoring." };
  }
  const candidates: RawSignal[] = [];
  for (const pageId of pages) {
    try {
      const url = `https://graph.facebook.com/v20.0/${pageId}/posts?fields=message,created_time,permalink_url&limit=25&access_token=${encodeURIComponent(token)}`;
      const data = await fetchJson<{ data?: Array<{ message?: string; created_time?: string; permalink_url?: string }> }>(url);
      for (const post of data.data || []) {
        const text = post.message || "";
        const target = ctx.targets.find((t) => text.toLowerCase().includes(t.company.toLowerCase()));
        if (!target) continue;
        const signal = classify(text);
        if (!signal) continue;
        candidates.push({
          company: target.company,
          domain: target.domain,
          signal,
          date: (post.created_time || new Date().toISOString()).slice(0, 10),
          source: "facebook",
          source_url: post.permalink_url,
          summary: text.slice(0, 180),
        });
      }
    } catch {
      /* best-effort */
    }
  }
  return { ...base, enabled: true, ok: true, candidates };
}

export const facebookSource: Source = {
  name: "facebook",
  label: "Facebook pages",
  requires: "FB_ACCESS_TOKEN + FB_PAGE_IDS",
  enabled: () => Boolean(process.env.FB_ACCESS_TOKEN && process.env.FB_PAGE_IDS),
  run: runFacebook,
};

// ---- Reviews (generic feed hook) ----
interface ReviewItem {
  company: string;
  domain: string;
  date: string;
  rating?: number;
  url?: string;
  summary?: string;
}

export async function runReviews(ctx: SourceContext): Promise<SourceResult> {
  const feed = process.env.REVIEWS_FEED_URL;
  const base = { source: "reviews", label: "Review sites" };
  if (!feed) return { ...base, enabled: false, ok: true, candidates: [], note: "Set REVIEWS_FEED_URL to a JSON feed of {company,domain,date,rating,url,summary}." };
  try {
    const items = await fetchJson<ReviewItem[]>(feed);
    const candidates: RawSignal[] = [];
    for (const item of Array.isArray(items) ? items : []) {
      if (typeof item.rating === "number" && item.rating > 3) continue;
      const target = ctx.targets.find((t) => t.domain === item.domain || t.company.toLowerCase() === (item.company || "").toLowerCase());
      if (!target) continue;
      candidates.push({
        company: target.company,
        domain: target.domain,
        signal: "review_signal",
        date: item.date,
        source: "reviews",
        source_url: item.url,
        summary: item.summary || `Low review (${item.rating ?? "?"}/5)`,
      });
    }
    return { ...base, enabled: true, ok: true, candidates };
  } catch (err) {
    return { ...base, enabled: true, ok: false, candidates: [], error: (err as Error).message };
  }
}

export const reviewsSource: Source = {
  name: "reviews",
  label: "Review sites",
  requires: "REVIEWS_FEED_URL (JSON)",
  enabled: () => Boolean(process.env.REVIEWS_FEED_URL),
  run: runReviews,
};

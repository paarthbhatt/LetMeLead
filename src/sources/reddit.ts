import { fetchJson, isoDateFromUnix, sleep } from "../util.js";
import type { Source, SourceContext, SourceResult, RawSignal } from "./types.js";

interface RedditPost {
  title: string;
  selftext?: string;
  permalink: string;
  created_utc: number;
  subreddit: string;
  author?: string;
}

interface RedditListing {
  data: { children: Array<{ data: RedditPost }> };
}

const SWITCH = /(recommend|alternative|alternatives|switch(ing)?|replace|migrat|looking for|anyone using|instead of|vs\.?\b)/i;
const PROBLEM = /(problem|issue|broken|struggling|frustrat|hate|security|breach|vulnerab|compliance|soc ?2|incident|outage|leak|prompt injection|red ?team|attack|exploit)/i;

function classify(text: string): "switching_intent" | "problem_post" | null {
  if (SWITCH.test(text)) return "switching_intent";
  if (PROBLEM.test(text)) return "problem_post";
  return null;
}

async function searchReddit(company: string): Promise<RedditPost[]> {
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(`"${company}"`)}&sort=new&t=month&limit=25&raw_json=1`;
  const data = await fetchJson<RedditListing>(url);
  return (data?.data?.children || []).map((c) => c.data);
}

export async function runReddit(ctx: SourceContext): Promise<SourceResult> {
  const targets = ctx.targets.slice(0, Math.min(ctx.limit, 25));
  const candidates: RawSignal[] = [];
  const errors: string[] = [];

  for (const t of targets) {
    try {
      const posts = await searchReddit(t.company);
      const needle = t.company.toLowerCase().split(/\s+/)[0];
      for (const p of posts) {
        const text = `${p.title} ${p.selftext || ""}`;
        if (!text.toLowerCase().includes(needle)) continue;
        const signal = classify(text);
        if (!signal) continue;
        candidates.push({
          company: t.company,
          domain: t.domain,
          signal,
          date: isoDateFromUnix(p.created_utc),
          source: "reddit",
          source_url: `https://www.reddit.com${p.permalink}`,
          summary: p.title.slice(0, 180),
          detail: { subreddit: p.subreddit, author: p.author },
        });
      }
    } catch (err) {
      errors.push(`${t.domain}: ${(err as Error).message}`);
    }
    await sleep(1200);
  }

  return {
    source: "reddit",
    label: "Reddit discussions",
    enabled: true,
    ok: errors.length < targets.length,
    candidates,
    error: errors.length ? errors.slice(0, 5).join("; ") : undefined,
    note: errors.length === targets.length ? "Reddit blocked or rate-limited the requests." : undefined,
  };
}

export const redditSource: Source = {
  name: "reddit",
  label: "Reddit discussions",
  requires: "Public Reddit search (best-effort, rate-limited)",
  enabled: () => true,
  run: runReddit,
};

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.js";
import { cleanDomain } from "./util.js";
import type { Settings } from "./store.js";
import type { Target } from "./sources/types.js";

export type { Target };

export function loadTargets(settings: Settings, explicit?: Target[]): Target[] {
  if (explicit && explicit.length) {
    return explicit
      .filter((t) => t && t.company && t.domain)
      .map((t) => ({ ...t, domain: cleanDomain(t.domain) }));
  }
  const paths: string[] = [];
  if (settings.target_list) paths.push(settings.target_list);
  paths.push(join(config.paths.data, "targets.csv"));
  for (const p of paths) {
    if (!existsSync(p)) continue;
    const raw = readFileSync(p, "utf8").trim();
    if (!raw) continue;
    if (p.endsWith(".json")) {
      const arr = JSON.parse(raw) as Target[];
      return arr.filter((t) => t.company && t.domain).map((t) => ({ ...t, domain: cleanDomain(t.domain) }));
    }
    const lines = raw.split(/\r?\n/).filter(Boolean);
    const header = lines[0].toLowerCase().includes("domain") ? lines.shift()!.split(",").map((h) => h.trim().toLowerCase()) : null;
    return lines
      .map((line) => {
        const cells = line.split(",").map((c) => c.trim());
        if (header) {
          const rec: Record<string, string> = {};
          header.forEach((h, i) => (rec[h] = cells[i] || ""));
          return {
            company: rec.company || rec.name || "",
            domain: cleanDomain(rec.domain || ""),
            country: rec.country,
            employer: rec.employer,
            news_query: rec.news_query,
            careers_url: rec.careers_url,
          } as Target;
        }
        return { company: cells[0] || "", domain: cleanDomain(cells[1] || ""), country: cells[2] } as Target;
      })
      .filter((t) => t.company && t.domain);
  }
  return [];
}

export function isExcluded(settings: Settings, target: Target): boolean {
  const ownDomain = cleanDomain(settings.website || "");
  if (ownDomain && target.domain === ownDomain) return true;
  const hay = `${target.company} ${target.domain}`.toLowerCase();
  return settings.exclusions.some((ex) => ex && hay.includes(ex.toLowerCase()));
}

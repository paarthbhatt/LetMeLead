import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { config } from "../config.js";
import { cleanDomain, csvCell } from "../util.js";
import type { Source, SourceContext, SourceResult, RawSignal } from "./types.js";

const execFileAsync = promisify(execFile);

interface ScanCandidate {
  id: string;
  company: string;
  domain: string;
  signal: string;
  date: string;
  source_url?: string;
  summary?: string;
  detail?: Record<string, unknown>;
}

export async function runPublicScan(ctx: SourceContext): Promise<SourceResult> {
  const targets = ctx.targets;
  if (!targets.length) {
    return { source: "public_scan", label: "Job boards, news & tech", enabled: true, ok: true, candidates: [], note: "No targets." };
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = join(config.paths.runs, `scan-${stamp}`);
  mkdirSync(join(runDir, "state"), { recursive: true });
  const csvPath = join(runDir, "companies.csv");
  const header = "company,domain,country,employer,news_query,careers_url\n";
  const body = targets
    .map((t) => [t.company, t.domain, t.country || "US", t.employer, t.news_query, t.careers_url].map(csvCell).join(","))
    .join("\n");
  writeFileSync(csvPath, header + body + "\n", "utf8");

  const roles = ctx.roles.join(",");
  const scanScript = join(config.paths.vendorScan, "scan.py");
  const args = [scanScript, "--companies", csvPath, "--out-dir", runDir, "--roles", roles, "--pause", "0.4"];

  try {
    await execFileAsync(process.env.PYTHON || "python", args, {
      cwd: config.paths.vendorScan,
      timeout: 10 * 60 * 1000,
      maxBuffer: 20 * 1024 * 1024,
      env: { ...process.env },
    });
  } catch (err) {
    const e = err as { stderr?: string; message?: string };
    return {
      source: "public_scan",
      label: "Job boards, news & tech",
      enabled: true,
      ok: false,
      candidates: [],
      error: (e.stderr || e.message || "scan failed").split(/\r?\n/).slice(-8).join("\n"),
    };
  }

  const candPath = join(runDir, "candidates.jsonl");
  const candidates: RawSignal[] = existsSync(candPath)
    ? readFileSync(candPath, "utf8")
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => {
          const c = JSON.parse(line) as ScanCandidate;
          return {
            company: c.company,
            domain: cleanDomain(c.domain),
            signal: c.signal,
            date: c.date,
            source: "public_scan",
            source_url: c.source_url,
            summary: c.summary || c.signal,
            detail: c.detail,
          } satisfies RawSignal;
        })
    : [];

  return { source: "public_scan", label: "Job boards, news & tech", enabled: true, ok: true, candidates };
}

export const publicScanSource: Source = {
  name: "public_scan",
  label: "Job boards, news & tech",
  requires: "Python 3.9+ (stdlib only)",
  enabled: () => true,
  run: runPublicScan,
};

import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

function loadDotEnv(): void {
  const candidates = [resolve(process.cwd(), ".env")];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
}

loadDotEnv();

export const config = {
  port: Number(process.env.PORT || 8787),
  dbPath: resolve(process.cwd(), process.env.DB_PATH || "./data/leads.db"),
  localMcpKey: process.env.LOCAL_MCP_KEY || "",
  llm: {
    baseUrl: process.env.LLM_BASE_URL || "",
    apiKey: process.env.LLM_API_KEY || "",
    model: process.env.LLM_MODEL || "",
    get enabled() {
      return Boolean(this.baseUrl && this.model);
    },
  },
  providers: {
    predictleads: Boolean(process.env.PREDICTLEADS_API_KEY && process.env.PREDICTLEADS_API_TOKEN),
    firecrawl: Boolean(process.env.FIRECRAWL_API_KEY),
    apify: Boolean(process.env.APIFY_TOKEN),
  },
  enrich: {
    provider: process.env.ENRICH_PROVIDER || "",
    apiKey: process.env.ENRICH_API_KEY || "",
  },
  paths: {
    projectRoot: resolve(process.cwd()),
    vendorScan: resolve(process.cwd(), "vendor/buying-signal-scan/scripts"),
    runs: resolve(process.cwd(), "runs"),
    data: resolve(process.cwd(), "data"),
  },
};

export function ensureDirs(): void {
  for (const dir of [dirname(config.dbPath), config.paths.runs, config.paths.data]) {
    mkdirSync(dir, { recursive: true });
  }
}

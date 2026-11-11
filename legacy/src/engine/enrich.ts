import { config } from "../config.js";
import type { Settings } from "../store.js";

export interface EnrichResult {
  linkedin: string | null;
  email: string | null;
  phone: string | null;
  note: string;
}

export async function enrichLead(settings: Settings, company: string, domain: string, signalLabel: string): Promise<EnrichResult> {
  if (config.enrich.provider && config.enrich.apiKey) {
    // Provider hook: wire a real enrichment API here (Apollo, Clearbit, Proxycurl, etc.).
    return {
      linkedin: null,
      email: null,
      phone: null,
      note: `Enrichment provider "${config.enrich.provider}" is configured but no adapter is wired yet.`,
    };
  }
  const role = settings.roles[0] || "founder";
  const q = encodeURIComponent(`${company} ${role}`.trim());
  return {
    linkedin: `https://www.linkedin.com/search/results/people/?keywords=${q}`,
    email: null,
    phone: null,
    note: `LinkedIn search link for "${company} ${role}". Set ENRICH_PROVIDER + ENRICH_API_KEY for exact profiles, email and phone. Signal: ${signalLabel}`,
  };
}

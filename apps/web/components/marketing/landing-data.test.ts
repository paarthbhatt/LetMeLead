import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { DEMO_AUDIENCES, SAMPLE_DISCLOSURE, SAMPLE_DOSSIERS } from "./landing-data";

describe("landing sample data", () => {
  it("has exactly the three complete audience dossiers", () => {
    expect(DEMO_AUDIENCES.map((audience) => audience.id)).toEqual(["security", "revenue", "agency"]);
    expect(Object.keys(SAMPLE_DOSSIERS)).toEqual(["security", "revenue", "agency"]);
    for (const { id } of DEMO_AUDIENCES) {
      const dossier = SAMPLE_DOSSIERS[id];
      expect(dossier.audience).toBe(id);
      expect(dossier.brief.length).toBeGreaterThan(30);
      expect(dossier.offer).toBeTruthy();
      expect(dossier.signal.description).toContain("sample");
      expect(dossier.fit.length).toBeGreaterThan(0);
      expect(dossier.contact.caveat).toContain("unverified");
      expect(dossier.uncertainty).toBeTruthy();
      expect(dossier.draft.subject).toBeTruthy();
      expect(dossier.draft.body).toContain(dossier.company.name);
      expect(dossier.draft.body).toContain(`Hi ${dossier.contact.name.split(" ")[0]},`);
    }
  });

  it("labels the sample honestly and uses only reserved example domains", () => {
    expect(SAMPLE_DISCLOSURE).toMatch(/companies, people, dates and evidence here are invented/);
    expect(SAMPLE_DISCLOSURE).toMatch(/illustrative sample, not live research/);
    expect(SAMPLE_DISCLOSURE).toMatch(/unverified.*nothing is sent/);
    for (const dossier of Object.values(SAMPLE_DOSSIERS)) {
      expect(dossier.company.domain).toMatch(/\.example$/);
      expect(dossier.contact.email).toMatch(/@[^@]+\.example$/);
      expect(dossier.contact.email.split("@")[1]).toBe(dossier.company.domain);
      for (const evidence of dossier.evidence) {
        expect(evidence.kind).toMatch(/^Sample /);
        expect(new URL(evidence.sourceUrl).hostname).toBe(dossier.company.domain);
      }
    }
  });

  it("keeps signal dates fixed and ties every inference to matching sample evidence", () => {
    for (const dossier of Object.values(SAMPLE_DOSSIERS)) {
      const evidenceIds = dossier.evidence.map((evidence) => evidence.id);
      expect(new Set(evidenceIds).size).toBe(evidenceIds.length);
      const signalEvidence = dossier.evidence.find((evidence) => evidence.id === dossier.signal.evidenceId);
      expect(signalEvidence).toBeTruthy();
      expect(signalEvidence!.publishedOn).toBe(dossier.signal.publishedOn);
      expect(signalEvidence!.publishedLabel).toBe(dossier.signal.publishedLabel);
      for (const reason of dossier.fit) expect(evidenceIds).toContain(reason.evidenceId);
      for (const evidence of dossier.evidence) {
        expect(evidence.publishedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(new Date(evidence.publishedOn).toISOString().slice(0, 10)).toBe(evidence.publishedOn);
        expect(evidence.excerpt).toBeTruthy();
        expect(evidence.supports).toBeTruthy();
      }
    }
  });

  it("does not depend on live APIs, messaging services or current-time research claims", () => {
    const source = readFileSync(resolve(__dirname, "landing-data.ts"), "utf8");
    expect(source).not.toMatch(/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(/);
    expect(source).not.toMatch(/\bimport\s/);
    expect(source).not.toMatch(/Date\.(?:now|parse)|new Date|\b(?:verified|live)\s*:\s*true/);
    expect(JSON.stringify(SAMPLE_DOSSIERS)).not.toMatch(/\b\d+(?:\.\d+)?\s*%|\b(?:ARR|MRR|customers won|conversion rate)\b/i);
  });
});

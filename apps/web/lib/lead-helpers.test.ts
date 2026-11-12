import { describe, expect, it } from "vitest";

import type { Evidence, Lead } from "./api";
import {
  canClaimLead,
  claimQuote,
  companyWebsite,
  confidenceLabel,
  emailHref,
  isDraftEligible,
  leadContactSummary,
  leadsToCsv,
  notFitReasonError,
  qualificationLimitations,
  reviewLeadSelection,
  safeCsvCell,
  safeExternalUrl,
  scoreLabel,
  sortEvidence,
  sortLeads,
  toggleLeadSelection,
  togglePageSelection,
  validateTargetCsv,
} from "./lead-helpers";

const makeLead = (overrides: Partial<Lead> = {}): Lead => ({
  id: "lead-1", company: "Acme", domain: "acme.com", reason: "Hiring a growth team",
  signal_at: "2026-11-01T12:00:00Z", signal_age_days: 10, score: 4, fit: "fit",
  fit_confidence: 0.8, fit_reason: null, verification_status: "verified", status: "new",
  linkedin_url: null, email: null, claimed_at: null, created_at: "2026-11-01T12:00:00Z", contact: null,
  ...overrides,
});

describe("lead ordering", () => {
  it("sorts strongest first with newest as a tie-break, without mutating the page", () => {
    const leads = [
      makeLead({ id: "old", score: 2 }),
      makeLead({ id: "strong", score: 5 }),
      makeLead({ id: "recent", score: 2, created_at: "2026-11-10T12:00:00Z" }),
    ];
    expect(sortLeads(leads, "strongest").map((lead) => lead.id)).toEqual(["strong", "recent", "old"]);
    expect(leads.map((lead) => lead.id)).toEqual(["old", "strong", "recent"]);
    expect(sortLeads(leads, "newest")[0].id).toBe("recent");
  });

  it("puts missing or invalid evidence dates last", () => {
    const evidence = [
      { id: "undated", published_at: null, points: 10 },
      { id: "bad", published_at: "invalid", points: 1 },
      { id: "dated", published_at: "2026-11-10T12:00:00Z", points: 2 },
    ] as Evidence[];
    expect(sortEvidence(evidence).map((item) => item.id)).toEqual(["dated", "undated", "bad"]);
    expect(evidence[0].id).toBe("undated");
  });

  it("handles unknown scores and clamps confidence instead of inventing a percentage", () => {
    expect(scoreLabel(NaN)).toBe("—");
    expect(scoreLabel(3.25)).toBe("3.3");
    expect(confidenceLabel(NaN)).toBe("Not scored");
    expect(confidenceLabel(2)).toBe("100%");
    expect(confidenceLabel(-0.2)).toBe("0%");
  });
});

describe("selection and outreach safety", () => {
  it("toggles one row and the current page without duplicates", () => {
    expect(toggleLeadSelection(["a"], "a")).toEqual([]);
    expect(toggleLeadSelection(["a"], "b")).toEqual(["a", "b"]);
    expect(togglePageSelection(["a"], ["a", "b"])).toEqual(["a", "b"]);
    expect(togglePageSelection(["a", "b", "other"], ["a", "b"])).toEqual(["other"]);
    expect(togglePageSelection(["a"], [])).toEqual(["a"]);
  });

  it("includes only claimed leads, never new or previously contacted leads", () => {
    const claimed = makeLead({ id: "claimed", status: "claimed", claimed_at: "2026-11-02" });
    const selected = [
      makeLead(), claimed, claimed,
      makeLead({ id: "contacted", status: "contacted", claimed_at: "2026-11-02" }),
      makeLead({ id: "replied", status: "replied" }),
      makeLead({ id: "rejected", status: "claimed", fit: "not_fit" }),
    ];
    const review = reviewLeadSelection(selected);
    expect(review.eligible.map((lead) => lead.id)).toEqual(["claimed"]);
    expect(review.excluded).toHaveLength(4);
    expect(review.excluded[0].reason).toBe("Claim first — excluded");
    expect(isDraftEligible(makeLead({ status: "CLAIMED" }))).toBe(true);
    expect(isDraftEligible(makeLead({ status: "archived" }))).toBe(false);
  });

  it("does not offer another claim for a rejected or already claimed lead", () => {
    expect(canClaimLead(makeLead())).toBe(true);
    expect(canClaimLead(makeLead({ fit: "not_fit" }))).toBe(false);
    expect(canClaimLead(makeLead({ claimed_at: "2026-11-02" }))).toBe(false);
    expect(canClaimLead(makeLead({ status: "claimed" }))).toBe(false);
  });

  it("quotes free and paid claims and checks the available balance", () => {
    expect(claimQuote({ balance: 0, free_leads_remaining: 1, lead_price_credits: 2 }))
      .toEqual({ credits: 0, free: true, canAfford: true });
    expect(claimQuote({ balance: 1, free_leads_remaining: 0, lead_price_credits: 2 }))
      .toEqual({ credits: 2, free: false, canAfford: false });
    expect(claimQuote({ balance: 2, free_leads_remaining: 0, lead_price_credits: 2 })?.canAfford).toBe(true);
    expect(claimQuote({ balance: NaN, free_leads_remaining: 0, lead_price_credits: 1 })).toBeNull();
  });

  it("requires a real reason and bounds feedback to the API limit", () => {
    expect(notFitReasonError(" \n ")).toBeTruthy();
    expect(notFitReasonError(" Outside our ICP ")).toBeNull();
    expect(notFitReasonError("x".repeat(501))).toBeTruthy();
    expect(qualificationLimitations({ limitations: ["Public evidence only", null, 2, ""] }))
      .toEqual(["Public evidence only"]);
  });
});

describe("contact and source links", () => {
  it("only links to http(s) sources without credentials or control characters", () => {
    expect(safeExternalUrl("https://example.com/source")).toBe("https://example.com/source");
    for (const url of ["javascript:alert(1)", "data:text/html,test", "https://user:pass@example.com", "https://exa\nmple.com", "/relative"]) {
      expect(safeExternalUrl(url)).toBeNull();
    }
    expect(companyWebsite("acme.com")).toBe("https://acme.com/");
    expect(companyWebsite("javascript:alert(1)")).toBeNull();
    expect(companyWebsite("not a domain")).toBeNull();
    expect(emailHref("hello@example.com")).toBe("mailto:hello@example.com");
    expect(emailHref("hello@example.com\r\nBcc:other@example.com")).toBeNull();
  });

  it("uses a provided role or company channel rather than inventing a name", () => {
    const role = leadContactSummary(makeLead({ contact: { name: null, title: "VP Sales", linkedin_url: null } }));
    expect(role.label).toBe("VP Sales");
    expect(role.detail).toBe("Name not stated in source");
    expect(role.named).toBe(false);
    expect(leadContactSummary(makeLead({ email: "hello@acme.com" })).label).toBe("hello@acme.com");
    expect(leadContactSummary(makeLead()).label).toBe("No named contact yet");
  });

  it("prefers the contact's public profile over the lead-level LinkedIn URL", () => {
    const summary = leadContactSummary(makeLead({
      linkedin_url: "https://linkedin.com/company/acme",
      contact: { name: "Alex", title: null, linkedin_url: "https://linkedin.com/in/alex" },
    }));
    expect(summary.linkedinUrl).toBe("https://linkedin.com/in/alex");
    expect(summary.detail).toBe("Role not provided");
  });

  it("keeps an email returned with the contact summary and links email labels to email", () => {
    const contact = { name: null, title: null, linkedin_url: "https://linkedin.com/in/alex", email: "alex@acme.com" };
    const lead = makeLead({ contact, email: "hello@acme.com" });
    const summary = leadContactSummary(lead);
    expect(summary.email).toBe("alex@acme.com");
    expect(summary.label).toBe("alex@acme.com");
    expect(summary.href).toBe("mailto:alex@acme.com");
    expect(leadsToCsv([lead])).toContain('"alex@acme.com"');
    const invalidContact = { ...contact, email: "invalid" };
    expect(leadContactSummary(makeLead({ contact: invalidContact, email: "hello@acme.com" })).email).toBe("hello@acme.com");
  });
});

describe("spreadsheet-safe lead export", () => {
  it.each(["=1+1", "+SUM(A1)", "-1+1", "@SUM(A1)", "  =1+1", "\t=1+1", "\r=1+1", "\n=1+1", "\ufeff=1+1"])("neutralizes formula-like cell %j", (value) => {
    expect(safeCsvCell(value)).toBe(`"'${value}"`);
  });

  it("quotes commas, line breaks and quotes and preserves ordinary text", () => {
    expect(safeCsvCell('Acme, "Inc"\nNorth')).toBe('"Acme, ""Inc""\nNorth"');
    expect(safeCsvCell(null)).toBe('""');
    expect(safeCsvCell("Normal company")).toBe('"Normal company"');
  });

  it("exports exactly the supplied scope and uses the contact profile fallback", () => {
    const csv = leadsToCsv([makeLead({
      company: "=HYPERLINK(1)",
      contact: { name: 'Alex "A"', title: null, linkedin_url: "https://linkedin.com/in/alex" },
    })]);
    expect(csv).toContain('"\'=HYPERLINK(1)"');
    expect(csv).toContain('"Alex ""A"""');
    expect(csv).toContain('"https://linkedin.com/in/alex"');
    expect(csv.split("\r\n")).toHaveLength(2);
    expect(leadsToCsv([]).split("\r\n")).toHaveLength(1);
  });
});

describe("explicit target CSV import", () => {
  it("requires a header and at least one valid company/domain target", () => {
    expect(() => validateTargetCsv("Acme,acme.com")).toThrow("header");
    expect(() => validateTargetCsv("company,domain")).toThrow("at least one");
    expect(() => validateTargetCsv("company,domain\nAcme,")).toThrow("valid company domain");
    expect(() => validateTargetCsv("company,domain\n,acme.com")).toThrow("company name");
    expect(() => validateTargetCsv("company,domain\nAcme,acme.com,extra")).toThrow("number of fields");
  });

  it("normalizes BOM and header case while respecting quoted commas and escaped quotes", () => {
    const preview = validateTargetCsv('\ufeffCompany, Domain,country\r\n"Acme, ""Inc""",acme.com,US\r\n');
    expect(preview.rowCount).toBe(1);
    expect(preview.csv).toBe('"company","domain","country"\r\n"Acme, ""Inc""","acme.com","US"');
  });

  it("supports quoted multiline fields and ignores blank records", () => {
    expect(validateTargetCsv('company,domain\n\n"Acme\nNorth",acme.com\n').rowCount).toBe(1);
    expect(() => validateTargetCsv('company,domain\n"Acme,acme.com')).toThrow("closing quotation");
  });

  it("rejects duplicate headers, lead-only columns and oversized URL payloads", () => {
    expect(() => validateTargetCsv("company,domain,company\nA,a.com,A")).toThrow("unique header");
    expect(() => validateTargetCsv("company,domain,email\nA,a.com,a@a.com")).toThrow("target columns only");
    expect(() => validateTargetCsv(`company,domain\n${"A".repeat(6_000)},acme.com`)).toThrow("too large");
  });
});

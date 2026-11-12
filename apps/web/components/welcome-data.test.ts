import { describe, expect, it, vi } from "vitest";

import type { Lead, Source } from "@/lib/api";
import { welcomeBriefFields, welcomeDate, welcomeList, welcomeNextActions, welcomeNumber, welcomeSaveThenScan, welcomeSetupPayload, welcomeSortedSources, welcomeSourceHealth, welcomeTargets, welcomeWebsite, type WelcomeBuyerForm, type WelcomeCredits, type WelcomeSetupPayload, type WelcomeTenant } from "./welcome-data";

const source = (overrides: Partial<Source> = {}): Source => ({
  id: "news", kind: "news", name: "Company news", enabled: true, config: {}, daily_quota: 100,
  last_run_at: null, last_status: null, last_error: null, ...overrides,
});
const tenant = (onboarding_complete: boolean): WelcomeTenant => ({ id: "tenant", name: "Workspace", website: null, icp: {}, onboarding_complete });
const credits = (overrides: Partial<WelcomeCredits> = {}): WelcomeCredits => ({ balance: 0, free_leads_used: 10, free_leads_remaining: 0, lead_price_credits: 2, spend_report: { credits_spent: 0, credits_purchased: 0 }, ...overrides });
const form = (overrides: Partial<WelcomeBuyerForm> = {}): WelcomeBuyerForm => ({ website: "", offer: "A useful product", buyers: "VP Sales", roles: "", targets: "", ...overrides });
const payload: WelcomeSetupPayload = { offer: "A useful product", buyers: ["VP Sales"], roles: [], targets: [], discover: false };

describe("honest overview data", () => {
  it("distinguishes missing counts from real zeroes", () => {
    expect(welcomeNumber(undefined)).toBe("—");
    expect(welcomeNumber(NaN)).toBe("—");
    expect(welcomeNumber(-1)).toBe("—");
    expect(welcomeNumber(0)).toBe("0");
    expect(welcomeNumber(1250)).toBe("1,250");
  });

  it("formats recorded dates consistently and never invents a missing date", () => {
    expect(welcomeDate(null)).toBe("Not dated");
    expect(welcomeDate("bad-date")).toBe("Not dated");
    expect(welcomeDate("2026-11-11T23:30:00-02:00")).toBe("Nov 12, 2026");
  });

  it("does not call unscanned or unknown sources healthy", () => {
    expect(welcomeSourceHealth(source()).label).toBe("Not scanned");
    expect(welcomeSourceHealth(source({ last_status: "mystery" })).label).toBe("Status unknown");
    expect(welcomeSourceHealth(source({ last_status: "ok" })).label).toBe("Last scan OK");
    expect(welcomeSourceHealth(source({ last_status: "ok" })).hint).toContain("previous scan");
  });

  it.each([
    ["unconfigured", "Needs setup", "warning"],
    ["blocked", "Blocked", "warning"],
    ["error", "Scan failed", "danger"],
  ])("uses the recorded %s failure instead of fabricated uptime", (last_status, label, tone) => {
    const health = welcomeSourceHealth(source({ last_status, last_error: "Provider configuration missing" }));
    expect(health).toMatchObject({ label, tone, needsAttention: true, hint: "Provider configuration missing" });
  });

  it("does not recommend fixing a disabled source or erase its recorded error", () => {
    const disabled = source({ enabled: false, last_status: "error", last_error: "Old problem" });
    expect(welcomeSourceHealth(disabled)).toMatchObject({ label: "Off", needsAttention: false });
    expect(disabled.last_error).toBe("Old problem");
    expect(welcomeNextActions({ sources: [disabled] })[0].title).toBe("Turn on a signal source");
  });

  it("orders source issues first without mutating API data", () => {
    const sources = [source({ id: "off", enabled: false }), source({ id: "good", last_status: "ok" }), source({ id: "bad", last_status: "blocked" })];
    expect(welcomeSortedSources(sources).map((item) => item.id)).toEqual(["bad", "good", "off"]);
    expect(sources.map((item) => item.id)).toEqual(["off", "good", "bad"]);
  });

  it("prioritizes actual replies, unfinished setup, and source issues", () => {
    const actions = welcomeNextActions({ tenant: tenant(false), stats: { replies_unread: 3, signals_7d: 99 }, sources: [source({ last_status: "unconfigured" })], credits: credits() });
    expect(actions.map((item) => item.id)).toEqual(["replies", "brief", "sources"]);
    expect(actions[0].title).toBe("Review 3 unread replies");
    expect(actions[0].href).toBe("/replies");
  });

  it("does not infer zero replies, zero leads, or readiness from unavailable data", () => {
    expect(welcomeNextActions({})).toEqual([]);
    expect(welcomeNextActions({ tenant: tenant(true) })).toEqual([]);
    expect(welcomeNextActions({ stats: { replies_unread: 1, signals_7d: 0 } })[0].title).toBe("Review 1 unread reply");
  });

  it("does not ask for a top-up while a free or affordable claim remains", () => {
    expect(welcomeNextActions({ credits: credits({ free_leads_remaining: 1 }) })).toEqual([]);
    expect(welcomeNextActions({ credits: credits({ balance: 2 }) })).toEqual([]);
    expect(welcomeNextActions({ credits: credits({ balance: 1 }) })[0].href).toBe("/credits");
  });

  it("uses recent lead data only as a review action, never as a full lead count", () => {
    const actions = welcomeNextActions({ leads: { items: [{ id: "one", status: "new", fit: "fit" } as Lead], next_cursor: "more" } });
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ title: "Review your recent leads", href: "/leads" });
  });
});

describe("buyer setup validation", () => {
  it("reads only the expected brief field types", () => {
    expect(welcomeBriefFields({ offer: { text: "wrong" }, buyers: ["Founder", 123, null], roles: "not-a-list" })).toEqual({ offer: "", buyers: "Founder", roles: "" });
  });

  it("trims lists and deduplicates roles without changing their casing", () => {
    expect(welcomeList(" VP Sales, Founder, vp sales, , Founder ")).toEqual(["VP Sales", "Founder"]);
  });

  it("accepts bare domains and explicit public HTTP URLs", () => {
    expect(welcomeWebsite(" company.example ")).toEqual({ url: "https://company.example/" });
    expect(welcomeWebsite("http://company.example/about")).toEqual({ url: "http://company.example/about" });
    expect(welcomeWebsite("")).toEqual({});
  });

  it.each(["javascript:alert(1)", "ftp://company.example", "http://localhost", "http://127.0.0.1", "https://user:secret@company.example", "not a domain", "https://-company.example"])("rejects unsupported or invalid website %s", (value) => {
    expect(welcomeWebsite(value).error).toBeTruthy();
  });

  it("parses quoted companies, a header, URL domains, and optional countries", () => {
    expect(welcomeTargets('company,domain,country\n"Acme, Inc.",https://www.acme.example/path,us\nVector,vector.example\n')).toEqual({ targets: [{ company: "Acme, Inc.", domain: "acme.example", country: "US" }, { company: "Vector", domain: "vector.example" }], errors: [], duplicates: 0 });
  });

  it("supports escaped CSV quotes and deduplicates normalized domains", () => {
    const result = welcomeTargets('"Acme ""Labs""",acme.example,GB\nOther,https://www.ACME.example,US');
    expect(result.targets).toEqual([{ company: 'Acme "Labs"', domain: "acme.example", country: "GB" }]);
    expect(result.duplicates).toBe(1);
  });

  it("reports malformed targets by line instead of silently dropping them", () => {
    const result = welcomeTargets('Good,good.example\nMissing domain\nBad,bad.example,USA\n"Unclosed,acme.example');
    expect(result.targets).toHaveLength(1);
    expect(result.errors).toHaveLength(3);
    expect(result.errors[0]).toMatch(/^Line 2:/);
    expect(result.errors[1]).toMatch(/^Line 3:/);
    expect(result.errors[2]).toMatch(/^Line 4:/);
    expect(welcomeSetupPayload(form({ targets: "Missing domain" })).payload).toBeUndefined();
  });

  it("requires an offer even when extraction has not yet been run", () => {
    const result = welcomeSetupPayload(form({ website: "vendor.example", offer: " " }));
    expect(result.payload).toBeUndefined();
    expect(result.errors[0]).toContain("build the brief");
  });

  it("saves explicit empty persona lists so clearing an existing value is respected", () => {
    const result = welcomeSetupPayload(form({ buyers: "", roles: "", offer: "  A useful product  " }));
    expect(result.payload).toEqual({ website: undefined, offer: "A useful product", buyers: [], roles: [], targets: [], discover: false });
  });
});

describe("save before scan", () => {
  it("waits for persistence before requesting a scan", async () => {
    let resolveSave!: () => void;
    const save = vi.fn(() => new Promise<void>((resolve) => { resolveSave = resolve; }));
    const scan = vi.fn().mockResolvedValue({ status: "started" });
    const finished = welcomeSaveThenScan({ payload, save, scan, scanAfterSave: true });
    expect(save).toHaveBeenCalledWith(payload);
    expect(scan).not.toHaveBeenCalled();
    resolveSave();
    expect(await finished).toEqual({ scanStatus: "started" });
    expect(scan).toHaveBeenCalledTimes(1);
  });

  it("never scans when saving fails", async () => {
    const scan = vi.fn();
    const error = new Error("Save failed");
    await expect(welcomeSaveThenScan({ payload, save: vi.fn().mockRejectedValue(error), scan, scanAfterSave: true })).rejects.toBe(error);
    expect(scan).not.toHaveBeenCalled();
  });

  it("keeps a successful save distinct from a failed scan", async () => {
    const error = new Error("Scan unavailable");
    expect(await welcomeSaveThenScan({ payload, save: vi.fn().mockResolvedValue({}), scan: vi.fn().mockRejectedValue(error), scanAfterSave: true })).toEqual({ scanError: error });
  });

  it("does not scan on a normal save-and-continue", async () => {
    const scan = vi.fn();
    expect(await welcomeSaveThenScan({ payload, save: vi.fn().mockResolvedValue({}), scan, scanAfterSave: false })).toEqual({});
    expect(scan).not.toHaveBeenCalled();
  });
});

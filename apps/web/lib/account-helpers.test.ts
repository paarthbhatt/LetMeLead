import { describe, expect, it } from "vitest";

import {
  accountError,
  accountLabel,
  auditCategory,
  auditTargetHref,
  buildMcpConfig,
  buyerBrief,
  checkoutNotice,
  filterAuditEntries,
  httpUrl,
  ledgerLabel,
  parseLinkedinSession,
  settingsSectionFromHash,
} from "./account-helpers";

describe("settings sections", () => {
  it.each(["workspace", "team", "agents", "webhooks"])("supports #%s", (section) => {
    expect(settingsSectionFromHash(`#${section}`)).toBe(section);
  });

  it("defaults missing or unknown hashes to workspace", () => {
    expect(settingsSectionFromHash("")).toBe("workspace");
    expect(settingsSectionFromHash("#unknown")).toBe("workspace");
  });
});

describe("buyer brief", () => {
  it("turns canonical ICP fields into readable, trimmed values", () => {
    expect(buyerBrief({
      offer: "  Compliance software  ", buyers: [" CTOs ", "Security teams"],
      roles: "Engineering", region: "US and EU", exclusions: ["Students"],
    })).toEqual({
      offer: "Compliance software", buyers: ["CTOs", "Security teams"],
      roles: ["Engineering"], region: "US and EU", exclusions: ["Students"],
    });
  });

  it("does not invent a brief or stringify malformed objects", () => {
    expect(buyerBrief(undefined)).toEqual({ offer: null, buyers: [], roles: [], region: null, exclusions: [] });
    expect(buyerBrief({ buyers: [null, 42, {}, "Founders"], region: {} }).buyers).toEqual(["Founders"]);
    expect(buyerBrief({ region: {} }).region).toBeNull();
  });
});

describe("HTTP URLs and MCP config", () => {
  it("accepts HTTPS and the local HTTP development endpoints", () => {
    expect(httpUrl(" https://example.com/hooks ")).toBe("https://example.com/hooks");
    expect(httpUrl("http://localhost:8765/mcp")).toBe("http://localhost:8765/mcp");
  });

  it.each(["", "/relative", "not a url", "javascript:alert(1)", "data:text/html,test"])("rejects %s", (url) => {
    expect(httpUrl(url)).toBeNull();
  });

  it("uses the dedicated MCP service and an explicit placeholder key", () => {
    const config = JSON.parse(buildMcpConfig("http://localhost:8765/mcp"));
    expect(config.mcpServers.letmelead).toEqual({
      type: "http", url: "http://localhost:8765/mcp", headers: { Authorization: "Bearer lmk_YOUR_API_KEY" },
    });
    expect(JSON.stringify(config)).not.toContain("8000/mcp");
  });

  it("preserves deployment endpoints and the newly created key", () => {
    const config = JSON.parse(buildMcpConfig("https://example.com/mcp", "lmk_test"));
    expect(config.mcpServers.letmelead.url).toBe("https://example.com/mcp");
    expect(config.mcpServers.letmelead.headers.Authorization).toBe("Bearer lmk_test");
  });
});

describe("LinkedIn storage state", () => {
  const session = { cookies: [{ name: "li_at", value: "test-secret", domain: ".linkedin.com" }], origins: [] };

  it("parses Playwright state without altering the session", () => {
    expect(parseLinkedinSession(JSON.stringify(session))).toEqual(session);
  });

  it("accepts omitted origins; only structural validity is checked", () => {
    expect(parseLinkedinSession(JSON.stringify({ cookies: session.cookies }))).toEqual({ cookies: session.cookies });
  });

  it.each(["invalid", "null", "[]", "{}", '{"cookies":[]}', '{"cookies":"secret"}', '{"cookies":[null]}'])(
    "rejects invalid session input %s", (input) => {
      expect(() => parseLinkedinSession(input)).toThrow();
    },
  );

  it("rejects malformed cookie records and origins without echoing secrets", () => {
    expect(() => parseLinkedinSession('{"cookies":[{"value":"test-secret"}]}')).toThrow("Playwright storage state format");
    expect(() => parseLinkedinSession(JSON.stringify({ ...session, origins: {} }))).toThrow("origins field must be an array");
    try {
      parseLinkedinSession('{"cookies":[{"value":"test-secret"}]}');
    } catch (error) {
      expect((error as Error).message).not.toContain("test-secret");
    }
  });
});

describe("human-readable history", () => {
  it("labels known actions and gracefully handles unknown actions", () => {
    expect(accountLabel("api_key.revoked")).toBe("API key revoked");
    expect(accountLabel("linkedin.paused")).toBe("LinkedIn outreach paused");
    expect(accountLabel("custom_record.exported")).toBe("Custom record exported");
    expect(accountLabel("constructor")).toBe("Constructor");
    expect(accountLabel(null)).toBe("—");
  });

  it("preserves company names and free-claim references in ledger labels", () => {
    expect(ledgerLabel("claimed lead: Acme")).toBe("Lead claimed · Acme");
    expect(ledgerLabel("free lead 2/10")).toBe("Free lead claimed · 2/10");
    expect(ledgerLabel("top-up: 100 credits")).toBe("Credit top-up · 100 credits");
    expect(ledgerLabel("manual adjustment")).toBe("Manual adjustment");
  });

  it("categorizes real API actions", () => {
    expect(auditCategory("order.paid")).toBe("billing");
    expect(auditCategory("api_key.created")).toBe("integrations");
    expect(auditCategory("outreach.sent")).toBe("outreach");
    expect(auditCategory("custom.exported")).toBe("other");
  });

  const entries = [
    { id: "a", action: "api_key.created", actor_type: "user", actor_id: "user-123", target_type: "api_key", target_id: "key-123" },
    { id: "b", action: "order.paid", actor_type: "system", actor_id: null, target_type: "order", target_id: "order-456" },
    { id: "c", action: "lead.claimed", actor_type: "api_key", actor_id: "key-123", target_type: "lead", target_id: "lead-789" },
  ];

  it("searches raw and readable labels, full IDs and resolved actor names", () => {
    expect(filterAuditEntries(entries, { query: "API key created" }).map((entry) => entry.id)).toEqual(["a"]);
    expect(filterAuditEntries(entries, { query: "ORDER-456" }).map((entry) => entry.id)).toEqual(["b"]);
    expect(filterAuditEntries(entries, { query: "Riley", actorNames: { "user:user-123": "Riley Chen" } }).map((entry) => entry.id)).toEqual(["a"]);
  });

  it("combines actor and category filters without mutating entries", () => {
    expect(filterAuditEntries(entries, { actor: "api_key", category: "leads" }).map((entry) => entry.id)).toEqual(["c"]);
    expect(filterAuditEntries(entries, { actor: "system", category: "leads" })).toEqual([]);
    expect(filterAuditEntries(entries, { query: "   " })).toHaveLength(3);
    expect(entries).toHaveLength(3);
  });

  it("can find a copied audit event ID", () => {
    const event = { ...entries[0], id: "audit-event-0001" };
    expect(filterAuditEntries([event], { query: "audit-event-0001" })).toEqual([event]);
  });

  it("links only resources that have supported detail pages", () => {
    expect(auditTargetHref("lead", "a/b")).toBe("/leads/a%2Fb");
    expect(auditTargetHref("campaign", "abc")).toBe("/campaigns/abc");
    expect(auditTargetHref("order", "abc")).toBeNull();
    expect(auditTargetHref("lead", null)).toBeNull();
  });
});

describe("checkout return state", () => {
  it("never confirms payment from a success URL alone", () => {
    expect(checkoutNotice("success", undefined)?.tone).toBe("info");
    expect(checkoutNotice("success", { status: "pending" })?.tone).toBe("info");
    expect(checkoutNotice("success", undefined, true)?.title).toBe("Checking your order");
  });

  it("confirms only a matched order marked paid by the server", () => {
    expect(checkoutNotice("success", { status: "paid" })?.tone).toBe("success");
    expect(checkoutNotice("cancelled", { status: "paid" })?.tone).toBe("success");
  });

  it("does not promise no charge when checkout is cancelled", () => {
    const notice = checkoutNotice("cancelled", { status: "pending" });
    expect(notice?.tone).toBe("info");
    expect(notice?.message).toContain("without a confirmed payment");
    expect(notice?.message).not.toContain("Nothing was charged");
  });

  it("ignores unrecognized returns and does not confirm failed orders", () => {
    expect(checkoutNotice(null, { status: "paid" })).toBeNull();
    expect(checkoutNotice("unknown", { status: "paid" })).toBeNull();
    expect(checkoutNotice("success", { status: "failed" })?.tone).toBe("info");
  });
});

describe("error messages", () => {
  it("uses a concrete error when available and a fallback otherwise", () => {
    expect(accountError(new Error("Only owners can do this."), "Try again.")).toBe("Only owners can do this.");
    expect(accountError(null, "Try again.")).toBe("Try again.");
  });
});

import { describe, expect, it } from "vitest";

import { filterCommands, getNavigationContext, isNavigationActive, moveCommandSelection, NAVIGATION_ITEMS } from "./navigation";

describe("dashboard navigation", () => {
  it("includes every dashboard route and the Agents section", () => {
    expect(NAVIGATION_ITEMS.map((item) => item.href)).toEqual([
      "/overview", "/signals", "/leads", "/campaigns", "/replies", "/linkedin", "/credits", "/settings#agents", "/audit", "/settings",
    ]);
  });

  it("matches nested routes without matching similarly named pages", () => {
    expect(isNavigationActive("/leads/lead-123", "/leads")).toBe(true);
    expect(isNavigationActive("/leads/?q=acme", "/leads")).toBe(true);
    expect(isNavigationActive("/leads-archive", "/leads")).toBe(false);
    expect(isNavigationActive("/campaigns-old", "/campaigns")).toBe(false);
  });

  it("marks only Agents active at its section anchor", () => {
    expect(isNavigationActive("/settings#agents", "/settings#agents")).toBe(true);
    expect(isNavigationActive("/settings#agents", "/settings")).toBe(false);
    expect(isNavigationActive("/settings", "/settings#agents")).toBe(false);
    expect(isNavigationActive("/settings#profile", "/settings")).toBe(true);
    expect(getNavigationContext("/settings?tab=team#agents").label).toBe("Agents");
  });

  it("provides useful context for detail and setup pages", () => {
    expect(getNavigationContext("/leads/123")).toMatchObject({ href: "/leads", label: "Leads", detail: "Lead details" });
    expect(getNavigationContext("/campaigns/123").detail).toBe("Campaign details");
    expect(getNavigationContext("/onboarding").label).toBe("Workspace setup");
    expect(getNavigationContext("/unknown").label).toBe("Workspace");
  });
});

describe("command search and selection", () => {
  it("searches labels and real navigation keywords case-insensitively", () => {
    expect(filterCommands(NAVIGATION_ITEMS, " BILLING ").map((item) => item.href)).toEqual(["/credits"]);
    expect(filterCommands(NAVIGATION_ITEMS, "buying feeds").map((item) => item.href)).toEqual(["/signals"]);
    expect(filterCommands(NAVIGATION_ITEMS, "mcp").map((item) => item.href)).toEqual(["/settings#agents"]);
    expect(filterCommands(NAVIGATION_ITEMS, "not-a-command")).toEqual([]);
    expect(filterCommands(NAVIGATION_ITEMS, "")).toEqual(NAVIGATION_ITEMS);
  });

  it("normalizes diacritics and requires every search word", () => {
    const commands = [{ label: "Café workspace", keywords: ["theme"] }, { label: "Workspaces" }];
    expect(filterCommands(commands, "cafe theme")).toEqual([commands[0]]);
    expect(filterCommands(commands, "cafe billing")).toEqual([]);
  });

  it("wraps keyboard selection and handles empty results", () => {
    expect(moveCommandSelection(0, 4, "previous")).toBe(3);
    expect(moveCommandSelection(3, 4, "next")).toBe(0);
    expect(moveCommandSelection(0, 0, "next")).toBe(0);
    expect(moveCommandSelection(0, 1, "previous")).toBe(0);
  });
});

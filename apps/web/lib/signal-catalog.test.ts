import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import type { SignalCatalog, SignalCategory, SignalDef, Source } from "./api";
import {
  applySignalToggle,
  filterSignalCategories,
  isSignalAutomated,
  PLANNED_SIGNAL_COPY,
  signalCounts,
  signalErrorMessage,
  signalHowItWorks,
  signalSearchSources,
  signalStatusLabel,
  sourceStatus,
} from "./signal-catalog";

function signal(overrides: Partial<SignalDef> = {}): SignalDef {
  return {
    id: "funding",
    label: "Just raised money",
    description: "A recent funding announcement.",
    why_now: "A new budget to support growth.",
    how_it_works: "Read recent company news.",
    status: "live",
    status_label: "Live",
    channels: ["linkedin", "email"],
    adapters: ["news"],
    automatic: true,
    enabled: true,
    ...overrides,
  };
}

function source(overrides: Partial<Source> = {}): Source {
  return {
    id: "news-source",
    kind: "news",
    name: "Company news",
    enabled: true,
    config: {},
    daily_quota: 100,
    last_run_at: null,
    last_status: null,
    last_error: null,
    ...overrides,
  };
}

const categories: SignalCategory[] = [
  { id: "growing", label: "Growing", signals: [signal(), signal({ id: "launch", label: "Launching a new product", status: "partly_live", enabled: false })] },
  { id: "events", label: "Events", signals: [signal({ id: "speaking", label: "Speaking at an event", status: "by_hand", status_label: "By hand", automatic: false, adapters: [], enabled: false, how_it_works: "We research it by hand when you order leads on it." })] },
];

const filters = { view: "catalog" as const, search: "", category: "all", status: "all" as const };

describe("signal catalog counts and browsing", () => {
  it("counts actual saved choices, not assumed defaults or capabilities", () => {
    expect(signalCounts(categories)).toEqual({ total: 3, enabled: 1, sourceBacked: 2, planned: 1, live: 1, partlyLive: 1 });
    expect(signalCounts([{ id: "growing", label: "Growing", signals: [signal({ enabled: false })] }]).enabled).toBe(0);
  });

  it("keeps the full catalog and its order, including planned entries", () => {
    expect(filterSignalCategories(categories, filters).flatMap((category) => category.signals.map((entry) => entry.id))).toEqual(["funding", "launch", "speaking"]);
    expect(categories[0].signals).toHaveLength(2);
  });

  it("separates Your signals from catalog browsing", () => {
    expect(filterSignalCategories(categories, { ...filters, view: "yours" }).flatMap((category) => category.signals.map((entry) => entry.id))).toEqual(["funding"]);
  });

  it("combines case-insensitive search with category and status filters", () => {
    const shown = filterSignalCategories(categories, { ...filters, search: "  NEW   NEWS ", category: "growing", status: "partly_live" });
    expect(shown[0].signals.map((entry) => entry.id)).toEqual(["launch"]);
    expect(filterSignalCategories(categories, { ...filters, status: "enabled" })[0].signals).toHaveLength(1);
    expect(filterSignalCategories(categories, { ...filters, status: "disabled" }).flatMap((category) => category.signals)).toHaveLength(2);
    expect(filterSignalCategories(categories, { ...filters, search: "not in the catalog" })).toEqual([]);
  });

  it("searches timing details but not the unsupported research-service copy", () => {
    expect(filterSignalCategories(categories, { ...filters, search: "budget" })[0].signals[0].id).toBe("funding");
    expect(filterSignalCategories(categories, { ...filters, search: "research it by hand" })).toEqual([]);
    expect(filterSignalCategories(categories, { ...filters, status: "by_hand" })[0].signals[0].id).toBe("speaking");
  });

  it("checks the real API catalog contains 51 unique entries without duplicating it in UI code", () => {
    // Vitest provides the real module directory in both node and jsdom;
    // jsdom's import.meta.url can use http:, which node:fs cannot read.
    const catalogSource = readFileSync(resolve(__dirname, "../../api/letmelead/signals_catalog.py"), "utf8");
    const ids = [...catalogSource.matchAll(/\bSignalDef\(\s*id="([^"]+)"/g)].map((match) => match[1]);
    expect(ids).toHaveLength(51);
    expect(new Set(ids).size).toBe(51);
  });
});

describe("honest automation labels", () => {
  it("requires automation, an adapter, and a non-planned status", () => {
    expect(isSignalAutomated(signal())).toBe(true);
    expect(isSignalAutomated(signal({ automatic: false }))).toBe(false);
    expect(isSignalAutomated(signal({ adapters: [] }))).toBe(false);
    expect(isSignalAutomated(signal({ status: "by_hand", automatic: true }))).toBe(false);
    expect(signalStatusLabel(signal({ status: "by_hand" }))).toBe("Not automated");
  });

  it("never presents By hand as an available staffed service", () => {
    expect(signalHowItWorks(categories[1].signals[0])).toBe(PLANNED_SIGNAL_COPY);
    expect(signalHowItWorks(signal({ automatic: false }))).toBe(PLANNED_SIGNAL_COPY);
    expect(signalHowItWorks(signal({ how_it_works: "We search map listings; everything else in this category stays by hand." }))).toBe("We search map listings; Other entries in this category are not automated.");
  });
});

describe("shared feeds and confirmed toggles", () => {
  it("deduplicates shared adapters and only searches enabled source records", () => {
    const signals = [signal({ adapters: ["news", "x"] }), signal({ id: "launch", adapters: ["news", "reviews"] })];
    expect(signalSearchSources(signals, [source(), source({ kind: "x", enabled: false }), source({ kind: "reviews" })])).toEqual(["news", "reviews"]);
  });

  it("does not turn an empty or unavailable selection into an all-source scan", () => {
    expect(signalSearchSources([signal()], undefined)).toEqual([]);
    expect(signalSearchSources([signal()], [])).toEqual([]);
    expect(signalSearchSources([signal({ enabled: false })], [source()])).toEqual([]);
    expect(signalSearchSources([signal({ status: "by_hand", automatic: true })], [source()])).toEqual([]);
  });

  it("applies a confirmed response without changing capabilities or mutating the catalog", () => {
    const catalog: SignalCatalog = { categories, legend: { by_hand: "Historical API copy" } };
    const updated = applySignalToggle(catalog, { id: "funding", enabled: false });
    expect(updated.categories[0].signals[0].enabled).toBe(false);
    expect(catalog.categories[0].signals[0].enabled).toBe(true);
    expect(updated.categories[0].signals[0].status).toBe("live");
    expect(updated.legend).toBe(catalog.legend);
    expect(signalCounts(updated.categories).total).toBe(3);
  });
});

describe("source status and errors", () => {
  it("does not infer provider availability from an enabled switch", () => {
    expect(sourceStatus(source()).label).toBe("Not checked");
    expect(sourceStatus(source({ last_status: "ok" })).label).toBe("Last scan OK");
    expect(sourceStatus(source({ enabled: false, last_status: "ok" })).label).toBe("Off");
    expect(sourceStatus(undefined).label).toBe("Not set up");
    expect(sourceStatus(source({ last_status: "ok" }), "error").label).toBe("Status unknown");
    expect(sourceStatus(undefined, "loading").label).toBe("Checking status");
  });

  it("preserves known setup, blocking, and scan failures", () => {
    expect(sourceStatus(source({ last_status: "unconfigured" }))).toMatchObject({ label: "Needs setup", needsAttention: true });
    expect(sourceStatus(source({ last_status: "blocked" }))).toMatchObject({ label: "Blocked", needsAttention: true });
    expect(sourceStatus(source({ last_status: "error", last_error: "Request failed" }))).toMatchObject({ label: "Scan error", tone: "danger" });
  });

  it("shows real errors while replacing the stale not_automatic service promise", () => {
    const error = Object.assign(new Error("It is researched by hand when you order leads on it."), { code: "not_automatic" });
    expect(signalErrorMessage(error, "Request failed")).toBe(PLANNED_SIGNAL_COPY);
    expect(signalErrorMessage(new Error("Your role cannot change signals."), "Request failed")).toBe("Your role cannot change signals.");
    expect(signalErrorMessage(null, "Request failed")).toBe("Request failed");
  });
});

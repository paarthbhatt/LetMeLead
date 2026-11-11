import { describe, expect, it } from "vitest";

import { ageLabel, cn, money, relative, shortDate } from "./utils";

describe("cn", () => {
  it("joins classes", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("merges conflicting tailwind utilities, last one wins", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("p-2", "text-sm")).toBe("p-2 text-sm");
  });

  it("ignores falsy input", () => {
    expect(cn("a", false && "b", undefined, "c")).toBe("a c");
  });
});

describe("ageLabel", () => {
  it("labels undated evidence", () => {
    expect(ageLabel(null)).toBe("undated");
    expect(ageLabel(undefined)).toBe("undated");
  });

  it("labels fresh and stale evidence", () => {
    expect(ageLabel(0)).toBe("today");
    expect(ageLabel(1)).toBe("1 day old");
    expect(ageLabel(5)).toBe("5 days old");
    expect(ageLabel(-3)).toBe("today");
  });
});

describe("money", () => {
  it("formats cents as USD", () => {
    expect(money(4900)).toBe("$49.00");
    expect(money(0)).toBe("$0.00");
  });

  it("supports other currencies", () => {
    expect(money(1000, "eur")).toBe("€10.00");
  });
});

describe("shortDate", () => {
  it("renders a placeholder for missing values", () => {
    expect(shortDate(null)).toBe("—");
    expect(shortDate(undefined)).toBe("—");
    expect(shortDate("not a date")).toBe("—");
  });

  it("renders the day of a UTC timestamp", () => {
    // Midday UTC stays on the same calendar day in every realistic timezone.
    expect(shortDate("2026-01-05T12:00:00Z")).toBe("Jan 5, 2026");
  });
});

describe("relative", () => {
  it("renders a placeholder for missing values", () => {
    expect(relative(null)).toBe("—");
    expect(relative("garbage")).toBe("—");
  });

  it("labels recent timestamps", () => {
    const now = Date.now();
    expect(relative(new Date(now - 10_000).toISOString())).toBe("just now");
    expect(relative(new Date(now - 5 * 60_000).toISOString())).toBe("5m ago");
    expect(relative(new Date(now - 3 * 3_600_000).toISOString())).toBe("3h ago");
    expect(relative(new Date(now - 2 * 86_400_000).toISOString())).toBe("2d ago");
  });
});

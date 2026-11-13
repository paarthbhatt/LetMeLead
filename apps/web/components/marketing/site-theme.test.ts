import { describe, expect, it } from "vitest";

import { isNight, themeForNow } from "./site-theme";

function at(hour: number, minute = 0) {
  return new Date(2026, 10, 12, hour, minute);
}

describe("site theme", () => {
  it("turns dark at 19:00 and stays dark until 07:00", () => {
    expect(isNight(at(18, 59))).toBe(false);
    expect(isNight(at(19, 0))).toBe(true);
    expect(isNight(at(23, 30))).toBe(true);
    expect(isNight(at(0, 1))).toBe(true);
    expect(isNight(at(6, 59))).toBe(true);
    expect(isNight(at(7, 0))).toBe(false);
    expect(isNight(at(12, 0))).toBe(false);
  });

  it("resolves the current theme from the clock", () => {
    expect(themeForNow(at(21))).toBe("dark");
    expect(themeForNow(at(9))).toBe("light");
  });
});

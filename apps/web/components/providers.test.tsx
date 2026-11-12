import { act, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getThemePreference, Providers, resolveTheme, THEME_STORAGE_KEY, toggleTheme, useTheme } from "./providers";
import { stubLocalStorage } from "../tests/browser-storage";

function mockSystemTheme(initialDark: boolean) {
  let dark = initialDark;
  const media = new EventTarget() as MediaQueryList;
  Object.defineProperty(media, "matches", { get: () => dark });
  const add = vi.spyOn(media, "addEventListener");
  const remove = vi.spyOn(media, "removeEventListener");
  vi.stubGlobal("matchMedia", vi.fn(() => media));
  return { add, remove, change(next: boolean) { dark = next; media.dispatchEvent(new Event("change")); } };
}

function ThemeProbe() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return <><output aria-label="Current theme">{theme} / {resolvedTheme}</output><button onClick={() => setTheme("light")}>Use light</button><button onClick={() => setTheme("system")}>Use system</button></>;
}

beforeEach(() => {
  stubLocalStorage();
  document.documentElement.classList.remove("dark");
  document.documentElement.style.colorScheme = "";
  delete document.documentElement.dataset.theme;
});
afterEach(() => vi.unstubAllGlobals());

describe("theme provider", () => {
  it("renders children immediately and defaults to graphite dark", () => {
    mockSystemTheme(false);
    render(<Providers><ThemeProbe /><p>Server content stays visible</p></Providers>);
    expect(screen.getByText("Server content stays visible")).toBeTruthy();
    expect(screen.getByRole("status", { name: "Current theme" }).textContent).toBe("dark / dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("respects an explicit light preference even on a dark system", () => {
    const system = mockSystemTheme(true);
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    render(<Providers><ThemeProbe /></Providers>);
    act(() => system.change(true));
    expect(screen.getByRole("status", { name: "Current theme" }).textContent).toBe("light / light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("follows system changes without overwriting the system preference", () => {
    const system = mockSystemTheme(false);
    window.localStorage.setItem(THEME_STORAGE_KEY, "system");
    render(<Providers><ThemeProbe /></Providers>);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    act(() => system.change(true));
    expect(screen.getByRole("status", { name: "Current theme" }).textContent).toBe("system / dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("system");
  });

  it("synchronizes setters and the existing toggleTheme export", () => {
    mockSystemTheme(false);
    render(<Providers><ThemeProbe /></Providers>);
    fireEvent.click(screen.getByRole("button", { name: "Use light" }));
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(screen.getByRole("status", { name: "Current theme" }).textContent).toBe("light / light");
    act(() => toggleTheme());
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(screen.getByRole("status", { name: "Current theme" }).textContent).toBe("dark / dark");
  });

  it("updates from another tab and handles cleared preferences", () => {
    mockSystemTheme(false);
    render(<Providers><ThemeProbe /></Providers>);
    act(() => {
      window.localStorage.setItem(THEME_STORAGE_KEY, "light");
      window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY, newValue: "light" }));
    });
    expect(screen.getByRole("status", { name: "Current theme" }).textContent).toBe("light / light");
    act(() => {
      window.localStorage.clear();
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });
    expect(screen.getByRole("status", { name: "Current theme" }).textContent).toBe("dark / dark");
  });

  it("ignores invalid stored preferences", () => {
    mockSystemTheme(false);
    window.localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    expect(getThemePreference()).toBe("dark");
    render(<Providers><ThemeProbe /></Providers>);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("still changes appearance when storage is unavailable", () => {
    const system = mockSystemTheme(true);
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => { throw new Error("Storage denied"); });
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => { throw new Error("Storage denied"); });
    render(<Providers><ThemeProbe /></Providers>);
    fireEvent.click(screen.getByRole("button", { name: "Use light" }));
    act(() => system.change(true));
    expect(screen.getByRole("status", { name: "Current theme" }).textContent).toBe("light / light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("cleans up its system listener on unmount", () => {
    const system = mockSystemTheme(false);
    const { unmount } = render(<Providers><ThemeProbe /></Providers>);
    expect(system.add).toHaveBeenCalledWith("change", expect.any(Function));
    unmount();
    expect(system.remove).toHaveBeenCalledWith("change", expect.any(Function));
  });
});

describe("resolveTheme", () => {
  it.each([
    ["light", true, "light"], ["dark", false, "dark"], ["system", true, "dark"], ["system", false, "light"],
  ] as const)("resolves %s with systemDark=%s to %s", (theme, systemDark, expected) => {
    expect(resolveTheme(theme, systemDark)).toBe(expected);
  });
});

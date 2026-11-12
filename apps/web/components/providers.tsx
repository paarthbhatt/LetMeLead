"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";

export type ThemePreference = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "letmelead.theme";
const THEME_EVENT = "letmelead:theme";
const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";

function isTheme(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function getThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "dark";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : "dark";
  } catch {
    return "dark";
  }
}

export function resolveTheme(theme: ThemePreference, systemDark: boolean): ResolvedTheme {
  return theme === "system" ? (systemDark ? "dark" : "light") : theme;
}

function applyTheme(theme: ThemePreference): ResolvedTheme {
  const systemDark = typeof window.matchMedia === "function" && window.matchMedia(SYSTEM_THEME_QUERY).matches;
  const resolved = resolveTheme(theme, systemDark);
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
  root.dataset.theme = theme;
  return resolved;
}

export function setTheme(theme: ThemePreference): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private or restricted storage must not prevent changing the current theme.
  }
  applyTheme(theme);
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: theme }));
}

export function toggleTheme(): void {
  if (typeof document === "undefined") return;
  setTheme(document.documentElement.classList.contains("dark") ? "light" : "dark");
}

const ThemeContext = React.createContext<{
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setTheme: typeof setTheme;
}>({ theme: "dark", resolvedTheme: "dark", setTheme });

export function useTheme() {
  return React.useContext(ThemeContext);
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 },
        },
      }),
  );
  const [theme, setPreference] = React.useState<ThemePreference>("dark");
  const [resolvedTheme, setResolvedTheme] = React.useState<ResolvedTheme>("dark");

  React.useEffect(() => {
    let currentTheme = getThemePreference();
    const media = typeof window.matchMedia === "function" ? window.matchMedia(SYSTEM_THEME_QUERY) : null;
    const sync = (next: ThemePreference) => {
      currentTheme = next;
      setPreference(next);
      setResolvedTheme(applyTheme(next));
    };
    const onSystemChange = () => sync(currentTheme);
    const onThemeChange = (event: Event) => {
      const next: unknown = (event as CustomEvent).detail;
      sync(isTheme(next) ? next : getThemePreference());
    };
    const onStorageChange = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) sync(getThemePreference());
    };

    sync(currentTheme);
    media?.addEventListener("change", onSystemChange);
    window.addEventListener(THEME_EVENT, onThemeChange);
    window.addEventListener("storage", onStorageChange);
    return () => {
      media?.removeEventListener("change", onSystemChange);
      window.removeEventListener(THEME_EVENT, onThemeChange);
      window.removeEventListener("storage", onStorageChange);
    };
  }, []);

  // The root layout applies the saved theme before paint; keep server-rendered
  // content available rather than hiding the whole application until hydration.
  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </ThemeContext.Provider>
  );
}

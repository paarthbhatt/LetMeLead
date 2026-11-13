"use client";

import * as React from "react";

/**
 * The public site has its own theme, separate from the app shell. It follows
 * the visitor's clock: dark after 19:00 and before 07:00, light otherwise.
 * An explicit choice from the header switch is remembered and wins from then on.
 */
export const SITE_THEME_KEY = "letmelead.site-theme";
const NIGHT_START = 19;
const NIGHT_END = 7;

export type SiteTheme = "light" | "dark";

export function isNight(date: Date = new Date()): boolean {
  const hour = date.getHours();
  return hour >= NIGHT_START || hour < NIGHT_END;
}

export function themeForNow(date: Date = new Date()): SiteTheme {
  return isNight(date) ? "dark" : "light";
}

export function readStoredTheme(): SiteTheme | null {
  try {
    const stored = window.localStorage.getItem(SITE_THEME_KEY);
    return stored === "dark" || stored === "light" ? stored : null;
  } catch {
    return null;
  }
}

function applyTheme(theme: SiteTheme) {
  document.documentElement.dataset.siteTheme = theme;
}

/**
 * Blocking script: sets the attribute before the first paint so a night visit
 * never flashes the light theme.
 */
const THEME_BOOTSTRAP = `try{var s=localStorage.getItem('${SITE_THEME_KEY}');var h=new Date().getHours();var t=(s==='dark'||s==='light')?s:((h>=${NIGHT_START}||h<${NIGHT_END})?'dark':'light');document.documentElement.setAttribute('data-site-theme',t);}catch(e){document.documentElement.setAttribute('data-site-theme','light');}`;

export function SiteThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />;
}

export function SiteThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = React.useState<SiteTheme | null>(null);

  React.useEffect(() => {
    const current = document.documentElement.dataset.siteTheme;
    setTheme(current === "dark" ? "dark" : "light");
  }, []);

  // Visitors who never touched the switch keep following the clock.
  React.useEffect(() => {
    if (readStoredTheme()) return;
    const sync = () => {
      const next = themeForNow();
      applyTheme(next);
      setTheme((previous) => (previous === next ? previous : next));
    };
    const timer = window.setInterval(sync, 5 * 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const next: SiteTheme = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      className={className}
      data-theme-toggle=""
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      title={theme === "dark" ? "Light theme" : "Dark theme"}
      onClick={() => {
        applyTheme(next);
        setTheme(next);
        try {
          window.localStorage.setItem(SITE_THEME_KEY, next);
        } catch {
          // Restricted storage must not block switching for this visit.
        }
      }}
    >
      <span aria-hidden="true" data-icon={theme === "dark" ? "sun" : "moon"}>
        {theme === "dark" ? (
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7">
            <circle cx="12" cy="12" r="4.2" />
            <path d="M12 3.2v2.1M12 18.7v2.1M3.2 12h2.1M18.7 12h2.1M5.8 5.8l1.5 1.5M16.7 16.7l1.5 1.5M18.2 5.8l-1.5 1.5M7.3 16.7l-1.5 1.5" strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7">
            <path d="M20 14.4A8.4 8.4 0 1 1 9.6 4a6.7 6.7 0 0 0 10.4 10.4Z" strokeLinejoin="round" />
          </svg>
        )}
      </span>
    </button>
  );
}

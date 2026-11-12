import * as React from "react";

import { FooterSessionLink, HeaderActions } from "./header-actions";

const NAV = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/#demo", label: "Sample lead" },
  { href: "/integrations", label: "Integrations" },
  { href: "/trust", label: "Trust" },
];

export function Brand() {
  return (
    <a className="mkt-brand" href="/" aria-label="LetMeLead home">
      <span className="mkt-brand-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      LetMeLead
    </a>
  );
}

export function MarketingHeader() {
  return (
    <header className="mkt-header">
      <div className="mkt-wrap mkt-header-inner">
        <a className="mkt-skip" href="#main">
          Skip to content
        </a>
        <Brand />
        <nav className="mkt-nav" aria-label="Product">
          {NAV.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
        <div className="mkt-header-actions">
          <HeaderActions />
        </div>
        <details className="mkt-mobile">
          <summary>Menu</summary>
          <div className="mkt-mobile-panel">
            {NAV.map((item) => (
              <a key={item.href} href={item.href}>
                {item.label}
              </a>
            ))}
            <a href="/login">Sign in</a>
            <a href="/signup" data-tone="solid">
              Create workspace
            </a>
          </div>
        </details>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="mkt-footer">
      <div className="mkt-wrap">
        <div className="mkt-footer-grid">
          <div>
            <Brand />
            <p className="mkt-footer-note">
              Signals show timing, not intent. Every lead carries its source URL, a plain-language reason
              and the age of the evidence, so you can decide whether it is worth a credit.
            </p>
          </div>
          <nav className="mkt-footer-links" aria-label="Footer">
            <a href="/how-it-works">How it works</a>
            <a href="/integrations">Integrations</a>
            <a href="/trust">Trust &amp; data</a>
            <a href="/signup">Create workspace</a>
            <FooterSessionLink />
          </nav>
        </div>
        <p className="mkt-footer-note">
          © {new Date().getFullYear()} LetMeLead. Outreach is sent from your own LinkedIn session, at your
          pace, and only when you confirm it.
        </p>
      </div>
    </footer>
  );
}

/** Shared paper surface so public routes never inherit the dashboard theme. */
export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mkt-root">
      <MarketingHeader />
      <main id="main">{children}</main>
      <MarketingFooter />
    </div>
  );
}

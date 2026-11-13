import Link from "next/link";
import * as React from "react";

import styles from "./sections-styles.module.css";

import { ScrollProgress } from "./scroll-progress";
import { SiteThemeScript, SiteThemeToggle } from "./site-theme";

type MktHeaderProps = {
  /** Show the documented back link on standalone pages. */
  back?: boolean;
};

export function MktHeader({ back = false }: MktHeaderProps) {
  return (
    <header className={styles.header}>
      <SiteThemeScript />
      <ScrollProgress />
      {back ? (
        <div className={styles.backBar}>
          <div className={styles.backInner}>
            <Link href="/" className={styles.backLink}>
              <span aria-hidden="true">←</span> Back to home
            </Link>
          </div>
        </div>
      ) : null}

      <div className={styles.headerInner}>
        <Link href="/" className={styles.brand} aria-label="LetMeLead home">
          <span className={styles.brandMark} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          LetMeLead
        </Link>

        <nav className={styles.nav} aria-label="Product">
          <Link href="/how-it-works" className={styles.navLink}>
            How it works
          </Link>
          <Link href="/#pricing" className={styles.navLink}>
            Pricing
          </Link>
        </nav>

        <SiteThemeToggle className="mkt-theme-toggle" />
        <div className={styles.headerActions}>
          <Link href="/login" className={`${styles.btn} ${styles.btnQuiet}`}>
            Sign in
          </Link>
          <Link href="/signup" className={`${styles.btn} ${styles.btnSolid}`}>
            Create workspace
          </Link>
        </div>
      </div>
    </header>
  );
}

export function MktFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.footerGrid}>
          <div>
            <span className={styles.footerBrand}>
              <span className={styles.brandMark} aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              LetMeLead
            </span>
            <p className={styles.footerText}>
              Signals show timing, not intent. Every lead carries its source, date and age so you
              can judge the evidence yourself.
            </p>
          </div>

          <div className={styles.footerCol}>
            <p className={styles.footerLabel}>Product</p>
            <ul className={styles.footerLinks}>
              <li>
                <Link href="/how-it-works">How it works</Link>
              </li>
              <li>
                <Link href="/#pricing">Pricing</Link>
              </li>
            </ul>
          </div>

          <div className={styles.footerCol}>
            <p className={styles.footerLabel}>Start</p>
            <ul className={styles.footerLinks}>
              <li>
                <Link href="/signup">Create workspace</Link>
              </li>
              <li>
                <Link href="/login">Sign in</Link>
              </li>
            </ul>
          </div>
        </div>

        <p className={styles.footerNote}>
          LetMeLead is software for research and outreach. It does not promise results, buyer
          intent or a fixed number of signals per company. Contact details stay unverified unless
          an enrichment provider returned them.
        </p>
      </div>
    </footer>
  );
}

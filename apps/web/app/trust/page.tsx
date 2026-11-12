import type { Metadata } from "next";
import Link from "next/link";

import { MktFooter, MktHeader } from "@/components/marketing/mkt-chrome";
import styles from "@/components/marketing/sections-styles.module.css";

import "../marketing.css";

export const metadata: Metadata = {
  title: "Trust and data — LetMeLead",
  description:
    "What LetMeLead stores, how credits and billing work, the outreach consent model, LinkedIn risk and the audit log.",
};

const STORED_DATA = [
  ["Account", "Email, name, password hash (argon2), optional Google subject.", "Authentication"],
  ["Workspace", "Name, slug, website and the ICP brief.", "Targeting"],
  ["Signals", "Title, source URL, date, source name and detail.", "Evidence behind a lead"],
  ["Leads and contacts", "Company, domain, role titles, public profile URL, optional email or phone.", "Outreach"],
  ["Messages and replies", "Sequence state, message rows and the reply stop rule.", "Sending and replies"],
  ["LinkedIn session", "Playwright storage state, Fernet-encrypted at rest.", "Sending from your account"],
  ["Credits and orders", "Append-only ledger rows, orders and invoices.", "Billing"],
  ["Audit log", "Actor, action, target and time.", "Accountability"],
] as const;

export default function TrustPage() {
  return (
    <div className={`mkt-root ${styles.root}`}>
      <MktHeader back />

      <main className={styles.page} id="main">
        <header className={styles.pageHead}>
          <p className={styles.eyebrow}>Trust and data</p>
          <h1 className={styles.pageTitle}>What is stored, what is spent, and what stays manual.</h1>
          <p className={styles.pageLede}>
            This page states what the software does so you can decide whether it fits your
            jurisdiction and your outreach policy. It is engineering documentation, not legal advice.
            The short version: public evidence, a narrow data set, review-first sending and a local
            LinkedIn session.
          </p>
          <p className={styles.pageMeta}>
            Signals show timing, not intent. Every lead carries its source URL, publish date, age and
            verification status. If you cannot show a recipient why they were contacted, do not
            contact them.
          </p>
          <div className={styles.pageActions}>
            <Link href="/how-it-works" className={`${styles.btn} ${styles.btnSolid} ${styles.btnLarge}`}>
              Read the workflow
            </Link>
            <Link href="/integrations" className={`${styles.btn} ${styles.btnLarge}`}>
              Integration reference
            </Link>
          </div>
        </header>

        <div className={styles.docBody}>
          <section className={styles.docSection} aria-labelledby="handling-title">
            <h2 id="handling-title">Data handling.</h2>
            <p className={styles.docLead}>
              The engine collects public signals and the minimum contact data needed to act on them.
              It does not scrape private data, bypass a login, defeat bot protection or work around a
              rate limit. A blocked source is surfaced as a limitation, never quietly retried through
              another route.
            </p>

            <ul className={styles.miniList}>
              <li>
                Public sources only: job postings, news, public posts, public reviews and public
                business listings.
              </li>
              <li>
                Names are recorded only when a source states them. Otherwise the lead carries a role
                and a LinkedIn search link, marked unverified.
              </li>
              <li>
                Email addresses and phone numbers are stored only when an enrichment provider
                returns them. The row records the provider, the confidence and any limitation.
              </li>
              <li>
                The product is built not to invent data. Without a provider, an honest
                &quot;unverified&quot; contact is preferable to a fabricated address.
              </li>
            </ul>

            <div className={styles.callout}>
              <strong>No silent rejection.</strong> When qualification falls back from a model to
              lexical heuristics, the affected record says so. A missing provider is visible in the
              health response and the scan report.
            </div>
          </section>

          <section className={styles.docSection} aria-labelledby="stored-title">
            <h2 id="stored-title">What is stored.</h2>
            <div className={styles.tableWrap}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th scope="col">Data</th>
                    <th scope="col">What it contains</th>
                    <th scope="col">Why</th>
                  </tr>
                </thead>
                <tbody>
                  {STORED_DATA.map(([label, content, why]) => (
                    <tr key={label}>
                      <td>{label}</td>
                      <td>{content}</td>
                      <td>{why}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3>Retention and removal</h3>
            <div className={styles.prose}>
              <p>
                There is no automatic purge, by design: a lead&apos;s evidence is the product. An
                operator should set a retention policy and enforce it against the database, for
                example deleting leads untouched for 24 months and audit rows older than 12 months.
              </p>
              <p>
                Deleting a lead cascades to its contacts, messages and replies. Deleting a tenant
                cascades to its signals, leads, messages, replies, ledger, keys and webhooks. Backups
                retain deleted data until they expire; rotate them on your own schedule.
              </p>
              <p>
                For an access or erasure request, delete the lead or tenant. <code>GET /v1/audit</code>{" "}
                then answers who contacted the person and why. Every resource is available as JSON,
                so an export does not depend on a separate reporting product.
              </p>
            </div>
          </section>

          <section className={styles.docSection} aria-labelledby="billing-title">
            <h2 id="billing-title">Credits and billing.</h2>
            <p className={styles.docLead}>
              Credits are the only spending mechanism. They are bought in packs, never expire, and
              every movement is an append-only ledger row with a visible reason. There is no
              subscription object.
            </p>

            <dl className={styles.definitionList}>
              <div className={styles.definitionRow}>
                <dt>Free allowance</dt>
                <dd>10 free claims per workspace. They are used before paid credits.</dd>
              </div>
              <div className={styles.definitionRow}>
                <dt>Claim price</dt>
                <dd>
                  1 credit per lead after the free allowance. A scan does not spend credits; a claim
                  does.
                </dd>
              </div>
              <div className={styles.definitionRow}>
                <dt>Pack price</dt>
                <dd>
                  A 100-credit pack is USD 49 by default. The server can configure another pack size
                  or price, and the order review shows the authoritative total before checkout.
                </dd>
              </div>
              <div className={styles.definitionRow}>
                <dt>Ledger</dt>
                <dd>
                  Append-only. It refuses any row that would make the balance negative. A top-up is
                  granted idempotently per order.
                </dd>
              </div>
              <div className={styles.definitionRow}>
                <dt>Payments</dt>
                <dd>
                  With Stripe keys you get Checkout and signed webhooks. Without keys, a top-up is
                  recorded as pending and no credits are granted. Payment configuration is not faked.
                </dd>
              </div>
              <div className={styles.definitionRow}>
                <dt>Duplicate protection</dt>
                <dd>
                  A lead domain can be claimed once per tenant. <code>Idempotency-Key</code> stops a
                  retried claim or top-up from charging twice.
                </dd>
              </div>
            </dl>
          </section>

          <section className={styles.docSection} aria-labelledby="consent-title">
            <h2 id="consent-title">Outreach consent model.</h2>
            <p className={styles.docLead}>
              Outreach is review-first. The software prepares evidence and a draft; it does not
              decide that a person should be contacted. Sending is off and dry-run is on by default,
              and every live send depends on a session you connected and a campaign you queued.
            </p>

            <ul className={styles.miniList}>
              <li>
                <strong>No automatic send.</strong> A generated message is a draft until you queue
                it. The default worker renders and audits without delivery.
              </li>
              <li>
                <strong>Human pacing.</strong> A new account starts at 5 invitations a day, rises by
                5 every three days to a ceiling of 20, waits 45–180 seconds between actions and sends
                only on weekdays between 07:00 and 19:00 UTC.
              </li>
              <li>
                <strong>Reply means stop.</strong> An inbound reply stops the lead&apos;s sequence
                immediately; every later message for that lead becomes skipped.
              </li>
              <li>
                <strong>Pause is immediate.</strong> Pausing the account or the campaign halts the
                queue before the next send. Unanswered invitations are withdrawn after 21 days.
              </li>
              <li>
                <strong>Recipient transparency.</strong> Every lead shows a dated reason, the source
                and URL of each piece of evidence, the signal age and its verification status. If you
                cannot show those, do not contact the person.
              </li>
            </ul>

            <div className={styles.callout}>
              <strong>Consent is not inferred from a signal.</strong> A funding round, a new hire or a
              bad review is a reason to look, not permission to message. Your lawful basis and your
              local rules still apply, and they are yours to decide.
            </div>
          </section>

          <section className={styles.docSection} aria-labelledby="linkedin-title">
            <h2 id="linkedin-title">LinkedIn risk.</h2>
            <p className={styles.docLead}>
              LinkedIn sending is the highest-risk part of the product. The implementation is
              deliberately local and narrow, but the platform decision is still yours.
            </p>

            <dl className={styles.definitionList}>
              <div className={styles.definitionRow}>
                <dt>Local session</dt>
                <dd>
                  You run <code>scripts/linkedin_session.py</code> on your own machine, sign in
                  yourself, complete 2FA if asked, and produce a Playwright storage state. The
                  password is never sent to LetMeLead.
                </dd>
              </div>
              <div className={styles.definitionRow}>
                <dt>Encrypted at rest</dt>
                <dd>
                  The API encrypts the storage state with <code>SESSION_ENCRYPTION_KEY</code> and
                  never returns it. The key is separate from the database and is not logged.
                </dd>
              </div>
              <div className={styles.definitionRow}>
                <dt>One worker</dt>
                <dd>
                  <code>services/linkedin_worker.py</code> is the only place that touches LinkedIn.
                  It reads the decrypted session, applies the pacing rules and honours the outreach
                  flags.
                </dd>
              </div>
              <div className={styles.definitionRow}>
                <dt>Platform risk</dt>
                <dd>
                  Automated messaging may breach LinkedIn&apos;s User Agreement. Pacing, jitter and
                  reply stops reduce risk; they do not make automation permitted. Prefer dry-run plus
                  manual sending where policy is unclear.
                </dd>
              </div>
            </dl>
          </section>

          <section className={styles.docSection} aria-labelledby="audit-title">
            <h2 id="audit-title">Audit log.</h2>
            <p className={styles.docLead}>
              Every claim, send, pause, API-key change and billing event is recorded with its actor
              and time. The log is the answer to &quot;who did this, and when?&quot; without relying
              on a person&apos;s memory.
            </p>

            <div className={styles.prose}>
              <p>
                <code>GET /v1/audit</code> returns a cursor-paginated page of actor type, actor id,
                action, target type, target id and timestamp. The same rows are visible in the
                dashboard. Request ids and structured logs connect an API response to the server work
                behind it, and an optional Sentry hook captures failures.
              </p>
              <p>
                Security controls behind the log: JWT access and refresh with rotation, SHA-256
                hashed API keys with an 8-character lookup prefix, tenant scoping in every query,
                Fernet encryption for the LinkedIn session, verified Stripe webhook signatures and
                idempotent credit grants.
              </p>
            </div>

            <p className={styles.smallNote}>
              This page is a description of implemented behaviour, not a compliance certification or
              a legal opinion. Your retention, lawful basis and platform-risk decisions remain yours.
            </p>

            <div className={styles.pager}>
              <Link href="/how-it-works">The full workflow</Link>
              <Link href="/integrations">Integration reference</Link>
            </div>
          </section>
        </div>
      </main>

      <MktFooter />
    </div>
  );
}

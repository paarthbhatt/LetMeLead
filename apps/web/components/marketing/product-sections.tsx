import Link from "next/link";
import * as React from "react";

import styles from "./sections-styles.module.css";

export type SignalStatus = "live" | "partly_live" | "by_hand";

export const SIGNAL_TOTALS = {
  signals: 51,
  categories: 8,
  live: 8,
  partlyLive: 21,
  byHand: 22,
} as const;

export const SIGNAL_CATEGORIES = [
  { name: "Asking now", count: 8 },
  { name: "Hiring", count: 11 },
  { name: "New leaders", count: 6 },
  { name: "Growing", count: 8 },
  { name: "Website and tools", count: 7 },
  { name: "Events", count: 3 },
  { name: "Local businesses", count: 5 },
  { name: "Already knows you", count: 3 },
] as const;

export const SOURCE_ADAPTERS: readonly {
  name: string;
  status: Exclude<SignalStatus, "by_hand">;
  statusLabel: string;
  looksFor: string;
  needs: string;
}[] = [
  {
    name: "Company news",
    status: "live",
    statusLabel: "Live",
    looksFor: "Funding, acquisitions, leadership changes, launches and relocations.",
    needs: "Public Google News RSS. No key.",
  },
  {
    name: "Job boards",
    status: "live",
    statusLabel: "Live",
    looksFor: "Roles on a company's own careers page, including sales, marketing, success and SDR.",
    needs: "A detected Greenhouse, Lever, Ashby or Personio board. No key.",
  },
  {
    name: "Reddit",
    status: "partly_live",
    statusLabel: "Partly live",
    looksFor: "Problem posts, alternative requests and competitor complaints.",
    needs: "Public search JSON. Best-effort; a block is reported, never bypassed.",
  },
  {
    name: "X / Twitter",
    status: "partly_live",
    statusLabel: "Partly live",
    looksFor: "Company-named posts about switching, problems and migrations.",
    needs: "X_BEARER_TOKEN. Official API v2 only.",
  },
  {
    name: "Google Maps",
    status: "partly_live",
    statusLabel: "Partly live",
    looksFor: "Local listings that match the Maps query you configure.",
    needs: "GOOGLE_MAPS_API_KEY and MAPS_QUERY.",
  },
  {
    name: "Facebook pages",
    status: "partly_live",
    statusLabel: "Partly live",
    looksFor: "Posts from the pages you explicitly list.",
    needs: "FB_ACCESS_TOKEN and FB_PAGE_IDS.",
  },
  {
    name: "Review feeds",
    status: "partly_live",
    statusLabel: "Partly live",
    looksFor: "Low-rating review items, three stars or less, from a feed you supply.",
    needs: "REVIEWS_FEED_URL returning a JSON array.",
  },
];

export const FAQ_ITEMS = [
  {
    question: "Does LetMeLead send messages automatically?",
    answer:
      "No. Sending is off and dry-run is on by default. The worker renders and audits messages without sending until you enable live outreach. When live sending is on, it still runs only from a campaign you queued and a LinkedIn session you connected.",
  },
  {
    question: "Does scanning spend credits?",
    answer:
      "No. A scan does not spend credits. Each workspace gets 10 free claims, then a claim costs 1 credit. A 100-credit pack is USD 49 by default, and the server can configure another pack size or price. The ledger is append-only.",
  },
  {
    question: "How many signals are there, and how many are automatic?",
    answer:
      "The catalog contains 51 signals in 8 categories: 8 live, 21 partly live and 22 by hand. Only signals backed by an adapter can be toggled. By-hand signals cannot be switched on because there is no automatic collector behind the switch yet.",
  },
  {
    question: "Are contact names and emails verified?",
    answer:
      "Not by default. Names are recorded only when a source states them. Email addresses and phone numbers are stored only when an enrichment provider returns them, with the provider and confidence recorded. Without a provider, a lead carries a LinkedIn search link and an unverified label rather than an invented address.",
  },
  {
    question: "Which sources run without extra keys?",
    answer:
      "News, job boards and Reddit are on for a new workspace. X needs X_BEARER_TOKEN, Google Maps needs a Places key and a query, Facebook needs a page token and page ids, and review feeds need a JSON feed URL. A source with missing credentials is reported as unavailable, and the rest of the scan still runs.",
  },
  {
    question: "What does “by hand” actually mean?",
    answer:
      "It means not automated. The evidence for those 22 signals is assembled outside the automatic adapters, by you or your team. There is no staffed-research promise and no queue behind the switch.",
  },
  {
    question: "Can I use my own model and enrichment keys?",
    answer:
      "Yes. LLM_PROVIDER accepts openai, anthropic, ollama or none, with your base URL, key and model. ENRICHMENT_PROVIDER is none or pattern; the pattern provider returns a search link and marks the contact unverified. Another provider can be added behind the enrichment interface.",
  },
  {
    question: "Can Claude, Codex or Cursor drive the whole pipeline?",
    answer:
      "They can use the MCP server at /mcp, which exposes 13 tools over the same REST API, tenant, credits and audit. The server instructions tell a model not to claim a lead or send outreach without your explicit approval.",
  },
] as const;

const STATUS_LABELS: Record<SignalStatus, string> = {
  live: "Live",
  partly_live: "Partly live",
  by_hand: "By hand",
};

function StatusChip({ status }: { status: SignalStatus }) {
  return (
    <span className={styles.statusChip} data-status={status}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export function ProductSections() {
  return (
    <div className={styles.sectionsRoot}>
      <section id="how-it-works" className={styles.section} aria-labelledby="home-workflow-title">
        <header className={styles.sectionHead}>
          <p className={styles.eyebrow}>How it works</p>
          <h2 id="home-workflow-title" className={styles.sectionTitle}>
            Four moves, in your order.
          </h2>
          <p className={styles.sectionLede}>
            Collect dated evidence. Qualify it against your buyer. Review the dossier and the
            draft. Then decide whether anything is sent. The product is built so the last decision
            stays yours.
          </p>
        </header>

        <ol className={styles.workflow}>
          <li className={styles.step}>
            <div className={styles.stepRail} aria-hidden="true">
              <span className={styles.stepNumber}>01</span>
              <span className={styles.stepLine} />
            </div>
            <div className={styles.stepBody}>
              <div className={styles.stepText}>
                <p className={styles.stepKicker}>Collect</p>
                <h3 className={styles.stepTitle}>Paste a website. Build a target list.</h3>
                <p className={styles.stepCopy}>
                  LetMeLead turns the site, or the brief you paste, into an ICP and a watchlist.
                  Seven adapters then look for dated public evidence. News, job boards and Reddit
                  are on by default; the credential-backed adapters stay off until you configure
                  them. Scans run every six hours, and each tenant chooses which automatic signals
                  it wants.
                </p>
              </div>
              <aside className={styles.stepAside} aria-label="Adapters and scan facts">
                <p className={styles.asideLabel}>7 adapters that can run on a scan</p>
                <ul className={styles.sourceMini}>
                  {SOURCE_ADAPTERS.map((source) => (
                    <li key={source.name} className={styles.sourceMiniItem}>
                      {source.name} <span>{source.statusLabel}</span>
                    </li>
                  ))}
                </ul>
                <ul className={`${styles.factList} ${styles.stepAsideFacts}`}>
                  <li className={styles.fact}>
                    <span className={styles.factLabel}>Signal catalog</span>
                    <span className={styles.factValue}>51 in 8 categories</span>
                  </li>
                  <li className={styles.fact}>
                    <span className={styles.factLabel}>Free defaults</span>
                    <span className={styles.factValue}>News, jobs, Reddit</span>
                  </li>
                </ul>
              </aside>
            </div>
          </li>

          <li className={styles.step}>
            <div className={styles.stepRail} aria-hidden="true">
              <span className={styles.stepNumber}>02</span>
              <span className={styles.stepLine} />
            </div>
            <div className={styles.stepBody}>
              <div className={styles.stepText}>
                <p className={styles.stepKicker}>Qualify</p>
                <h3 className={styles.stepTitle}>Signals first. Audience fit second.</h3>
                <p className={styles.stepCopy}>
                  Evidence is de-duplicated per real-world event, decayed by age, scored, then
                  checked against your audience. When an LLM is configured it takes the qualification
                  pass; otherwise lexical heuristics do the work and the record says so. A weak fit
                  is shown as a weak fit, not hidden as a silent rejection.
                </p>
              </div>
              <aside className={styles.stepAside} aria-label="Qualification facts">
                <p className={styles.asideLabel}>What qualification looks at</p>
                <ul className={styles.factList}>
                  <li className={styles.fact}>
                    <span className={styles.factLabel}>Signal age</span>
                    <span className={styles.factValue}>Decays with time</span>
                  </li>
                  <li className={styles.fact}>
                    <span className={styles.factLabel}>Duplicates</span>
                    <span className={styles.factValue}>One per event</span>
                  </li>
                  <li className={styles.fact}>
                    <span className={styles.factLabel}>Audience</span>
                    <span className={styles.factValue}>ICP and fit confidence</span>
                  </li>
                  <li className={styles.fact}>
                    <span className={styles.factLabel}>Model</span>
                    <span className={styles.factValue}>LLM or labelled heuristics</span>
                  </li>
                </ul>
              </aside>
            </div>
          </li>

          <li className={styles.step}>
            <div className={styles.stepRail} aria-hidden="true">
              <span className={styles.stepNumber}>03</span>
              <span className={styles.stepLine} />
            </div>
            <div className={styles.stepBody}>
              <div className={styles.stepText}>
                <p className={styles.stepKicker}>Review</p>
                <h3 className={styles.stepTitle}>A dossier you can disagree with.</h3>
                <p className={styles.stepCopy}>
                  Open a lead and you get the plain-language reason, signal age, fit confidence and
                  an evidence timeline with the source URL and date for each item. The draft is
                  rendered from that signal, not from a template with the company name swapped in.
                  Contacts keep their caveat: a role and a search link are not the same as a verified
                  person.
                </p>
              </div>
              <aside className={styles.stepAside} aria-label="What a lead dossier contains">
                <p className={styles.asideLabel}>Inside a lead dossier</p>
                <ul className={styles.reviewStack}>
                  <li className={styles.reviewRow}>
                    <p>
                      <strong>Evidence timeline</strong>
                      <span>Title, source, URL, publish date and strength for every item.</span>
                    </p>
                  </li>
                  <li className={styles.reviewRow}>
                    <p>
                      <strong>Fit reasoning</strong>
                      <span>Audience match, timing clues and the confidence behind them.</span>
                    </p>
                  </li>
                  <li className={styles.reviewRow}>
                    <p>
                      <strong>Contact status</strong>
                      <span>Role first. Unverified unless a provider returned details.</span>
                    </p>
                  </li>
                  <li className={styles.reviewRow}>
                    <p>
                      <strong>Review-only draft</strong>
                      <span>Grounded in the signal, labelled for review, with no delivery action.</span>
                    </p>
                  </li>
                </ul>
              </aside>
            </div>
          </li>

          <li className={styles.step}>
            <div className={styles.stepRail} aria-hidden="true">
              <span className={styles.stepNumber}>04</span>
              <span className={styles.stepLine} />
            </div>
            <div className={styles.stepBody}>
              <div className={styles.stepText}>
                <p className={styles.stepKicker}>Send</p>
                <h3 className={styles.stepTitle}>Your account. Your pacing. Your call.</h3>
                <p className={styles.stepCopy}>
                  Nothing sends automatically. When you enable live outreach, the worker uses the
                  LinkedIn session you connected, ramps from 5 to 20 invitations a day with jitter,
                  sends only on weekdays inside business hours, and stops a lead&apos;s sequence the
                  moment a reply arrives. Pausing the account or the campaign halts the queue before
                  the next send.
                </p>
              </div>
              <aside className={styles.stepAside} aria-label="Sending controls">
                <p className={styles.asideLabel}>Default sending controls</p>
                <ul className={styles.factList}>
                  <li className={styles.fact}>
                    <span className={styles.factLabel}>Live sending</span>
                    <span className={styles.factValue}>Off</span>
                  </li>
                  <li className={styles.fact}>
                    <span className={styles.factLabel}>Dry run</span>
                    <span className={styles.factValue}>On</span>
                  </li>
                  <li className={styles.fact}>
                    <span className={styles.factLabel}>Daily ramp</span>
                    <span className={styles.factValue}>5 → 20</span>
                  </li>
                  <li className={styles.fact}>
                    <span className={styles.factLabel}>On reply</span>
                    <span className={styles.factValue}>Sequence stops</span>
                  </li>
                </ul>
              </aside>
            </div>
          </li>
        </ol>
      </section>

      <section id="signals" className={styles.section} aria-labelledby="home-signals-title">
        <header className={styles.sectionHead}>
          <p className={styles.eyebrow}>Sources and signals</p>
          <h2 id="home-signals-title" className={styles.sectionTitle}>
            Seven adapters. Fifty-one signals. Honest labels.
          </h2>
          <p className={styles.sectionLede}>
            Signals show timing, not intent: a source is only useful if you know how often it really
            runs. The catalog separates what is automatic, what is conditional and what still needs a
            person. Coverage is not a promise of a signal for every company.
          </p>
        </header>

        <div className={styles.signalSummary} aria-label="Signal catalog totals">
          <div className={styles.summaryCell}>
            <span className={styles.summaryValue}>{SIGNAL_TOTALS.signals}</span>
            <span className={styles.summaryLabel}>signals in the catalog</span>
          </div>
          <div className={styles.summaryCell}>
            <span className={styles.summaryValue}>{SIGNAL_TOTALS.categories}</span>
            <span className={styles.summaryLabel}>categories</span>
          </div>
          <div className={styles.summaryCell}>
            <span className={styles.summaryValue}>
              {SIGNAL_TOTALS.live} / {SIGNAL_TOTALS.partlyLive}
            </span>
            <span className={styles.summaryLabel}>live / partly live</span>
          </div>
          <div className={styles.summaryCell}>
            <span className={styles.summaryValue}>{SIGNAL_TOTALS.byHand}</span>
            <span className={styles.summaryLabel}>by hand, not automatic</span>
          </div>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption>
              The seven source adapters in the repository. The status is an honest coverage label
              for the adapter, not a promise of complete coverage; the signal catalog uses the same
              Live / Partly live / By hand labels.
            </caption>
            <thead>
              <tr>
                <th scope="col">Adapter</th>
                <th scope="col">Status</th>
                <th scope="col">What it looks for</th>
                <th scope="col">What it needs</th>
              </tr>
            </thead>
            <tbody>
              {SOURCE_ADAPTERS.map((source) => (
                <tr key={source.name}>
                  <td>{source.name}</td>
                  <td>
                    <StatusChip status={source.status} />
                  </td>
                  <td>{source.looksFor}</td>
                  <td>{source.needs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.categoryGrid} aria-label="Signal categories and counts">
          {SIGNAL_CATEGORIES.map((category) => (
            <div key={category.name} className={styles.categoryItem}>
              <span className={styles.categoryName}>{category.name}</span>
              <span className={styles.categoryCount}>{category.count} signals</span>
            </div>
          ))}
        </div>

        <aside className={styles.honesty}>
          <p>
            <StatusChip status="by_hand" /> <strong>means not automated.</strong> The other{" "}
            {SIGNAL_TOTALS.byHand} signals have no collector behind them yet, so they cannot be
            toggled on. You gather that evidence outside the adapters; there is no staffed-research
            promise attached to the label.
          </p>
        </aside>
      </section>

      <section id="control" className={styles.section} aria-labelledby="home-control-title">
        <div className={styles.split}>
          <div className={styles.splitHead}>
            <p className={styles.eyebrow}>Control and trust</p>
            <h2 id="home-control-title" className={styles.sectionTitle}>
              You keep the account, the credits and the send button.
            </h2>
            <p className={styles.sectionLede}>
              The defaults are deliberately quiet: no live sending, no automatic claims, no session
              handed to a third party. Every movement is either your action or a row you can inspect.
            </p>
            <ul className={styles.inlineLinks}>
              <li>
                <Link href="/trust">Read the trust and data notes</Link>
              </li>
            </ul>
          </div>

          <ul className={styles.controlList}>
            <li className={styles.controlItem}>
              <p className={styles.controlTerm}>Credits</p>
              <p className={styles.controlCopy}>
                10 free claims per workspace, then <strong>1 credit per claim</strong>. A
                100-credit pack is <strong>USD 49 by default</strong> and the server can configure
                another size or price. Scanning itself does not spend credits. The ledger is
                append-only and refuses to go negative.
              </p>
            </li>
            <li className={styles.controlItem}>
              <p className={styles.controlTerm}>Review first</p>
              <p className={styles.controlCopy}>
                A claim is a human decision. The REST API, the dashboard and the MCP server share
                the same credits and audit. Agents are instructed not to claim or send without
                explicit approval.
              </p>
            </li>
            <li className={styles.controlItem}>
              <p className={styles.controlTerm}>LinkedIn session</p>
              <p className={styles.controlCopy}>
                You sign in locally with <code>scripts/linkedin_session.py</code>. The Playwright
                storage state is encrypted at rest with <code>SESSION_ENCRYPTION_KEY</code> and is
                never returned by the API.
              </p>
            </li>
            <li className={styles.controlItem}>
              <p className={styles.controlTerm}>No auto-send</p>
              <p className={styles.controlCopy}>
                Sending is off and dry-run is on by default. Enabled, the worker ramps 5 → 20 a day,
                waits 45–180 seconds between actions, stays inside weekdays and business hours, and
                withdraws unanswered invitations after 21 days.
              </p>
            </li>
            <li className={styles.controlItem}>
              <p className={styles.controlTerm}>Audit log</p>
              <p className={styles.controlCopy}>
                Every claim, send, pause, API-key change and billing event is recorded with its
                actor and time. <code>GET /v1/audit</code> answers who did what, and when.
              </p>
            </li>
          </ul>
        </div>
      </section>

      <section id="integrations" className={styles.section} aria-labelledby="home-integrations-title">
        <header className={styles.sectionHead}>
          <p className={styles.eyebrow}>Integrations</p>
          <h2 id="home-integrations-title" className={styles.sectionTitle}>
            One API underneath the dashboard and the agent.
          </h2>
          <p className={styles.sectionLede}>
            The REST surface lives under <code>/v1</code>. The MCP server exposes the same tools over
            Streamable HTTP, so a model cannot take an action the dashboard could not. Bring your own
            model and enrichment keys, or run without them and accept the labelled fallbacks.
          </p>
        </header>

        <div className={styles.integrationGrid}>
          <div>
            <ul className={styles.integrationFacts}>
              <li className={styles.integrationFact}>
                <span>REST base</span>
                <strong>/v1</strong>
              </li>
              <li className={styles.integrationFact}>
                <span>MCP endpoint</span>
                <strong>localhost:8765/mcp</strong>
              </li>
              <li className={styles.integrationFact}>
                <span>MCP tools</span>
                <strong>13</strong>
              </li>
              <li className={styles.integrationFact}>
                <span>Authentication</span>
                <strong>Bearer JWT or X-API-Key</strong>
              </li>
              <li className={styles.integrationFact}>
                <span>Model provider</span>
                <strong>Your key, or none</strong>
              </li>
              <li className={styles.integrationFact}>
                <span>Enrichment</span>
                <strong>Your key, or pattern</strong>
              </li>
            </ul>
            <ul className={styles.inlineLinks}>
              <li>
                <Link href="/integrations">Open the integration reference</Link>
              </li>
            </ul>
          </div>

          <div>
            <p className={styles.codeCaption}>MCP client block, default local endpoint</p>
            <pre className={styles.codeBlock}>
              <code>{`{
  "mcpServers": {
    "letmelead": {
      "type": "http",
      "url": "http://localhost:8765/mcp",
      "headers": {
        "Authorization": "Bearer lml_..."
      }
    }
  }
}`}</code>
            </pre>
          </div>
        </div>
      </section>

      <section id="limitations" className={styles.section} aria-labelledby="home-limitations-title">
        <header className={styles.sectionHead}>
          <p className={styles.eyebrow}>Limitations</p>
          <h2 id="home-limitations-title" className={styles.sectionTitle}>
            The edges are part of the product.
          </h2>
          <p className={styles.sectionLede}>
            A signal is a dated clue, not a purchase order. These are the places where the system
            stops, and saying so is more useful than pretending the coverage is complete.
          </p>
        </header>

        <div className={styles.limitations}>
          <article className={styles.limitation}>
            <span className={styles.limitationLabel}>No fabricated data</span>
            <p className={styles.limitationCopy}>
              The engine does not invent names, emails, companies or results. If a source did not
              state a name, the lead carries a role and a search link. If no enrichment provider
              returned an address, the contact stays unverified.
            </p>
          </article>
          <article className={styles.limitation}>
            <span className={styles.limitationLabel}>Signal coverage varies</span>
            <p className={styles.limitationCopy}>
              8 signals are live, 21 are partly live and 22 are by hand. A quiet company, a
              non-public careers page or a region outside the configured Maps query can produce
              nothing. An empty result is not evidence that the company has no reason to buy.
            </p>
          </article>
          <article className={styles.limitation}>
            <span className={styles.limitationLabel}>By hand is not automated</span>
            <p className={styles.limitationCopy}>
              The 22 by-hand signals cannot be switched on because no adapter backs them. You
              gather that evidence yourself. There is no staffed-research service behind the label.
            </p>
          </article>
          <article className={styles.limitation}>
            <span className={styles.limitationLabel}>Timing is not intent</span>
            <p className={styles.limitationCopy}>
              A funding round, a new sales hire or a bad review shows a moment, not a budget. Fit
              confidence is a judgement with evidence attached; it is not a prediction that the
              company will reply or buy.
            </p>
          </article>
          <article className={styles.limitation}>
            <span className={styles.limitationLabel}>LinkedIn automation carries platform risk</span>
            <p className={styles.limitationCopy}>
              Automated messaging may breach LinkedIn&apos;s User Agreement. Pacing, jitter and reply
              stops reduce risk; they do not make automation permitted. Decide deliberately for your
              own account, and prefer dry-run plus manual sending where policy is unclear.
            </p>
          </article>
          <article className={styles.limitation}>
            <span className={styles.limitationLabel}>No delivery guarantee</span>
            <p className={styles.limitationCopy}>
              A draft is text until you queue it. Email delivery, profile accuracy and reply rates
              depend on external providers and the recipient. The product does not claim a send
              succeeded unless the worker recorded it.
            </p>
          </article>
        </div>
      </section>

      <section id="faq" className={styles.section} aria-labelledby="home-faq-title">
        <header className={styles.sectionHead}>
          <p className={styles.eyebrow}>Questions</p>
          <h2 id="home-faq-title" className={styles.sectionTitle}>
            The questions the product should answer plainly.
          </h2>
          <p className={styles.sectionLede}>
            Short answers, with the defaults and the edges left in. Open a question for the detail.
          </p>
        </header>

        <div className={styles.faq}>
          {FAQ_ITEMS.map((item) => (
            <details key={item.question} className={styles.faqItem}>
              <summary className={styles.faqSummary}>{item.question}</summary>
              <p className={styles.faqAnswer}>{item.answer}</p>
            </details>
          ))}
        </div>

        <div className={styles.ctaRow}>
          <Link href="/signup" className={`${styles.btn} ${styles.btnSolid} ${styles.btnLarge}`}>
            Create a workspace
          </Link>
          <Link href="/how-it-works" className={`${styles.btn} ${styles.btnLarge}`}>
            Read the full workflow
          </Link>
        </div>
      </section>
    </div>
  );
}

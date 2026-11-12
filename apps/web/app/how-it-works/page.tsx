import type { Metadata } from "next";
import Link from "next/link";

import { MktFooter, MktHeader } from "@/components/marketing/mkt-chrome";
import { SIGNAL_TOTALS, SOURCE_ADAPTERS } from "@/components/marketing/product-sections";
import styles from "@/components/marketing/sections-styles.module.css";

import "../marketing.css";

export const metadata: Metadata = {
  title: "How it works — LetMeLead",
  description:
    "The LetMeLead workflow: collect dated public signals, qualify against an ICP, review the evidence and the draft, then decide whether to send.",
};

const STAGE_COSTS = [
  {
    stage: "Collect",
    work: "Adapters scan the targets you watch for dated public evidence.",
    credits: "0",
    limits: "Per-source daily quota, default 200. Scans run every 6 hours.",
  },
  {
    stage: "Qualify",
    work: "De-duplicate per event, decay by age, score and check audience fit.",
    credits: "0",
    limits: "An LLM is optional. Heuristics are labelled when used.",
  },
  {
    stage: "Review",
    work: "Open the dossier, inspect every source, read or edit the draft.",
    credits: "0",
    limits: "The draft is review-only until a campaign is queued.",
  },
  {
    stage: "Claim",
    work: "Make a lead yours so it can enter a campaign.",
    credits: "0 for the first 10, then 1 per claim",
    limits: "One domain per tenant. The ledger is append-only.",
  },
  {
    stage: "Send",
    work: "Queue a campaign and let the worker send at a human pace.",
    credits: "0",
    limits: "Off and dry-run by default. 5 → 20 a day, weekdays, 07:00–19:00 UTC.",
  },
] as const;

export default function HowItWorksPage() {
  return (
    <div className={`mkt-root ${styles.root}`}>
      <MktHeader back />

      <main className={styles.page} id="main">
        <header className={styles.pageHead}>
          <p className={styles.eyebrow}>How it works</p>
          <h1 className={styles.pageTitle}>From a website to a reviewed conversation.</h1>
          <p className={styles.pageLede}>
            LetMeLead is a research and outreach desk, not an autopilot. It collects dated public
            evidence, explains why a company might have a reason to talk now, and prepares a draft.
            You decide what is true enough to use and whether anything leaves your account.
          </p>
          <p className={styles.pageMeta}>
            This page describes the implemented workflow in the repository. Signals show timing, not
            intent. Coverage varies by company, source and region.
          </p>
          <div className={styles.pageActions}>
            <Link href="/signup" className={`${styles.btn} ${styles.btnSolid} ${styles.btnLarge}`}>
              Create a workspace
            </Link>
            <Link href="/integrations" className={`${styles.btn} ${styles.btnLarge}`}>
              Integration reference
            </Link>
          </div>
        </header>

        <div className={styles.docBody}>
          <section className={styles.docSection} aria-labelledby="collect-title">
            <h2 id="collect-title">1. Collect: turn a watchlist into dated evidence.</h2>
            <p className={styles.docLead}>
              Start with a website. The engine builds a buyer brief from the page, or from the text
              you paste, and creates a target list. A scan then asks each enabled adapter for recent
              public items about those targets. Every item keeps its title, source, URL and publish
              date.
            </p>

            <div className={styles.example}>
              <strong>Concrete example.</strong> A B2B software company adds a first security-lead
              role to its careers page. The job-board adapter recognises the Greenhouse board,
              records the role title, the publish date and the URL, and files it as a hiring signal.
              If the same role also appears in a news item, the event fingerprint keeps one copy
              rather than counting the same moment twice.
            </div>

            <h3>What runs, and what it needs</h3>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <caption>
                  These are the seven adapters in the repository. A source with missing credentials
                  is reported as unavailable; the rest of the scan still completes.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Adapter</th>
                    <th scope="col">Status</th>
                    <th scope="col">What it needs</th>
                  </tr>
                </thead>
                <tbody>
                  {SOURCE_ADAPTERS.map((source) => (
                    <tr key={source.name}>
                      <td>{source.name}</td>
                      <td>
                        <span className={styles.statusChip} data-status={source.status}>
                          {source.statusLabel}
                        </span>
                      </td>
                      <td>{source.needs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className={styles.miniList}>
              <li>
                News, job boards and Reddit are enabled for a new tenant because they need no key.
              </li>
              <li>
                X, Google Maps, Facebook pages and review feeds are opt-in and require credentials
                or a feed. They do not silently pretend to run.
              </li>
              <li>
                The catalog has {SIGNAL_TOTALS.signals} signals in {SIGNAL_TOTALS.categories}{" "}
                categories. {SIGNAL_TOTALS.live} are live, {SIGNAL_TOTALS.partlyLive} are partly
                live and {SIGNAL_TOTALS.byHand} are by hand.
              </li>
              <li>
                A tenant can toggle the automatic signals it wants. By-hand signals cannot be
                enabled because no adapter backs the switch.
              </li>
            </ul>
          </section>

          <section className={styles.docSection} aria-labelledby="qualify-title">
            <h2 id="qualify-title">2. Qualify: a signal is a moment, not a budget.</h2>
            <p className={styles.docLead}>
              Raw evidence is noisy. The engine removes duplicate events, reduces the weight of older
              items, scores the remaining signals and checks them against the audience you described.
              When an LLM is configured it handles qualification and ICP extraction; without one,
              lexical heuristics run and the record carries that limitation.
            </p>

            <div className={styles.example}>
              <strong>Concrete example.</strong> A first security hire is a timing clue: the company
              is about to own enterprise questionnaires. If your offer is security-review automation
              for B2B software teams, that fits the audience and the moment. If you sell to consumer
              apps, the same real role loses on audience fit. The role is not proof of a purchase
              plan in either case.
            </div>

            <ul className={styles.miniList}>
              <li>
                Duplicates are collapsed per real-world event, so a syndicated article is not five
                signals.
              </li>
              <li>
                Signal age is visible on the lead. A ninety-day-old clue is not presented like
                yesterday&apos;s news.
              </li>
              <li>
                Qualification returns a fit label, a confidence and a reason. A weak result stays
                visible instead of becoming a silent rejection.
              </li>
              <li>
                Marking a lead not-a-fit records the reason and feeds it back into later
                qualification.
              </li>
            </ul>
          </section>

          <section className={styles.docSection} aria-labelledby="review-title">
            <h2 id="review-title">3. Review: the dossier is the product.</h2>
            <p className={styles.docLead}>
              A lead detail is not a name and a company. It is an evidence file you can inspect before
              spending a credit or writing a message. Open it and you get the reason, the age, the
              fit, the evidence timeline and a draft grounded in the signal that created it.
            </p>

            <h3>What you get in a lead dossier</h3>
            <dl className={styles.definitionList}>
              <div className={styles.definitionRow}>
                <dt>Plain-language reason</dt>
                <dd>
                  Why the company is in front of you now, in one sentence you can repeat to a
                  colleague or a recipient.
                </dd>
              </div>
              <div className={styles.definitionRow}>
                <dt>Signal age and score</dt>
                <dd>
                  When the evidence was published, how old it is, and the score that survived
                  de-duplication and age decay.
                </dd>
              </div>
              <div className={styles.definitionRow}>
                <dt>Fit and confidence</dt>
                <dd>
                  The audience match, the fit reason and the confidence behind it. A high score is
                  not a promise of intent.
                </dd>
              </div>
              <div className={styles.definitionRow}>
                <dt>Evidence timeline</dt>
                <dd>
                  Each item&apos;s source, type, strength, title, URL, publish date and points. If
                  you cannot show the source, you should not contact the person.
                </dd>
              </div>
              <div className={styles.definitionRow}>
                <dt>Contact status</dt>
                <dd>
                  A role and a public profile link by default, marked unverified. An email or phone
                  appears only when an enrichment provider returned it, with the provider and
                  confidence recorded.
                </dd>
              </div>
              <div className={styles.definitionRow}>
                <dt>Review-only draft</dt>
                <dd>
                  A message rendered from the lead&apos;s own signal, not a template with a name
                  swapped in. It stays a draft until you queue a campaign.
                </dd>
              </div>
              <div className={styles.definitionRow}>
                <dt>Limitations</dt>
                <dd>
                  What is still unknown: budget, incumbent tool, buying authority or whether the
                  timing clue means anything at all.
                </dd>
              </div>
            </dl>

            <p className={styles.smallNote}>
              The same dossier is available over the REST API and through MCP. Tools and the
              dashboard read the same records, so a model cannot see a cleaner story than you do.
            </p>
          </section>

          <section className={styles.docSection} aria-labelledby="send-title">
            <h2 id="send-title">4. Send: the last decision stays human.</h2>
            <p className={styles.docLead}>
              Outreach is deliberately gated. Sending is off and dry-run is on by default. A
              campaign must be queued, the LinkedIn session must be connected from your own machine,
              and the worker must be allowed to send. Until then it renders and audits messages
              without delivery.
            </p>

            <div className={styles.example}>
              <strong>Concrete example.</strong> You claim a lead, add it to a campaign, preview the
              first message and edit the opening line. You queue the campaign. The worker sends
              inside the daily cap and business-hours window. The recipient replies; the sequence
              stops immediately and every later message for that lead becomes skipped. Nothing else
              is sent to them automatically.
            </div>

            <ul className={styles.miniList}>
              <li>New accounts ramp from 5 to 20 invitations a day, with a ceiling of 20.</li>
              <li>Gaps are randomised from 45 to 180 seconds; weekdays only, 07:00–19:00 UTC.</li>
              <li>Pausing the account or the campaign halts the queue before the next send.</li>
              <li>Unanswered invitations are withdrawn after 21 days.</li>
              <li>
                Automated messaging may breach LinkedIn&apos;s User Agreement. The controls reduce
                risk; they do not make automation permitted.
              </li>
            </ul>
          </section>

          <section className={styles.docSection} aria-labelledby="costs-title">
            <h2 id="costs-title">What each stage costs.</h2>
            <p className={styles.docLead}>
              Credits are charged when you claim a lead, not when the engine scans. A workspace gets
              10 free claims, then each claim costs 1 credit. A 100-credit pack is USD 49 by default,
              and the server can configure another pack size or price.
            </p>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <caption>
                  Credit cost and the non-credit limit at each stage. No subscription is involved.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Stage</th>
                    <th scope="col">What happens</th>
                    <th scope="col">Credit cost</th>
                    <th scope="col">Other limit</th>
                  </tr>
                </thead>
                <tbody>
                  {STAGE_COSTS.map((row) => (
                    <tr key={row.stage}>
                      <td>{row.stage}</td>
                      <td>{row.work}</td>
                      <td>{row.credits}</td>
                      <td>{row.limits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <aside className={styles.callout}>
              <strong>Scanning does not spend credits.</strong> A scan is limited by each source&apos;s
              daily quota and by the adapters you enabled, not by your credit balance. Credits are
              spent only when a paid claim is recorded, and the ledger refuses to go negative.
            </aside>
          </section>

          <section className={styles.docSection} aria-labelledby="not-title">
            <h2 id="not-title">What the workflow will not do.</h2>
            <div className={styles.prose}>
              <ul>
                <li>
                  It will not invent a name, email, phone number or company result. Without an
                  enrichment provider, a lead carries a role and a search link.
                </li>
                <li>
                  It will not promise a signal for every company. A quiet company, an unlisted
                  careers page or a region outside your Maps query can produce nothing.
                </li>
                <li>
                  It will not turn a by-hand signal into an automatic one. The label means the
                  evidence is gathered outside the adapters, with no staffed-research promise.
                </li>
                <li>
                  It will not claim, send or top up without an action. The MCP instructions tell a
                  model to ask first.
                </li>
              </ul>
            </div>

            <div className={styles.pager}>
              <Link href="/integrations">Next: integration reference</Link>
              <Link href="/trust">Trust and data notes</Link>
            </div>
          </section>
        </div>
      </main>

      <MktFooter />
    </div>
  );
}

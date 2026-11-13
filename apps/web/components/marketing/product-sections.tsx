import Link from "next/link";
import * as React from "react";

import { PipelineDiagram } from "./pipeline-diagram";
import styles from "./sections-styles.module.css";

export const SIGNAL_CATEGORIES = [
  { name: "Asking now", blurb: "Someone describing the problem in public" },
  { name: "Hiring", blurb: "A role that signals a new priority" },
  { name: "New leaders", blurb: "A first ninety days with a budget" },
  { name: "Growing", blurb: "Funding, expansion, a new market" },
  { name: "Website and tools", blurb: "A stack that just changed" },
  { name: "Events", blurb: "A room your buyer will be in" },
  { name: "Local businesses", blurb: "A location with a real reason" },
  { name: "Already knows you", blurb: "Warm, and easy to miss" },
] as const;

export const FAQ_ITEMS = [
  {
    question: "Does it message people for me?",
    answer:
      "Only if you turn it on. Sending is off and preview-only when a workspace is created. When you enable outreach it runs from your own LinkedIn account, paced like a person, inside business hours, and it stops the moment someone replies. Nothing is claimed, sent or charged on your behalf before that.",
  },
  {
    question: "What does it cost?",
    answer:
      "The first 10 leads are free and need no card. After that, one credit claims one lead, and 100 credits cost $49 — about 49 cents a lead. Reading, filtering and rescanning cost nothing. Credits do not expire and there is no subscription.",
  },
  {
    question: "What do I actually get?",
    answer:
      "A short case file per lead: the reason in one sentence, the source and its date, how old the clue is, why the company matches what you sell, the person's role, and a message written from that clue. Enough to decide in under a minute and enough to defend the decision to a colleague.",
  },
  {
    question: "Are the emails and phone numbers verified?",
    answer:
      "Not by default, and we will not pretend otherwise. Names appear only when a public source states them. Email and phone appear only when an enrichment provider returned them. Without one, a lead carries a role, a profile link and an unverified label rather than an invented address.",
  },
  {
    question: "Where does the evidence come from?",
    answer:
      "Public material: company news and careers pages, discussion forums, review sites, local listings and social pages. Coverage varies by company, region and category, and some sources are unavailable in some markets. A quiet company can produce nothing this week; that is a real answer, not a failure to hide.",
  },
  {
    question: "What if a lead is wrong for me?",
    answer:
      "Mark it not a fit. It leaves your queue, your note stays on the record, and the reason informs the next round of matches. You are never asked to defend a lead you did not want.",
  },
  {
    question: "Can my own agent use it?",
    answer:
      "Yes. The same leads, credits and approvals are available to Claude, Codex, Cursor or your own automation, under your workspace and your permissions. An agent still cannot claim a lead or send a message without your explicit approval.",
  },
  {
    question: "Will it work in a narrow market?",
    answer:
      "Sometimes, and sometimes slowly. Niche categories and small regions have less public activity to find. We would rather return six defensible leads than forty rows you have to filter. If your market is quiet, the product says so.",
  },
] as const;

export function ProductSections() {
  return (
    <div className={styles.sectionsRoot}>
      <section id="how-it-works" className={styles.section} aria-labelledby="home-workflow-title">
        <header className={styles.sectionHead}>
          <p className={styles.eyebrow}>How it works</p>
          <h2 id="home-workflow-title" className={styles.sectionTitle}>
            See the reason. Keep the decision.
          </h2>
          <p className={styles.sectionLede}>
            Most tools sell you rows. LetMeLead sells you a case for the conversation: what changed,
            when it changed, and why it matters to what you sell. The last move — claim, send, wait —
            stays with you.
          </p>
        </header>

        <PipelineDiagram />

        <ol className={styles.workflow}>
          <li className={styles.step}>
            <div className={styles.stepRail} aria-hidden="true">
              <span className={styles.stepNumber}>01</span>
              <span className={styles.stepLine} />
            </div>
            <div className={styles.stepBody}>
              <div className={styles.stepText}>
                <p className={styles.stepKicker}>Collect</p>
                <h3 className={styles.stepTitle}>Evidence, not a list of strangers.</h3>
                <p className={styles.stepCopy}>
                  Point us at what you sell. We watch the public moments that change a company&apos;s
                  priorities — a funding round, a first sales leader, a cluster of hires, a launch, a
                  complaint in a review thread — and keep the source and the date attached to every
                  one. No scraped roster, no guessed intent.
                </p>
              </div>
              <aside className={styles.stepAside} aria-label="The kinds of moments we watch">
                <p className={styles.asideLabel}>Moments worth a message</p>
                <ul className={styles.sourceMini}>
                  {SIGNAL_CATEGORIES.slice(0, 6).map((category) => (
                    <li key={category.name} className={styles.sourceMiniItem}>
                      {category.name}
                    </li>
                  ))}
                </ul>
                <ul className={`${styles.factList} ${styles.stepAsideFacts}`}>
                  <li className={styles.fact}>
                    <span className={styles.factLabel}>Every clue keeps</span>
                    <span className={styles.factValue}>Its source and date</span>
                  </li>
                  <li className={styles.fact}>
                    <span className={styles.factLabel}>Freshness</span>
                    <span className={styles.factValue}>Old news ranks lower</span>
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
                <h3 className={styles.stepTitle}>A reason beats a filter.</h3>
                <p className={styles.stepCopy}>
                  A job title is not a buying signal until it collides with what you sell. Every clue
                  is checked against the buyer you described, weighted by how recent it is, and
                  de-duplicated so one real-world event stays one lead. A weak fit is shown as a weak
                  fit — never quietly promoted to fill a quota.
                </p>
              </div>
              <aside className={styles.stepAside} aria-label="What qualification looks at">
                <p className={styles.asideLabel}>What we weigh</p>
                <ul className={styles.factList}>
                  <li className={styles.fact}>
                    <span className={styles.factLabel}>Your buyer</span>
                    <span className={styles.factValue}>Not a keyword list</span>
                  </li>
                  <li className={styles.fact}>
                    <span className={styles.factLabel}>The moment</span>
                    <span className={styles.factValue}>What actually changed</span>
                  </li>
                  <li className={styles.fact}>
                    <span className={styles.factLabel}>Age</span>
                    <span className={styles.factValue}>Fresh beats stale</span>
                  </li>
                  <li className={styles.fact}>
                    <span className={styles.factLabel}>Verdict</span>
                    <span className={styles.factValue}>Shown, not hidden</span>
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
                <h3 className={styles.stepTitle}>The receipt comes before the lead.</h3>
                <p className={styles.stepCopy}>
                  Open a lead and the first thing you see is why it exists: the clue, the source, the
                  date, the line that connects it to your offer. Then the person, with their role
                  first. Then a draft written from that clue — not a template with the company name
                  swapped in.
                </p>
              </div>
              <aside className={styles.stepAside} aria-label="What a lead dossier contains">
                <p className={styles.asideLabel}>Inside a lead</p>
                <ul className={styles.reviewStack}>
                  <li className={styles.reviewRow}>
                    <p>
                      <strong>Why now</strong>
                      <span>One sentence you could say out loud on a call.</span>
                    </p>
                  </li>
                  <li className={styles.reviewRow}>
                    <p>
                      <strong>The receipt</strong>
                      <span>Source, link and publish date for every clue.</span>
                    </p>
                  </li>
                  <li className={styles.reviewRow}>
                    <p>
                      <strong>The person</strong>
                      <span>Role first. Verified details only when found.</span>
                    </p>
                  </li>
                  <li className={styles.reviewRow}>
                    <p>
                      <strong>The first line</strong>
                      <span>Grounded in the clue, and yours to rewrite.</span>
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
                <p className={styles.stepKicker}>Decide</p>
                <h3 className={styles.stepTitle}>Nothing leaves without you.</h3>
                <p className={styles.stepCopy}>
                  Claiming a lead, spending a credit and sending a message are three separate
                  decisions, and each one needs your hand on it. Send it yourself, or switch on
                  paced outreach from your own account. Either way it stops the moment someone
                  replies — and it never starts on its own.
                </p>
              </div>
              <aside className={styles.stepAside} aria-label="Sending defaults">
                <p className={styles.asideLabel}>The defaults</p>
                <ul className={styles.factList}>
                  <li className={styles.fact}>
                    <span className={styles.factLabel}>Auto-send</span>
                    <span className={styles.factValue}>Never</span>
                  </li>
                  <li className={styles.fact}>
                    <span className={styles.factLabel}>Free claims</span>
                    <span className={styles.factValue}>10</span>
                  </li>
                  <li className={styles.fact}>
                    <span className={styles.factLabel}>Credits spent on</span>
                    <span className={styles.factValue}>Claims only</span>
                  </li>
                  <li className={styles.fact}>
                    <span className={styles.factLabel}>On a reply</span>
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
          <p className={styles.eyebrow}>What we watch</p>
          <h2 id="home-signals-title" className={styles.sectionTitle}>
            The signals most teams find three weeks late.
          </h2>
          <p className={styles.sectionLede}>
            Timing is the whole advantage. A company that just hired its first security lead is
            easier to help than one picked off a list in March — if you know this week. These are the
            moments worth a message.
          </p>
        </header>

        <div className={styles.categoryGrid} aria-label="Signal categories">
          {SIGNAL_CATEGORIES.map((category) => (
            <div key={category.name} className={styles.categoryItem}>
              <span className={styles.categoryName}>{category.name}</span>
              <span className={styles.categoryCount}>{category.blurb}</span>
            </div>
          ))}
        </div>

        <aside className={styles.honesty}>
          <p>
            <strong>A signal is a reason to talk, not a promise to buy.</strong> It shows a moment:
            a new budget owner, a system under strain, a decision coming into view. The product never
            dresses a coincidence up as intent, and an empty week is reported as an empty week.
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
              The quiet defaults are the feature: no live sending, no automatic claims, no session
              handed to anyone else. Every movement is either your action or a row you can inspect.
            </p>
            <ul className={styles.inlineLinks}>
              <li>
                <Link href="#limitations">Read where it stops</Link>
              </li>
            </ul>
          </div>

          <ul className={styles.controlList}>
            <li className={styles.controlItem}>
              <p className={styles.controlTerm}>You pay per lead, not per seat</p>
              <p className={styles.controlCopy}>
                10 free claims, then <strong>one credit per claimed lead</strong>. 100 credits are{" "}
                <strong>$49</strong> — about 49 cents a lead. Reading, filtering and rescanning are
                free, so a quiet week costs you nothing.
              </p>
            </li>
            <li className={styles.controlItem}>
              <p className={styles.controlTerm}>Nothing is claimed for you</p>
              <p className={styles.controlCopy}>
                A claim is a human decision. Your dashboard, your agent and the API all stop at the
                same approval, so a model cannot spend your credits to look busy.
              </p>
            </li>
            <li className={styles.controlItem}>
              <p className={styles.controlTerm}>Your account, your identity</p>
              <p className={styles.controlCopy}>
                Outreach runs from the LinkedIn account you connect, not a shared pool of rented
                profiles. Your session stays on your side and is never returned to the interface.
              </p>
            </li>
            <li className={styles.controlItem}>
              <p className={styles.controlTerm}>Sending is off until you say otherwise</p>
              <p className={styles.controlCopy}>
                Preview-only by default. When you switch it on, the pace starts slow, stays inside
                business hours, leaves a human gap between actions and withdraws an unanswered
                invitation after three weeks.
              </p>
            </li>
            <li className={styles.controlItem}>
              <p className={styles.controlTerm}>Every action leaves a receipt</p>
              <p className={styles.controlCopy}>
                Claims, sends, pauses and credit movements are recorded with who did them and when.
                Hand the record to your team, or to a client, without reconstructing it from memory.
              </p>
            </li>
          </ul>
        </div>
      </section>

      <section id="integrations" className={styles.section} aria-labelledby="home-integrations-title">
        <header className={styles.sectionHead}>
          <p className={styles.eyebrow}>Built for agents, too</p>
          <h2 id="home-integrations-title" className={styles.sectionTitle}>
            Your agent can do the work. It still asks before it spends.
          </h2>
          <p className={styles.sectionLede}>
            Claude, Codex, Cursor or your own automation can read the leads, filter the watchlist and
            draft the message. The credits, the approvals and the audit trail stay exactly where they
            are in the dashboard.
          </p>
        </header>

        <div className={styles.integrationGrid}>
          <div>
            <ul className={styles.integrationFacts}>
              <li className={styles.integrationFact}>
                <span>Works with</span>
                <strong>Claude, Codex, Cursor</strong>
              </li>
              <li className={styles.integrationFact}>
                <span>Sees</span>
                <strong>Your workspace, your leads</strong>
              </li>
              <li className={styles.integrationFact}>
                <span>Before a claim</span>
                <strong>Asks you first</strong>
              </li>
              <li className={styles.integrationFact}>
                <span>Before a send</span>
                <strong>Asks you first</strong>
              </li>
            </ul>
            <ul className={styles.inlineLinks}>
              <li>
                <Link href="/signup">Try it with your agent</Link>
              </li>
            </ul>
          </div>

          <div>
            <p className={styles.codeCaption}>One connection, then plain language</p>
            <ul className={styles.sourceMini}>
              <li className={styles.sourceMiniItem}>“Find this week&apos;s strongest leads for Q4.”</li>
              <li className={styles.sourceMiniItem}>“Why is this company in my queue?”</li>
              <li className={styles.sourceMiniItem}>“Draft the first line, do not send it.”</li>
              <li className={styles.sourceMiniItem}>“Mark this one not a fit, with my reason.”</li>
            </ul>
          </div>
        </div>
      </section>

      <section id="limitations" className={styles.section} aria-labelledby="home-limitations-title">
        <header className={styles.sectionHead}>
          <p className={styles.eyebrow}>Where it stops</p>
          <h2 id="home-limitations-title" className={styles.sectionTitle}>
            The edges are part of the product.
          </h2>
          <p className={styles.sectionLede}>
            A signal is a dated clue, not a purchase order. Saying where the evidence ends is more
            useful than pretending the coverage is complete.
          </p>
        </header>

        <div className={styles.limitations}>
          <article className={styles.limitation}>
            <span className={styles.limitationLabel}>No fabricated data</span>
            <p className={styles.limitationCopy}>
              No invented names, emails, companies or results. If a source did not state a name, the
              lead carries a role and a profile link. If no provider returned an address, the contact
              stays unverified.
            </p>
          </article>
          <article className={styles.limitation}>
            <span className={styles.limitationLabel}>Coverage varies</span>
            <p className={styles.limitationCopy}>
              A quiet company, a private careers page or an unsupported region can produce nothing.
              An empty result is not evidence that the company has no reason to buy — it is evidence
              that nothing public was found.
            </p>
          </article>
          <article className={styles.limitation}>
            <span className={styles.limitationLabel}>Timing is not intent</span>
            <p className={styles.limitationCopy}>
              A funding round, a new hire or a bad review shows a moment, not a budget. Fit is a
              judgement with evidence attached; it is not a prediction that anyone will reply.
            </p>
          </article>
          <article className={styles.limitation}>
            <span className={styles.limitationLabel}>Automation carries platform risk</span>
            <p className={styles.limitationCopy}>
              Automated messaging may breach LinkedIn&apos;s terms. Pacing and reply-stops reduce the
              risk; they do not make automation permitted. Decide deliberately for your own account.
            </p>
          </article>
        </div>
      </section>

      <section id="faq" className={styles.section} aria-labelledby="home-faq-title">
        <header className={styles.sectionHead}>
          <p className={styles.eyebrow}>Questions</p>
          <h2 id="home-faq-title" className={styles.sectionTitle}>
            The answers you would want before paying.
          </h2>
          <p className={styles.sectionLede}>
            Short, specific, and without the marketing gloss. Open a question for the detail.
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
            Get 10 free leads
          </Link>
          <Link href="/how-it-works" className={`${styles.btn} ${styles.btnLarge}`}>
            Read the full workflow
          </Link>
        </div>
      </section>
    </div>
  );
}

import Link from "next/link";
import * as React from "react";

import { CountUp } from "./count-up";
import { Reveal } from "./reveal";
import styles from "./landing-sections.module.css";

const FACTS = [
  { value: 10, suffix: "", label: "free leads", note: "no card, no subscription" },
  { value: 49, suffix: "¢", label: "per claimed lead", note: "100 credits for $49, never expire" },
  { value: 0, suffix: "", label: "messages sent for you", note: "until you confirm each one" },
  { value: 1, suffix: "", label: "sentence of why", note: "the reason, not just the name" },
] as const;

export function ProofBand() {
  return (
    <section className={styles.proof} aria-label="What the product is made of">
      <div className={styles.proofInner}>
        {FACTS.map((fact) => (
          <div key={fact.label} className={styles.proofCell}>
            <span className={styles.proofValue}>
              <CountUp value={fact.value} suffix={fact.suffix} />
            </span>
            <span className={styles.proofLabel}>{fact.label}</span>
            <span className={styles.proofNote}>{fact.note}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

const AUDIENCES = [
  {
    id: "security",
    kicker: "Security and compliance",
    title: "The audit is already on the calendar.",
    copy: "A first security hire, a SOC 2 responsibility in a job description, a review complaint on a public feed. You arrive with the reason attached, not a generic pitch.",
    signal: "Hiring signal · Compliance in scope",
    offer: "What you would send: a checklist for the review they are about to run.",
  },
  {
    id: "revenue",
    kicker: "Revenue and GTM",
    title: "The team just changed shape.",
    copy: "New sales leadership, a cluster of SDR requisitions, a funding round with a hiring plan. The buying committee is forming; the budget conversation is already happening.",
    signal: "Leadership change · New CRO",
    offer: "What you would send: a note about the first ninety days, not a demo request.",
  },
  {
    id: "agency",
    kicker: "Agencies and studios",
    title: "A reason to knock this week.",
    copy: "Watch the accounts you want to win and see which one has a public reason to talk now. Claim the ones worth your time; leave the rest.",
    signal: "Vendor switch · Public request",
    offer: "What you would send: a specific observation with the link to prove it.",
  },
] as const;

export function Audiences() {
  return (
    <section className={styles.audiences} id="who" aria-labelledby="who-title">
      <div className={styles.inner}>
        <header className={styles.head}>
          <p className={styles.eyebrow}>Who it is for</p>
          <h2 id="who-title" className={styles.title}>
            One watchlist. Three ways it pays.
          </h2>
          <p className={styles.lede}>
            The evidence does not know your category — your brief does. Describe the moment that makes
            your offer relevant, and the same clue becomes a different conversation.
          </p>
        </header>

        <div className={styles.audienceGrid}>
          {AUDIENCES.map((audience, index) => (
            <Reveal key={audience.id} delay={index * 0.06}>
              <article className={styles.audience}>
                <p className={styles.audienceKicker}>{audience.kicker}</p>
                <h3 className={styles.audienceTitle}>{audience.title}</h3>
                <p className={styles.audienceCopy}>{audience.copy}</p>
                <p className={styles.audienceSignal}>
                  <span aria-hidden="true">↳</span> {audience.signal}
                </p>
                <p className={styles.audienceOffer}>{audience.offer}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const COMPARISON = [
  {
    question: "Why this company",
    list: "Matches a filter you wrote six months ago.",
    dossier: "A public event changed something this quarter.",
  },
  {
    question: "Why now",
    list: "Nothing. The list does not know what week it is.",
    dossier: "A dated signal, with the age shown on the lead.",
  },
  {
    question: "Proof you can check",
    list: "A job title and a guessed email.",
    dossier: "An evidence timeline: title, source, URL, publish date.",
  },
  {
    question: "Who to contact",
    list: "Whoever the database had.",
    dossier: "The role first. A name only when a source stated it.",
  },
  {
    question: "What you spend",
    list: "Seats, credits and enrichment on every row.",
    dossier: "10 free leads, then 49¢ per claimed lead. Reading is free.",
  },
  {
    question: "What happens next",
    list: "A sequence starts firing.",
    dossier: "A draft waits for you. Sending is off by default.",
  },
] as const;

export function Compare() {
  return (
    <section className={styles.compare} id="compare" aria-labelledby="compare-title">
      <div className={styles.inner}>
        <header className={styles.head}>
          <p className={styles.eyebrow}>The difference</p>
          <h2 id="compare-title" className={styles.title}>
            A list of names is not a case for the conversation.
          </h2>
          <p className={styles.lede}>
            Both arrive as rows in a table. Only one of them can answer the question you will actually be
            asked: why this company, and why this week?
          </p>
        </header>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className={styles.caption}>
              A scraped contact list compared with a LetMeLead lead dossier.
            </caption>
            <thead>
              <tr>
                <th scope="col">What you need to know</th>
                <th scope="col">A scraped list</th>
                <th scope="col" className={styles.dossierColumn}>
                  A LetMeLead dossier
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row) => (
                <tr key={row.question}>
                  <th scope="row">{row.question}</th>
                  <td className={styles.listCell}>{row.list}</td>
                  <td className={styles.dossierCell}>{row.dossier}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.compareFoot}>
          <p>
            The honest version: evidence shows timing, not intent. Some companies will have nothing
            public this month, and the product says so instead of inventing a reason.
          </p>
          <Link href="/how-it-works" className={styles.textLink}>
            See how the engine decides
          </Link>
        </div>
      </div>
    </section>
  );
}

"use client";

import { ArrowRight, BriefcaseBusiness, ChevronDown, CircleHelp, FileText, LockKeyhole, Shield, Target, UserRound } from "lucide-react";
import { MotionConfig, motion, useReducedMotion } from "motion/react";
import * as React from "react";

import { DEMO_AUDIENCES, SAMPLE_DISCLOSURE, SAMPLE_DOSSIERS, type DemoAudienceId } from "./landing-data";
import styles from "./demo-styles.module.css";
import { Spotlight } from "./spotlight";

const AUDIENCE_ICONS = { security: Shield, revenue: Target, agency: BriefcaseBusiness };

export function ProductDemo() {
  const id = React.useId();
  const shouldReduceMotion = useReducedMotion();
  const [selection, setSelection] = React.useState<{ audience: DemoAudienceId; changed: boolean }>({
    audience: "security",
    changed: false,
  });
  const dossier = SAMPLE_DOSSIERS[selection.audience];
  const audienceLabel = DEMO_AUDIENCES.find((audience) => audience.id === selection.audience)!.label;

  return (
    <MotionConfig reducedMotion="user">
      <section id="demo" className={styles["demo-section"]} aria-labelledby={`${id}-title`}>
        <header className={styles["demo-heading"]}>
          <p className={styles["demo-eyebrow"]}>The evidence desk</p>
          <h2 id={`${id}-title`}>A signal. A reason. A draft.</h2>
          <p className={styles["demo-intro"]}>
            Pick an audience. Follow one illustrative lead from a clear brief to a message worth reviewing.
          </p>
        </header>

        <Spotlight className={styles["demo-workbench"]}>
          <div className={styles["demo-toolbar"]}>
            <fieldset className={styles["demo-audiences"]} aria-describedby={`${id}-audience-hint`}>
              <legend>Choose an audience</legend>
              <div className={styles["demo-audience-options"]}>
                {DEMO_AUDIENCES.map((audience) => {
                  const Icon = AUDIENCE_ICONS[audience.id];
                  return (
                    <label
                      key={audience.id}
                      className={styles["demo-audience-option"]}
                      data-selected={selection.audience === audience.id}
                    >
                      <input
                        type="radio"
                        name={`${id}-audience`}
                        value={audience.id}
                        checked={selection.audience === audience.id}
                        aria-controls={`${id}-dossier`}
                        onChange={() => setSelection({ audience: audience.id, changed: true })}
                      />
                      <Icon size={16} aria-hidden="true" />
                      <span>{audience.label}</span>
                    </label>
                  );
                })}
              </div>
              <p id={`${id}-audience-hint`} className={styles["demo-hint"]}>
                Switch to change the whole example.
              </p>
            </fieldset>
            <span className={styles["demo-sample-label"]}>Illustrative sample</span>
          </div>

          <p className={styles["demo-sr-only"]} role="status" aria-live="polite" aria-atomic="true">
            {selection.changed
              ? `${audienceLabel} sample selected. Brief, signal, fit, contact, evidence and draft updated together for ${dossier.company.name}. Nothing is sent.`
              : "Security sample shown. This is an illustrative workflow; nothing is sent."}
          </p>

          <motion.article
            key={selection.audience}
            id={`${id}-dossier`}
            aria-label={`${dossier.company.name} sample dossier`}
            data-demo-audience={selection.audience}
            initial={selection.changed && shouldReduceMotion === false ? { opacity: 0.72 } : false}
            animate={{ opacity: 1 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.18, ease: "easeOut" }}
          >
            <div className={styles["demo-brief"]}>
              <div>
                <label htmlFor={`${id}-brief`} className={styles["demo-step"]}>
                  <span aria-hidden="true">01</span> Sample audience brief
                </label>
                <p className={styles["demo-offer"]}>{dossier.offer}</p>
                <p className={styles["demo-hint"]} id={`${id}-brief-hint`}>
                  Read-only example, not a search form.
                </p>
              </div>
              <textarea
                id={`${id}-brief`}
                className={styles["demo-brief-input"]}
                value={dossier.brief}
                readOnly
                rows={3}
                aria-describedby={`${id}-brief-hint`}
              />
            </div>

            <header className={styles["demo-company"]}>
              <div className={styles["demo-company-identity"]}>
                <span className={styles["demo-monogram"]} aria-hidden="true">{dossier.company.initials}</span>
                <div>
                  <p className={styles["demo-company-label"]}>Sample dossier</p>
                  <h3>{dossier.company.name}</h3>
                  <p className={styles["demo-company-meta"]}>
                    <span>{dossier.company.domain}</span>
                    <span aria-hidden="true"> / </span>
                    <span>{dossier.company.description}</span>
                  </p>
                </div>
              </div>
              <span className={styles["demo-review-label"]}>For human review</span>
            </header>

            <div className={styles["demo-review-grid"]}>
              <div className={styles["demo-reasoning"]}>
                <section aria-labelledby={`${id}-signal`} className={styles["demo-signal"]}>
                  <div className={styles["demo-step-row"]}>
                    <p className={styles["demo-step"]}><span aria-hidden="true">02</span> Sample signal</p>
                    <time dateTime={dossier.signal.publishedOn}>{dossier.signal.publishedLabel}</time>
                  </div>
                  <p className={styles["demo-signal-kind"]}>{dossier.signal.kind}</p>
                  <h4 id={`${id}-signal`}>{dossier.signal.title}</h4>
                  <p className={styles["demo-body"]}>{dossier.signal.description}</p>
                </section>

                <section aria-labelledby={`${id}-fit`} className={styles["demo-fit"]}>
                  <p className={styles["demo-step"]}><span aria-hidden="true">03</span> Fit reasoning</p>
                  <h4 id={`${id}-fit`}>Why this might fit</h4>
                  <dl className={styles["demo-fit-list"]}>
                    {dossier.fit.map((reason) => (
                      <div key={reason.evidenceId} className={styles["demo-fit-item"]}>
                        <ArrowRight size={15} aria-hidden="true" />
                        <div>
                          <dt>{reason.label}</dt>
                          <dd>{reason.reasoning}</dd>
                        </div>
                      </div>
                    ))}
                  </dl>
                </section>

                <section aria-labelledby={`${id}-contact`} className={styles["demo-contact"]}>
                  <p className={styles["demo-step"]}><span aria-hidden="true">04</span> Unverified sample contact</p>
                  <div className={styles["demo-contact-identity"]}>
                    <UserRound size={20} aria-hidden="true" />
                    <div>
                      <h4 id={`${id}-contact`}>{dossier.contact.name}</h4>
                      <p className={styles["demo-contact-role"]}>{dossier.contact.role}</p>
                      <p className={styles["demo-contact-email"]}>{dossier.contact.email}</p>
                    </div>
                  </div>
                  <p className={styles["demo-hint"]}>{dossier.contact.caveat}</p>
                </section>

                <aside className={styles["demo-uncertainty"]} aria-label="What still needs checking">
                  <CircleHelp size={17} aria-hidden="true" />
                  <div>
                    <p className={styles["demo-uncertainty-title"]}>Still to check</p>
                    <p>{dossier.uncertainty}</p>
                  </div>
                </aside>
              </div>

              <section className={styles["demo-draft"]} aria-labelledby={`${id}-draft`}>
                <div className={styles["demo-draft-heading"]}>
                  <p className={styles["demo-step"]}><span aria-hidden="true">05</span> Draft message</p>
                  <span className={styles["demo-draft-label"]}>Sample draft</span>
                </div>
                <h4 id={`${id}-draft`}>Start a conversation, not a pitch.</h4>
                <p className={styles["demo-draft-intro"]}>A question grounded in the signal, with room to be wrong.</p>
                <div className={styles["demo-message"]}>
                  <dl className={styles["demo-message-subject"]}>
                    <dt>Subject</dt>
                    <dd>{dossier.draft.subject}</dd>
                  </dl>
                  <div className={styles["demo-message-body"]}>
                    {dossier.draft.body.split("\n\n").map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                  </div>
                </div>
                <p className={styles["demo-draft-safety"]}>
                  <LockKeyhole size={15} aria-hidden="true" />
                  Review-only sample. No send action or delivery check.
                </p>
              </section>
            </div>

            <details className={styles["demo-evidence"]}>
              <summary>
                <span className={styles["demo-evidence-summary"]}>
                  <FileText size={17} aria-hidden="true" />
                  <span>Inspect sample evidence</span>
                </span>
                <span className={styles["demo-evidence-count"]}>{dossier.evidence.length} invented sources</span>
                <ChevronDown className={styles["demo-evidence-chevron"]} size={18} aria-hidden="true" />
              </summary>
              <div className={styles["demo-evidence-content"]}>
                <p className={styles["demo-evidence-disclosure"]}>
                  Illustrative excerpts, not fetched pages. Reserved .example addresses are shown as text, not working links.
                </p>
                <ol className={styles["demo-evidence-list"]}>
                  {dossier.evidence.map((evidence) => (
                    <li key={evidence.id} className={styles["demo-evidence-source"]}>
                      <p className={styles["demo-evidence-meta"]}>
                        {evidence.kind} <span aria-hidden="true"> / </span>
                        <time dateTime={evidence.publishedOn}>{evidence.publishedLabel}</time>
                      </p>
                      <h4>{evidence.title}</h4>
                      <p className={styles["demo-source-address"]}>{evidence.sourceUrl}</p>
                      <blockquote>{evidence.excerpt}</blockquote>
                      <p className={styles["demo-evidence-support"]}>{evidence.supports}</p>
                    </li>
                  ))}
                </ol>
              </div>
            </details>
          </motion.article>

          <p className={styles["demo-disclosure"]}>{SAMPLE_DISCLOSURE}</p>
        </Spotlight>
      </section>
    </MotionConfig>
  );
}

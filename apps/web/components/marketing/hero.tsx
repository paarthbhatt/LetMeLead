"use client";

import * as React from "react";

import { EvidenceScene } from "./evidence-scene";
import visuals from "./visuals.module.css";

const STAGES = [
  {
    id: 0,
    label: "Collect",
    detail:
      "Public moments — a funding round, a first sales hire, a launch, a complaint — collected with their source and their date. Nothing arrives without a receipt.",
  },
  {
    id: 1,
    label: "Qualify",
    detail:
      "Every clue is weighed against the buyer you described and against how recent it is. Weak fits are labelled weak instead of quietly dropped to make the queue look full.",
  },
  {
    id: 2,
    label: "Review",
    detail:
      "The reason, the source, the date, the person's role and a first line you can rewrite. Enough to decide in under a minute — and enough to defend the decision to a colleague.",
  },
] as const;

type Stage = (typeof STAGES)[number]["id"];

export function Hero() {
  const [stage, setStage] = React.useState<Stage>(0);
  const detailId = React.useId();
  const active = STAGES[stage];

  return (
    <section className={`mkt-hero ${visuals.heroTexture}`} aria-labelledby="hero-title">
      <div className="mkt-wrap mkt-hero-grid">
        <div className="mkt-hero-copy">
          <p className="mkt-eyebrow">Buying signals, with receipts</p>
          <h1 id="hero-title">
            Know who is ready to buy. See <em>the proof</em>.
          </h1>
          <p className="mkt-hero-lede">
            Most lists tell you who exists. LetMeLead tells you who has a reason to talk this week —
            and shows you the receipt. Every lead arrives with the moment behind it, the source, the
            date and the first line you could send.
          </p>
          <div className="mkt-hero-actions">
            <a className="mkt-btn" data-tone="solid" data-size="lg" href="/signup">
              Get 10 free leads
            </a>
            <a className="mkt-btn" data-size="lg" href="#demo">
              Open a sample dossier
            </a>
          </div>
          <p className="mkt-hero-note">
            No card. Scans and review cost nothing; a claim is the only thing that uses a credit. Nothing
            is sent until you confirm it.
          </p>
        </div>

        <div className="mkt-hero-instrument">
          <figure className="mkt-instrument">
            <EvidenceScene stage={stage} />
            <div className="mkt-instrument-controls">
              <div className="mkt-stages" role="tablist" aria-label="Evidence stages">
                {STAGES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={stage === item.id}
                    aria-controls={detailId}
                    className="mkt-stage"
                    onClick={() => setStage(item.id)}
                    data-active={stage === item.id}
                  >
                    <span className="mkt-stage-index" aria-hidden="true">
                      {item.id + 1}
                    </span>
                    {item.label}
                  </button>
                ))}
              </div>
              <p id={detailId} className="mkt-instrument-note" aria-live="polite">
                {active.detail}
              </p>
            </div>
          </figure>
          <p className="mkt-instrument-caption">
            The instrument is illustrative: raw evidence becoming a reviewable lead. No customer data
            is shown.
          </p>
        </div>
      </div>
    </section>
  );
}

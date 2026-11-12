"use client";

import * as React from "react";

import { EvidenceScene } from "./evidence-scene";

const STAGES = [
  {
    id: 0,
    label: "Collect",
    detail:
      "Seven adapters collect dated public evidence — company job boards, news, Reddit, X, Google Maps, Facebook pages and review feeds. 51 signals across 8 categories.",
  },
  {
    id: 1,
    label: "Qualify",
    detail:
      "Events are de-duplicated per real-world event, decayed by age and scored against your brief. With an LLM key configured it is qualified semantically; otherwise lexical heuristics — never a silent rejection.",
  },
  {
    id: 2,
    label: "Review",
    detail:
      "You get a dossier you can audit: the reason, the source URL, how old the evidence is, fit confidence, contact routes and a draft grounded in that signal. Nothing is queued until you say so.",
  },
] as const;

type Stage = (typeof STAGES)[number]["id"];

export function Hero() {
  const [stage, setStage] = React.useState<Stage>(0);
  const detailId = React.useId();
  const active = STAGES[stage];

  return (
    <section className="mkt-hero" aria-labelledby="hero-title">
      <div className="mkt-wrap mkt-hero-grid">
        <div>
          <p className="mkt-eyebrow">Buying-signal leads, with the evidence attached</p>
          <h1 id="hero-title">
            Know who is ready to buy. See <em>why</em>.
          </h1>
          <p className="mkt-hero-lede">
            LetMeLead watches public evidence of change at your target companies, qualifies it against your
            brief, and hands you the decision-maker with a dated reason to reach out — not a scraped list.
          </p>
          <div className="mkt-hero-actions">
            <a className="mkt-btn" data-tone="solid" data-size="lg" href="/signup">
              Create a workspace
            </a>
            <a className="mkt-btn" data-size="lg" href="#demo">
              Inspect a sample lead
            </a>
          </div>
          <ul className="mkt-hero-facts">
            <li>
              <strong>51</strong> signals
            </li>
            <li>
              <strong>7</strong> sources
            </li>
            <li>
              <strong>1</strong> credit per claim
            </li>
            <li>
              <strong>10</strong> free leads to start
            </li>
            <li>Reviewed before anything sends</li>
          </ul>
        </div>

        <div>
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
        </div>
      </div>
    </section>
  );
}

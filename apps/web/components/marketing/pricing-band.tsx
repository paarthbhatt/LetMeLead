import * as React from "react";

import { CreditGrid } from "./credit-grid";

/**
 * Real commercials only: 10 free claimed leads per workspace, then one credit
 * per claim, and a default 100-credit pack at USD 49 (configurable server-side).
 */
export function PricingBand() {
  return (
    <section className="mkt-section mkt-pricing" id="pricing" aria-labelledby="pricing-title">
      <div className="mkt-wrap">
        <div className="mkt-pricing-grid">
          <div>
            <p className="mkt-eyebrow">What it costs</p>
            <h2 className="mkt-h2" id="pricing-title">
              You pay for leads you claim. Not for scans, seats or messages.
            </h2>
            <p className="mkt-lede">
              Every workspace starts with ten free claimed leads. After that a claim costs one credit.
              Scans, re-scans, signals, replies and outreach do not consume credits. The default pack is
              100 credits for $49, and the checkout always shows the real amount before you pay.
            </p>
            <CreditGrid total={100} />
            <p className="mkt-small">
              No card is required to set up a workspace. Nothing renews, and credits never expire.
            </p>
          </div>

          <dl className="mkt-price-list">
            <div>
              <dt>Free to start</dt>
              <dd>
                <strong>10</strong> claimed leads
              </dd>
              <p>Brief, scan and review before you spend anything.</p>
            </div>
            <div>
              <dt>Per lead</dt>
              <dd>
                <strong>1</strong> credit
              </dd>
              <p>Charged once, at the moment you claim. Not-fit leads cost nothing.</p>
            </div>
            <div>
              <dt>Credit pack</dt>
              <dd>
                <strong>$49</strong> / 100
              </dd>
              <p>A one-time pack, not a subscription. Unclaimed credits wait for you.</p>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}

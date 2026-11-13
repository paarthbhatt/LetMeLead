import * as React from "react";

import styles from "./visuals.module.css";

const SCATTER = [
  { x: 6, y: 22, d: "0s" },
  { x: 18, y: 62, d: "-1.2s" },
  { x: 31, y: 14, d: "-2.4s" },
  { x: 44, y: 74, d: "-0.6s" },
  { x: 57, y: 32, d: "-3.1s" },
  { x: 70, y: 66, d: "-1.8s" },
  { x: 82, y: 18, d: "-2.7s" },
  { x: 92, y: 54, d: "-0.9s" },
  { x: 12, y: 44, d: "-3.6s" },
  { x: 64, y: 8, d: "-1.5s" },
] as const;

/**
 * One picture of the whole product: public moments flow into a fit check,
 * become a one-page dossier, and stop at a human decision. Motion is CSS
 * only and switches off under reduced-motion.
 */
export function PipelineDiagram() {
  return (
    <figure className={styles.pipeline}>
      <div className={styles.pipeRow}>
        <div className={styles.pipeNode}>
          <div className={styles.pipeArt} aria-hidden="true">
            <div className={styles.signalScatter}>
              {SCATTER.map((dot, index) => (
                <span
                  key={`${dot.x}-${dot.y}`}
                  data-hot={index === 4}
                  style={
                    {
                      "--x": dot.x,
                      "--y": dot.y,
                      "--d": dot.d,
                    } as React.CSSProperties
                  }
                />
              ))}
            </div>
          </div>
          <p className={styles.pipeKicker}>01 · Watch</p>
          <p className={styles.pipeTitle}>Public moments</p>
          <p className={styles.pipeNote}>A hire, a launch, a complaint. Dated, sourced, quiet until it matters.</p>
        </div>

        <div className={styles.pipeLink} aria-hidden="true">
          <span className={styles.pipePacket} />
          <span className={styles.pipePacket} />
        </div>

        <div className={styles.pipeNode}>
          <div className={styles.pipeArt} aria-hidden="true">
            <div className={styles.gate}>
              <span className={styles.gateDot} />
              <span className={styles.gateBar} />
              <span className={styles.gateDot} data-pass="true" />
              <span className={styles.gateBar} />
              <span className={styles.gateDot} />
            </div>
          </div>
          <p className={styles.pipeKicker}>02 · Weigh</p>
          <p className={styles.pipeTitle}>Checked against your buyer</p>
          <p className={styles.pipeNote}>A title is not a signal until it fits who you actually sell to.</p>
        </div>

        <div className={styles.pipeLink} aria-hidden="true">
          <span className={styles.pipePacket} />
          <span className={styles.pipePacket} />
        </div>

        <div className={styles.pipeNode}>
          <div className={styles.pipeArt} aria-hidden="true">
            <div className={styles.miniDossier}>
              <i />
              <i />
              <i />
              <i />
            </div>
          </div>
          <p className={styles.pipeKicker}>03 · Read</p>
          <p className={styles.pipeTitle}>A one-page dossier</p>
          <p className={styles.pipeNote}>Why now, the receipt, the person, the first line.</p>
        </div>

        <div className={styles.pipeLink} aria-hidden="true">
          <span className={styles.pipePacket} />
          <span className={styles.pipePacket} />
        </div>

        <div className={styles.pipeNode}>
          <div className={styles.pipeArt} aria-hidden="true">
            <div className={styles.decide} />
          </div>
          <p className={styles.pipeKicker}>04 · Decide</p>
          <p className={styles.pipeTitle}>You, before anything sends</p>
          <p className={styles.pipeNote}>Claim it, rewrite it, send it or leave it. Nothing moves on its own.</p>
        </div>
      </div>

      <figcaption className={styles.pipeCaption}>
        The same four moves run on real evidence; the drawing just makes the shape obvious.
      </figcaption>
    </figure>
  );
}

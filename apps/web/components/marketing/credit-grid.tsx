"use client";

import * as React from "react";

import styles from "./visuals.module.css";

/**
 * 100 credits, drawn as 100 credits. The first dot is the lead you just
 * claimed; the rest are what a $49 pack actually buys.
 */
export function CreditGrid({ total = 100 }: { total?: number }) {
  const grid = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const node = grid.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        node.dataset.run = "true";
        observer.disconnect();
      },
      { threshold: 0.4 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={styles.creditVisual}>
      <div
        ref={grid}
        className={styles.creditGrid}
        role="img"
        aria-label={`${total} credits: one credit claims one lead, so a pack of ${total} is ${total} claimed leads.`}
      >
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            className={styles.creditDot}
            data-hot={index === 0}
            style={{ "--i": index } as React.CSSProperties}
          />
        ))}
      </div>
      <p className={styles.creditMeta}>
        <span>
          <strong>100 credits</strong> · $49
        </span>
        <span>
          <strong>1</strong> claim = 1 credit
        </span>
      </p>
    </div>
  );
}

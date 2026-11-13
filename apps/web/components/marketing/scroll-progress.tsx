"use client";

import * as React from "react";

import styles from "./visuals.module.css";

/** A two-pixel read-out of how far down the page you are. */
export function ScrollProgress() {
  const bar = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    const update = () => {
      const root = document.documentElement;
      const max = root.scrollHeight - root.clientHeight;
      const progress = max > 8 ? Math.min(1, Math.max(0, root.scrollTop / max)) : 0;
      if (bar.current) bar.current.style.transform = `scaleX(${progress})`;
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div className={styles.progress} aria-hidden="true">
      <span ref={bar} />
    </div>
  );
}

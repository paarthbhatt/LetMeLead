"use client";

import { useReducedMotion } from "motion/react";
import * as React from "react";

/**
 * Counts a number up the first time it is actually on screen. The server
 * renders the final value, so a visitor without JS, or with reduced motion,
 * simply reads the number.
 */
export function CountUp({
  value,
  duration = 850,
  suffix = "",
}: {
  value: number;
  duration?: number;
  suffix?: string;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [shown, setShown] = React.useState(value);
  const reduce = useReducedMotion();

  React.useEffect(() => {
    if (reduce) return;
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    let frame = 0;
    let started = false;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || started) return;
        started = true;
        observer.disconnect();
        const begin = performance.now();
        setShown(0);
        const step = (now: number) => {
          const progress = Math.min(1, (now - begin) / duration);
          const eased = 1 - Math.pow(1 - progress, 3);
          setShown(Math.round(value * eased));
          if (progress < 1) frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
      },
      { threshold: 0.6 },
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, duration, reduce]);

  return (
    <span ref={ref}>
      {shown}
      {suffix}
    </span>
  );
}

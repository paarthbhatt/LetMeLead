"use client";

import * as React from "react";

import styles from "./visuals.module.css";

/**
 * A soft light that follows the pointer across a surface. It is decoration
 * only: no handler is attached until the pointer actually moves, and it
 * never intercepts a click.
 */
export function Spotlight({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const host = React.useRef<HTMLDivElement>(null);

  const onPointerMove = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const element = host.current;
    if (!element || event.pointerType === "touch") return;
    const rect = element.getBoundingClientRect();
    element.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
    element.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
    element.style.setProperty("--spot-on", "1");
  }, []);

  const onPointerLeave = React.useCallback(() => {
    host.current?.style.setProperty("--spot-on", "0");
  }, []);

  return (
    <div
      ref={host}
      className={[styles.spotlight, className].filter(Boolean).join(" ")}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      {children}
    </div>
  );
}

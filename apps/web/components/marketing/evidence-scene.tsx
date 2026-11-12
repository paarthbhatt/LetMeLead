"use client";

import * as React from "react";

import { ScenePoster } from "./scene-poster";
import { clampStage, decideScene, SCENE_MIN_WIDTH, stageMeta, type SceneStage } from "./scene-helpers";
import type { EvidenceCanvasHandle } from "./evidence-canvas";
import styles from "./scene-styles.module.css";

export type EvidenceSceneProps = {
  readonly stage?: SceneStage;
  readonly className?: string;
};

type NavigatorWithConnection = Navigator & {
  readonly connection?: {
    readonly saveData?: boolean;
    readonly effectiveType?: string;
  };
};

export function EvidenceScene({ stage = 0, className }: EvidenceSceneProps) {
  const activeStage = clampStage(stage);
  const meta = stageMeta(activeStage);
  const hintId = React.useId();
  const hostRef = React.useRef<HTMLDivElement>(null);
  const handleRef = React.useRef<EvidenceCanvasHandle | null>(null);
  const stageRef = React.useRef<SceneStage>(activeStage);
  const [enhanced, setEnhanced] = React.useState(false);

  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const wideQuery = window.matchMedia(`(min-width: ${SCENE_MIN_WIDTH}px)`);
    const controller = new AbortController();
    let live = true;
    let handle: EvidenceCanvasHandle | null = null;

    const eligible = (): boolean => {
      const connection = (navigator as NavigatorWithConnection).connection;
      return decideScene({
        reducedMotion: reducedQuery.matches,
        saveData: connection?.saveData,
        effectiveType: connection?.effectiveType,
        viewportWidth: window.innerWidth,
      }).enabled;
    };

    const release = (updateState: boolean): void => {
      handle?.dispose();
      handle = null;
      handleRef.current = null;
      if (updateState) setEnhanced(false);
    };

    const stop = (): void => {
      if (!live) return;
      live = false;
      controller.abort();
      release(true);
    };

    const onChange = (): void => {
      if (!eligible()) stop();
    };

    if (eligible()) {
      void import("./evidence-canvas")
        .then((module) =>
          module.mountEvidenceCanvas({
            host,
            stage: stageRef.current,
            signal: controller.signal,
            onFailure: () => {
              if (!live) return;
              handleRef.current = null;
              setEnhanced(false);
            },
          }),
        )
        .then((mounted) => {
          if (!mounted) {
            if (live) setEnhanced(false);
            return;
          }
          if (!live) {
            mounted.dispose();
            return;
          }
          handle = mounted;
          handleRef.current = mounted;
          setEnhanced(true);
        })
        .catch(() => {
          if (live) setEnhanced(false);
        });
    }

    reducedQuery.addEventListener("change", onChange);
    wideQuery.addEventListener("change", onChange);

    return () => {
      live = false;
      controller.abort();
      reducedQuery.removeEventListener("change", onChange);
      wideQuery.removeEventListener("change", onChange);
      release(false);
    };
  }, []);

  React.useEffect(() => {
    stageRef.current = activeStage;
    handleRef.current?.setStage(activeStage);
  }, [activeStage]);

  const classes = [styles.scene, className].filter(Boolean).join(" ");

  return (
    <div
      ref={hostRef}
      className={classes}
      data-enhanced={enhanced ? "true" : "false"}
      data-stage={activeStage}
      role="group"
      tabIndex={enhanced ? 0 : -1}
      aria-label={`${meta.label} stage of the evidence sorter. Drag with a pointer to rotate, or use the arrow keys to nudge the view.`}
      aria-describedby={hintId}
    >
      <div className={styles.posterLayer} aria-hidden={enhanced || undefined}>
        <ScenePoster stage={activeStage} />
      </div>

      <p className={styles.hint} aria-hidden="true">
        Drag to rotate · arrows to nudge
      </p>

      <p id={hintId} className={styles.srOnly}>
        The illustration is decorative; its stage is described above. Use the left and right arrow keys to rotate
        the instrument, and the up and down arrow keys to tilt it. Hold shift for a larger nudge. The page still
        scrolls normally.
      </p>

      <p className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">
        {meta.announcement}
      </p>
    </div>
  );
}

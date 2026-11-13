export const SCENE_MIN_WIDTH = 900;

export type SceneStage = 0 | 1 | 2;

export type SceneStageMeta = {
  readonly id: SceneStage;
  readonly code: string;
  readonly label: string;
  readonly description: string;
  readonly announcement: string;
};

export const STAGE_META: readonly SceneStageMeta[] = [
  {
    id: 0,
    code: "01",
    label: "Collect",
    description: "One glowing point per piece of public evidence drifts in a slow spiral.",
    announcement: "Collect stage. Evidence particles gather in a slow spiral.",
  },
  {
    id: 1,
    code: "02",
    label: "Qualify",
    description: "The field forms a gate; weak evidence sinks and dims while stronger evidence carries on.",
    announcement: "Qualify stage. Particles pass a gate; weaker evidence sinks and dims.",
  },
  {
    id: 2,
    code: "03",
    label: "Review",
    description: "The surviving evidence snaps into the rows of a lead dossier.",
    announcement: "Review stage. Surviving evidence snaps into dossier rows.",
  },
] as const;

const SLOW_CONNECTIONS: ReadonlySet<string> = new Set(["slow-2g", "2g", "3g"]);

export type SceneCapabilityInput = {
  readonly reducedMotion: boolean;
  readonly saveData?: boolean;
  readonly effectiveType?: string | null;
  readonly viewportWidth: number;
};

export type SceneDecisionReason =
  | "capable"
  | "reduced-motion"
  | "save-data"
  | "slow-connection"
  | "narrow-viewport";

export type SceneDecision = {
  readonly enabled: boolean;
  readonly reason: SceneDecisionReason;
};

/** Keep a numeric stage prop inside the three-stage range. */
export function clampStage(value: number): SceneStage {
  if (Number.isNaN(value)) return 0;
  return Math.min(2, Math.max(0, Math.round(value))) as SceneStage;
}

export function stageMeta(stage: number): SceneStageMeta {
  return STAGE_META[clampStage(stage)];
}

/** Clamp a rotation (radians) to a symmetric limit. */
export function clampRotation(value: number, limit: number): number {
  const safeLimit = Math.max(0, limit);
  return Math.min(safeLimit, Math.max(-safeLimit, value));
}

/** Frame-rate independent ease toward a target. */
export function damp(current: number, target: number, lambda: number, delta: number): number {
  const factor = 1 - Math.exp(-Math.max(0, lambda) * Math.max(0, delta));
  return current + (target - current) * factor;
}

/**
 * Decide whether the enhanced canvas may load. The poster is the default and
 * the only version used for reduced motion, metered connections or narrow screens.
 */
export function decideScene(input: SceneCapabilityInput): SceneDecision {
  if (input.reducedMotion) {
    return { enabled: false, reason: "reduced-motion" };
  }
  if (input.saveData) {
    return { enabled: false, reason: "save-data" };
  }
  if (input.effectiveType && SLOW_CONNECTIONS.has(input.effectiveType.toLowerCase())) {
    return { enabled: false, reason: "slow-connection" };
  }
  if (!Number.isFinite(input.viewportWidth) || input.viewportWidth < SCENE_MIN_WIDTH) {
    return { enabled: false, reason: "narrow-viewport" };
  }
  return { enabled: true, reason: "capable" };
}

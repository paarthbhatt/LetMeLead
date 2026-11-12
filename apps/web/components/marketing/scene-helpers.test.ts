import { describe, expect, it } from "vitest";

import {
  clampRotation,
  clampStage,
  damp,
  decideScene,
  SCENE_MIN_WIDTH,
  stageMeta,
  STAGE_META,
  type SceneCapabilityInput,
} from "./scene-helpers";

const capable: SceneCapabilityInput = {
  reducedMotion: false,
  saveData: false,
  effectiveType: "4g",
  viewportWidth: 1280,
};

describe("clampStage", () => {
  it("keeps numeric stages inside the three-stage range", () => {
    expect(clampStage(-6)).toBe(0);
    expect(clampStage(0)).toBe(0);
    expect(clampStage(1)).toBe(1);
    expect(clampStage(2)).toBe(2);
    expect(clampStage(9)).toBe(2);
  });

  it("rounds fractional values and recovers from non-finite input", () => {
    expect(clampStage(1.4)).toBe(1);
    expect(clampStage(1.6)).toBe(2);
    expect(clampStage(Number.NaN)).toBe(0);
    expect(clampStage(Number.POSITIVE_INFINITY)).toBe(2);
    expect(clampStage(Number.NEGATIVE_INFINITY)).toBe(0);
  });
});

describe("stage labels", () => {
  it("names the three stages in order", () => {
    expect(STAGE_META.map((stage) => stage.label)).toEqual(["Collect", "Qualify", "Review"]);
    expect(STAGE_META.map((stage) => stage.code)).toEqual(["01", "02", "03"]);
  });

  it("returns matching metadata for a clamped stage", () => {
    expect(stageMeta(0).label).toBe("Collect");
    expect(stageMeta(2).label).toBe("Review");
    expect(stageMeta(7).label).toBe("Review");
    expect(stageMeta(-1).announcement).toContain("Collect stage");
  });

  it("gives every stage a distinct announcement and description", () => {
    const announcements = new Set(STAGE_META.map((stage) => stage.announcement));
    const descriptions = new Set(STAGE_META.map((stage) => stage.description));
    expect(announcements.size).toBe(3);
    expect(descriptions.size).toBe(3);
  });
});

describe("decideScene", () => {
  it("enables the canvas on a wide, fast, motion-friendly viewport", () => {
    expect(decideScene(capable)).toEqual({ enabled: true, reason: "capable" });
  });

  it("keeps the poster for reduced motion, save-data and slow connections", () => {
    expect(decideScene({ ...capable, reducedMotion: true })).toEqual({
      enabled: false,
      reason: "reduced-motion",
    });
    expect(decideScene({ ...capable, saveData: true })).toEqual({
      enabled: false,
      reason: "save-data",
    });
    expect(decideScene({ ...capable, effectiveType: "3g" })).toEqual({
      enabled: false,
      reason: "slow-connection",
    });
    expect(decideScene({ ...capable, effectiveType: "SLOW-2G" })).toEqual({
      enabled: false,
      reason: "slow-connection",
    });
  });

  it("requires the documented minimum viewport width", () => {
    expect(decideScene({ ...capable, viewportWidth: SCENE_MIN_WIDTH })).toEqual({
      enabled: true,
      reason: "capable",
    });
    expect(decideScene({ ...capable, viewportWidth: SCENE_MIN_WIDTH - 1 })).toEqual({
      enabled: false,
      reason: "narrow-viewport",
    });
    expect(decideScene({ ...capable, viewportWidth: Number.NaN })).toEqual({
      enabled: false,
      reason: "narrow-viewport",
    });
  });

  it("treats unknown or absent connection data as capable", () => {
    expect(decideScene({ ...capable, effectiveType: undefined })).toEqual({
      enabled: true,
      reason: "capable",
    });
    expect(decideScene({ ...capable, effectiveType: "4g" })).toEqual({
      enabled: true,
      reason: "capable",
    });
  });

  it("prioritises reduced motion over the other limits", () => {
    expect(
      decideScene({ ...capable, reducedMotion: true, saveData: true, viewportWidth: 320 }),
    ).toEqual({ enabled: false, reason: "reduced-motion" });
  });
});

describe("rotation helpers", () => {
  it("clamps yaw and pitch to symmetric limits", () => {
    expect(clampRotation(0.7, 0.5)).toBe(0.5);
    expect(clampRotation(-0.7, 0.5)).toBe(-0.5);
    expect(clampRotation(0.2, 0.5)).toBe(0.2);
    expect(clampRotation(0.7, -1)).toBe(0);
  });

  it("eases toward a target and stays put with no time or damping", () => {
    expect(damp(0, 1, 5, 0)).toBe(0);
    expect(damp(0, 1, 0, 1)).toBe(0);
    expect(damp(2, 2, 5, 1)).toBe(2);
    const eased = damp(0, 1, 5, 1 / 60);
    expect(eased).toBeGreaterThan(0);
    expect(eased).toBeLessThan(1);
  });
});

import * as THREE from "three";

import { clampRotation, clampStage, damp, type SceneStage } from "./scene-helpers";
import styles from "./scene-styles.module.css";

export type SignalFieldHandle = {
  setStage: (stage: SceneStage) => void;
  dispose: () => void;
};

export type MountSignalFieldOptions = {
  readonly host: HTMLElement;
  readonly stage: SceneStage;
  readonly signal?: AbortSignal;
  readonly onFailure?: () => void;
};

/**
 * One particle per piece of public evidence. Positions are computed on the GPU:
 * the CPU only uploads static attributes and a handful of uniforms.
 *
 * The field has three arrangements that match the hero's stages:
 *   collect — a slow spiral band
 *   qualify — a vertical gate, with weak evidence sinking and dimming
 *   review  — the survivors snap into dossier rows
 *
 * The shader is GLSL on three's WebGL2 renderer rather than TSL on
 * WebGPURenderer: a custom GLSL ShaderMaterial cannot run on three's WebGPU
 * backend, and this shader is verifiable in every browser that can run the
 * fallback poster's neighbours.
 */
const PARTICLE_COUNT = 2000;
const DOSSIER_RANK = 0.52;

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uStage;
  uniform vec2 uPointer;
  uniform float uPixelRatio;
  uniform float uSize;
  uniform float uMotion;

  attribute float aSeed;
  attribute float aRank;
  attribute float aPhase;
  attribute float aRadius;

  varying float vRank;
  varying float vAlpha;

  void main() {
    float s1 = smoothstep(0.0, 1.0, clamp(uStage, 0.0, 1.0));
    float s2 = smoothstep(0.0, 1.0, clamp(uStage - 1.0, 0.0, 1.0));

    // Collect: evidence spirals inward along loose arms.
    float drift = uTime * 0.16 * uMotion;
    float angle = aPhase + aRadius * 3.15 + drift;
    vec3 collect = vec3(
      cos(angle) * aRadius * 1.06,
      sin(angle) * aRadius * 0.44 + sin(uTime * 0.4 + aSeed * 6.2831) * 0.03 * uMotion,
      sin(angle * 1.3 + aSeed * 3.0) * 0.2
    );

    // Qualify: a gate slab sorted by evidence strength; weak items sink and slide out.
    float pass = smoothstep(0.38, 0.8, aRank);
    vec3 qualify = vec3(
      (aSeed - 0.5) * 0.32,
      (aRank - 0.5) * 2.05,
      (aSeed - 0.5) * 0.3
    );
    // Rejects fall away on both sides and dim; survivors hold the column.
    float side = aSeed < 0.5 ? -1.0 : 1.0;
    qualify.y = mix(qualify.y - 1.5, qualify.y, pass);
    qualify.x += (1.0 - pass) * side * (0.75 + fract(aSeed * 5.7) * 0.8);

    // Review: survivors land as scattered rows, like a ledger of evidence.
    float rowIndex = floor(fract(aSeed * 9.13) * 6.0);
    vec3 review = vec3(
      (fract(aSeed * 13.37) - 0.5) * 2.9,
      0.85 - rowIndex * 0.34 + sin(uTime * 0.5 + aSeed * 4.0) * 0.012 * uMotion,
      (fract(aSeed * 7.7) - 0.5) * 0.06
    );

    vec3 pos = mix(collect, qualify, s1);
    pos = mix(pos, review, s2);

    // A little parallax, never a full orbit.
    pos.x += uPointer.x * 0.13 * (0.35 + aSeed * 0.65);
    pos.y += uPointer.y * 0.11 * (0.35 + aSeed * 0.65);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    float perspective = clamp(1.0 / max(0.4, -mv.z), 0.0, 2.6);
    gl_PointSize = uSize * mix(0.8, 1.45, aRank) * perspective * uPixelRatio;

    float qualified = mix(1.0, mix(0.12, 1.0, pass), s1);
    float inDossier = mix(1.0, step(${DOSSIER_RANK.toFixed(2)}, aRank), s2);
    vAlpha = mix(0.3, 1.0, aRank) * qualified * inDossier;
    vRank = aRank;
  }
`;

const fragmentShader = /* glsl */ `
  precision mediump float;

  uniform vec3 uCool;
  uniform vec3 uWarm;

  varying float vRank;
  varying float vAlpha;

  void main() {
    vec2 offset = gl_PointCoord - 0.5;
    float dist = length(offset);
    float core = smoothstep(0.5, 0.12, dist);
    float halo = smoothstep(0.5, 0.0, dist) * 0.35;

    vec3 color = mix(uCool, uWarm, smoothstep(0.6, 0.97, vRank));
    float alpha = (core + halo) * vAlpha * 0.95;
    if (alpha < 0.01) discard;

    gl_FragColor = vec4(color, alpha);
  }
`;

function createFieldGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const seeds = new Float32Array(PARTICLE_COUNT);
  const ranks = new Float32Array(PARTICLE_COUNT);
  const phases = new Float32Array(PARTICLE_COUNT);
  const radii = new Float32Array(PARTICLE_COUNT);

  for (let index = 0; index < PARTICLE_COUNT; index += 1) {
    const seed = Math.random();
    // Skewed toward weak evidence so the qualify stage has something to drop.
    const rank = Math.pow(Math.random(), 1.7);
    // Three loose arms, so the field reads as a spiral rather than a ring.
    const arm = index % 3;
    const phase = (arm / 3) * Math.PI * 2 + (Math.random() - 0.5) * 0.85;
    // Denser toward the centre, with a soft edge instead of a hard rim.
    const radius = 0.2 + 1.9 * Math.pow(Math.random(), 0.6);

    seeds[index] = seed;
    ranks[index] = rank;
    phases[index] = phase;
    radii[index] = radius;

    // `position` is unused by the shader but keeps three's bounds/frustum happy.
    positions[index * 3] = 0;
    positions[index * 3 + 1] = 0;
    positions[index * 3 + 2] = 0;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute("aRank", new THREE.BufferAttribute(ranks, 1));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute("aRadius", new THREE.BufferAttribute(radii, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4);
  return geometry;
}

function createMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uStage: { value: 0 },
      uPointer: { value: new THREE.Vector2(0, 0) },
      uPixelRatio: { value: 1 },
      uSize: { value: 70 },
      uMotion: { value: 1 },
      uCool: { value: new THREE.Color(0x3a5ae8) },
      uWarm: { value: new THREE.Color(0xc2560a) },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
  });
}

export async function mountSignalField({
  host,
  stage,
  signal,
  onFailure,
}: MountSignalFieldOptions): Promise<SignalFieldHandle | null> {
  const canvas = document.createElement("canvas");
  canvas.className = styles.canvas;
  canvas.setAttribute("aria-hidden", "true");

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      powerPreference: "high-performance",
    });
  } catch {
    onFailure?.();
    return null;
  }

  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
  camera.position.set(0, 0, 5.0);

  const field = new THREE.Group();
  scene.add(field);

  const geometry = createFieldGeometry();
  const material = createMaterial();
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  field.add(points);

  host.appendChild(canvas);

  let disposed = false;
  let failed = false;
  let stageValue: number = clampStage(stage);
  let targetStage: number = stageValue;
  let yaw = 0;
  let pitch = 0;
  let targetYaw = 0;
  let targetPitch = 0;
  let pointerX = 0;
  let pointerY = 0;
  let lastFrame = 0;
  let frame = 0;
  let inView = true;
  let pageVisible = document.visibilityState !== "hidden";

  const resize = (): void => {
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
    material.uniforms.uSize.value = rect.width < 560 ? 48 : 70;
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    canvas.setPointerCapture(event.pointerId);
    canvas.dataset.dragging = "true";
  };

  const onPointerMove = (event: PointerEvent): void => {
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    const y = ((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1;
    pointerX = x;
    pointerY = y;
    if (canvas.dataset.dragging === "true") {
      targetYaw = clampRotation(x * 0.5, 0.55);
      targetPitch = clampRotation(-y * 0.22, 0.3);
    }
  };

  const onPointerUp = (event: PointerEvent): void => {
    canvas.dataset.dragging = "false";
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };

  const onPointerLeave = (): void => {
    pointerX = 0;
    pointerY = 0;
    if (canvas.dataset.dragging !== "true") {
      targetYaw = 0;
      targetPitch = 0;
    }
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const step = event.shiftKey ? 0.14 : 0.06;
    if (event.key === "ArrowLeft") targetYaw = clampRotation(targetYaw - step, 0.55);
    else if (event.key === "ArrowRight") targetYaw = clampRotation(targetYaw + step, 0.55);
    else if (event.key === "ArrowUp") targetPitch = clampRotation(targetPitch + step * 0.6, 0.3);
    else if (event.key === "ArrowDown") targetPitch = clampRotation(targetPitch - step * 0.6, 0.3);
    else return;
    event.preventDefault();
  };

  const render = (now: number): void => {
    if (disposed || failed) return;
    frame = window.requestAnimationFrame(render);
    if (!inView || !pageVisible) return;

    const delta = lastFrame ? Math.min(0.05, (now - lastFrame) / 1000) : 0.016;
    lastFrame = now;

    stageValue = damp(stageValue, targetStage, 4.2, delta);
    yaw = damp(yaw, targetYaw, 5, delta);
    pitch = damp(pitch, targetPitch, 5, delta);

    material.uniforms.uTime.value = now / 1000;
    material.uniforms.uStage.value = stageValue;
    material.uniforms.uPointer.value.set(pointerX, pointerY);

    field.rotation.y = yaw;
    field.rotation.x = pitch;

    renderer.render(scene, camera);
  };

  const observer = new IntersectionObserver(
    (entries) => {
      inView = entries.some((entry) => entry.isIntersecting);
      if (inView) lastFrame = 0;
    },
    { threshold: 0.05 },
  );
  observer.observe(host);

  const onVisibility = (): void => {
    pageVisible = document.visibilityState !== "hidden";
    if (pageVisible) lastFrame = 0;
  };

  const onContextLost = (event: Event): void => {
    event.preventDefault();
    failed = true;
    onFailure?.();
  };

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("pointerleave", onPointerLeave);
  host.addEventListener("keydown", onKeyDown);
  canvas.addEventListener("webglcontextlost", onContextLost);
  document.addEventListener("visibilitychange", onVisibility);

  const abort = (): void => dispose();
  signal?.addEventListener("abort", abort, { once: true });

  resize();
  frame = window.requestAnimationFrame(render);

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    window.cancelAnimationFrame(frame);
    observer.disconnect();
    resizeObserver.disconnect();
    signal?.removeEventListener("abort", abort);
    document.removeEventListener("visibilitychange", onVisibility);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerUp);
    canvas.removeEventListener("pointerleave", onPointerLeave);
    host.removeEventListener("keydown", onKeyDown);
    canvas.removeEventListener("webglcontextlost", onContextLost);
    geometry.dispose();
    material.dispose();
    renderer.dispose();
    canvas.remove();
  }

  if (signal?.aborted) {
    dispose();
    return null;
  }

  return {
    setStage: (nextStage) => {
      targetStage = clampStage(nextStage);
    },
    dispose,
  };
}

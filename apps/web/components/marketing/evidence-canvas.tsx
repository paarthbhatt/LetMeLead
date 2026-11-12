import * as THREE from "three";

import { clampRotation, clampStage, damp, type SceneStage } from "./scene-helpers";
import styles from "./scene-styles.module.css";

type WebGPURendererType = import("three/webgpu").WebGPURenderer;
type SceneRenderer = THREE.WebGLRenderer | WebGPURendererType;

export type EvidenceCanvasHandle = {
  setStage: (stage: SceneStage) => void;
  dispose: () => void;
};

export type MountEvidenceOptions = {
  readonly host: HTMLElement;
  readonly stage: SceneStage;
  readonly signal?: AbortSignal;
  readonly onFailure?: () => void;
};

const COLORS = {
  paper: 0xf4f6fa,
  blue: 0x517be8,
  amber: 0xd49a39,
  slate: 0x68717f,
  border: 0xdce2eb,
} as const;

const TOKENS = [
  { label: "Funding", tone: COLORS.blue },
  { label: "Hiring", tone: COLORS.blue },
  { label: "Launch", tone: COLORS.blue },
  { label: "Docs", tone: COLORS.blue },
  { label: "Press", tone: COLORS.amber },
  { label: "Shift", tone: COLORS.amber },
] as const;

const GATES = ["FIT", "TIMING", "OWNER"] as const;
const GATE_X = [-0.95, 0, 1] as const;
const GATE_Y = [0.5, 0, -0.5] as const;
const DRAG_YAW = 0.55;
const DRAG_PITCH = 0.22;

type TokenPose = {
  x: number;
  y: number;
  z: number;
  scale: number;
  opacity: number;
  tilt: number;
};

function tokenTarget(stage: SceneStage, index: number): TokenPose {
  const side = index % 2 === 0 ? 1 : -1;

  if (stage === 0) {
    const t = 0.15 + index * 0.16;
    return {
      x: -1.8 + t * 2.75,
      y: side * (1 - t * 0.72),
      z: 0.05 + (index % 3) * 0.012,
      scale: 1,
      opacity: 1,
      tilt: 0,
    };
  }

  if (stage === 1) {
    if (index >= 4) {
      return {
        x: index === 4 ? -1.2 : 0.2,
        y: -0.9,
        z: 0.08,
        scale: 0.6,
        opacity: 1,
        tilt: index === 4 ? -0.05 : 0.05,
      };
    }
    const xs = [-1.5, -0.9, 0, 1];
    const ys = [0.5, 0.5, 0, -0.5];
    const scales = [0.7, 0.9, 0.88, 0.84];
    return {
      x: xs[index],
      y: ys[index],
      z: 0.08 + index * 0.008,
      scale: scales[index],
      opacity: 1,
      tilt: 0,
    };
  }

  if (index >= 4) {
    return { x: 0, y: 0, z: 0, scale: 0.001, opacity: 0, tilt: 0 };
  }

  return {
    x: -0.66,
    y: 0.2 - index * 0.32,
    z: 0.1,
    scale: 0.82,
    opacity: 1,
    tilt: 0,
  };
}

function configureTexture(texture: THREE.CanvasTexture): THREE.CanvasTexture {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function makeVignetteTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 768;
  const context = canvas.getContext("2d");

  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    const gradient = context.createRadialGradient(512, 360, 50, 512, 360, 540);
    gradient.addColorStop(0, "rgba(178, 192, 214, 0.62)");
    gradient.addColorStop(0.55, "rgba(214, 223, 237, 0.34)");
    gradient.addColorStop(1, "rgba(244, 246, 250, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  return configureTexture(new THREE.CanvasTexture(canvas));
}

function makeTokenTexture(label: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext("2d");

  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#15171c";
    context.font =
      "650 78px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
    context.textBaseline = "middle";
    context.fillText(label, 6, 132, 440);
  }

  return configureTexture(new THREE.CanvasTexture(canvas));
}

function makeSoftShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 160;
  const context = canvas.getContext("2d");

  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    const gradient = context.createRadialGradient(128, 80, 8, 128, 80, 122);
    gradient.addColorStop(0, "rgba(27, 35, 49, 0.62)");
    gradient.addColorStop(0.55, "rgba(27, 35, 49, 0.24)");
    gradient.addColorStop(1, "rgba(27, 35, 49, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  return configureTexture(new THREE.CanvasTexture(canvas));
}

function makeCapsTexture(text: string, color: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 128;
  const context = canvas.getContext("2d");

  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = color;
    context.font =
      "650 52px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, 160, 66, 300);
  }

  return configureTexture(new THREE.CanvasTexture(canvas));
}

function makeDossierTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 192;
  const context = canvas.getContext("2d");

  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#15171c";
    context.font =
      "700 46px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
    context.textBaseline = "middle";
    context.fillText("LEAD DOSSIER", 0, 72, 500);
    context.fillStyle = "#59667a";
    context.font =
      "500 26px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
    context.fillText("4 evidence rows / for review", 0, 128, 500);
  }

  return configureTexture(new THREE.CanvasTexture(canvas));
}

function roundedRectShape(width: number, height: number, radius: number): THREE.Shape {
  const w = width / 2;
  const h = height / 2;
  const r = Math.min(radius, w, h);
  const shape = new THREE.Shape();
  shape.moveTo(-w + r, -h);
  shape.lineTo(w - r, -h);
  shape.quadraticCurveTo(w, -h, w, -h + r);
  shape.lineTo(w, h - r);
  shape.quadraticCurveTo(w, h, w - r, h);
  shape.lineTo(-w + r, h);
  shape.quadraticCurveTo(-w, h, -w, h - r);
  shape.lineTo(-w, -h + r);
  shape.quadraticCurveTo(-w, -h, -w + r, -h);
  return shape;
}

function roundedRectPoints(
  width: number,
  height: number,
  radius: number,
  z: number,
): THREE.Vector3[] {
  const w = width / 2;
  const h = height / 2;
  const r = Math.min(radius, w, h);
  const points: THREE.Vector3[] = [];
  const corners = [
    { cx: w - r, cy: h - r, start: 0 },
    { cx: -w + r, cy: h - r, start: Math.PI / 2 },
    { cx: -w + r, cy: -h + r, start: Math.PI },
    { cx: w - r, cy: -h + r, start: (Math.PI * 3) / 2 },
  ];

  for (const corner of corners) {
    for (let step = 0; step <= 6; step += 1) {
      const angle = corner.start + (step / 6) * (Math.PI / 2);
      points.push(
        new THREE.Vector3(corner.cx + Math.cos(angle) * r, corner.cy + Math.sin(angle) * r, z),
      );
    }
  }

  return points;
}

function closedGeometry(points: THREE.Vector3[]): THREE.BufferGeometry {
  return new THREE.BufferGeometry().setFromPoints([...points, points[0]]);
}

function roundedFrameGeometry(
  width: number,
  height: number,
  radius: number,
  thickness: number,
): THREE.ShapeGeometry {
  const outer = roundedRectShape(width, height, radius);
  const hole = new THREE.Path();
  hole.setFromPoints(
    roundedRectShape(
      width - thickness * 2,
      height - thickness * 2,
      Math.max(0.001, radius - thickness),
    ).getPoints(12),
  );
  outer.holes.push(hole);
  return new THREE.ShapeGeometry(outer, 12);
}

async function createRenderer(
  host: HTMLElement,
): Promise<{ renderer: SceneRenderer; webgpu: boolean; canvas: HTMLCanvasElement }> {
  const createCanvas = (): HTMLCanvasElement => {
    const canvas = document.createElement("canvas");
    canvas.className = styles.canvas;
    canvas.setAttribute("aria-hidden", "true");
    host.appendChild(canvas);
    return canvas;
  };

  if (typeof navigator !== "undefined" && "gpu" in navigator) {
    const gpuCanvas = createCanvas();
    let gpuRenderer: WebGPURendererType | null = null;
    try {
      const { WebGPURenderer } = await import("three/webgpu");
      gpuRenderer = new WebGPURenderer({
        canvas: gpuCanvas,
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
      await gpuRenderer.init();
      return { renderer: gpuRenderer, webgpu: true, canvas: gpuCanvas };
    } catch {
      // No adapter, blocked GPU or an unsupported device: release whatever the
      // half-built renderer already allocated, then use the WebGL path.
      await disposeRenderer(gpuRenderer);
      gpuCanvas.remove();
    }
  }

  // A fresh canvas matters: a canvas that already owns a WebGPU context cannot
  // hand out a WebGL2 context as well.
  const canvas = createCanvas();
  try {
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "low-power",
    });
    return { renderer, webgpu: false, canvas };
  } catch (error) {
    canvas.remove();
    throw error;
  }
}

async function disposeRenderer(renderer: SceneRenderer | null): Promise<void> {
  if (!renderer) return;
  try {
    renderer.info.reset();
  } catch {
    // The backend may already be gone.
  }
  try {
    await renderer.dispose();
  } catch {
    // Disposal must never reject the page.
  }
}

export async function mountEvidenceCanvas(
  options: MountEvidenceOptions,
): Promise<EvidenceCanvasHandle | null> {
  const { host, signal, onFailure } = options;
  let stage = clampStage(options.stage);
  let disposed = false;
  let failed = false;
  let renderer: SceneRenderer | null = null;
  let webgpu = false;
  let canvas: HTMLCanvasElement | null = null;

  try {
    const created = await createRenderer(host);
    renderer = created.renderer;
    webgpu = created.webgpu;
    canvas = created.canvas;
  } catch {
    onFailure?.();
    return null;
  }

  if (signal?.aborted || !canvas) {
    void disposeRenderer(renderer);
    canvas?.remove();
    return null;
  }

  const viewCanvas = canvas;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 4 / 3, 0.1, 24);
  const instrument = new THREE.Group();
  const collectGroup = new THREE.Group();
  const gateGroup = new THREE.Group();
  const panelGroup = new THREE.Group();
  instrument.add(collectGroup, gateGroup, panelGroup);
  scene.add(instrument);

  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();

  const trackGeometry = <T extends THREE.BufferGeometry>(geometry: T): T => {
    geometries.add(geometry);
    return geometry;
  };
  const trackMaterial = <T extends THREE.Material>(material: T, baseOpacity = 1): T => {
    material.transparent = true;
    material.userData.baseOpacity = baseOpacity;
    materials.add(material);
    return material;
  };
  const trackTexture = <T extends THREE.Texture>(texture: T): T => {
    textures.add(texture);
    return texture;
  };

  let raf = 0;
  let lastFrame = 0;
  let elapsed = 0;
  let pageVisible = !document.hidden;
  let inView = typeof IntersectionObserver === "undefined";
  let dragging = false;
  let pointerId = -1;
  let pointerX = 0;
  let pointerY = 0;
  let targetYaw = 0;
  let targetPitch = 0;
  let yaw = 0;
  let pitch = 0;
  let resizeObserver: ResizeObserver | null = null;
  let intersectionObserver: IntersectionObserver | null = null;

  const stageWeights = [stage === 0 ? 1 : 0, stage === 1 ? 1 : 0, stage === 2 ? 1 : 0];
  const tokenGroups: THREE.Group[] = [];
  const tokenPoses: TokenPose[] = [];
  const dossierRows: THREE.Mesh[] = [];
  let dossierHeader: THREE.Mesh | null = null;
  let dossierAccent: THREE.Mesh | null = null;

  const chipFaceGeometry = trackGeometry(new THREE.ShapeGeometry(roundedRectShape(0.72, 0.36, 0.055)));
  const chipBorderGeometry = trackGeometry(roundedFrameGeometry(0.72, 0.36, 0.055, 0.012));
  const chipLabelGeometry = trackGeometry(new THREE.PlaneGeometry(0.6, 0.3));
  const chipShadowGeometry = trackGeometry(new THREE.PlaneGeometry(0.94, 0.54));
  const chipAccentGeometry = trackGeometry(new THREE.PlaneGeometry(0.032, 0.22));

  const chipFaceMaterial = trackMaterial(
    new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3) }),
  );
  const chipBorderMaterial = trackMaterial(
    new THREE.LineBasicMaterial({ color: 0x59667a, toneMapped: false }),
  );
  const chipShadowMaterial = trackMaterial(
    new THREE.MeshBasicMaterial({
      map: trackTexture(makeSoftShadowTexture()),
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    }),
  );
  const accentBlue = trackMaterial(new THREE.MeshBasicMaterial({ color: COLORS.blue }));
  const accentAmber = trackMaterial(new THREE.MeshBasicMaterial({ color: COLORS.amber }));

  function buildToken(label: string, tone: number): THREE.Group {
    const group = new THREE.Group();
    const shadow = new THREE.Mesh(chipShadowGeometry, chipShadowMaterial);
    shadow.position.set(0, -0.045, -0.02);
    shadow.renderOrder = 0;
    group.add(shadow);

    const face = new THREE.Mesh(chipFaceGeometry, chipFaceMaterial);
    face.renderOrder = 1;
    group.add(face);

    const border = new THREE.Mesh(chipBorderGeometry, chipBorderMaterial);
    border.position.z = 0.008;
    group.add(border);

    const accent = new THREE.Mesh(chipAccentGeometry, tone === COLORS.amber ? accentAmber : accentBlue);
    accent.position.set(-0.315, 0, 0.012);
    group.add(accent);

    const labelMaterial = trackMaterial(
      new THREE.MeshBasicMaterial({
        map: trackTexture(makeTokenTexture(label)),
        transparent: true,
        alphaTest: 0.04,
        depthWrite: false,
      }),
    );
    const text = new THREE.Mesh(chipLabelGeometry, labelMaterial);
    text.position.set(0.042, 0, 0.014);
    text.renderOrder = 2;
    group.add(text);

    return group;
  }

  function addCurvedRail(side: number): void {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.9, side, -0.02),
      new THREE.Vector3(-1, side * 0.78, 0.03),
      new THREE.Vector3(0, side * 0.36, 0.02),
      new THREE.Vector3(0.92, side * 0.08, 0),
    ]);
    const geometry = trackGeometry(new THREE.BufferGeometry().setFromPoints(curve.getPoints(64)));
    const material = trackMaterial(
      new THREE.LineBasicMaterial({
        color: COLORS.blue,
        transparent: true,
        opacity: 0.5,
        toneMapped: false,
      }),
      0.5,
    );
    collectGroup.add(new THREE.Line(geometry, material));
  }

  function addGate(index: number): void {
    const sizes = [
      [0.92, 0.8],
      [1, 0.88],
      [0.88, 0.74],
    ] as const;
    const [width, height] = sizes[index];
    const x = GATE_X[index];
    const y = GATE_Y[index];
    const geometry = trackGeometry(closedGeometry(roundedRectPoints(width, height, 0.1, 0)));
    const material = trackMaterial(
      new THREE.LineBasicMaterial({
        color: COLORS.blue,
        transparent: true,
        opacity: 0.72,
        toneMapped: false,
      }),
      0.72,
    );
    const frame = new THREE.Line(geometry, material);
    frame.position.set(x, y, 0);
    gateGroup.add(frame);

    const labelTexture = trackTexture(makeCapsTexture(GATES[index], "#59667a"));
    const labelMaterial = trackMaterial(
      new THREE.MeshBasicMaterial({
        map: labelTexture,
        transparent: true,
        toneMapped: false,
        depthWrite: false,
      }),
    );
    const label = new THREE.Mesh(trackGeometry(new THREE.PlaneGeometry(0.72, 0.288)), labelMaterial);
    label.position.set(x, y + height / 2 + 0.19, 0.02);
    gateGroup.add(label);
  }

  function buildDossier(): void {
    panelGroup.position.set(0.08, -0.02, 0);

    const shadow = new THREE.Mesh(
      trackGeometry(new THREE.ShapeGeometry(roundedRectShape(2.35, 1.9, 0.16))),
      trackMaterial(
        new THREE.MeshBasicMaterial({
          color: 0x28303d,
          transparent: true,
          opacity: 0.16,
          depthWrite: false,
        }),
        0.16,
      ),
    );
    shadow.position.set(0, -0.06, -0.03);
    shadow.scale.setScalar(1.02);
    panelGroup.add(shadow);

    const panel = new THREE.Mesh(
      trackGeometry(new THREE.ShapeGeometry(roundedRectShape(2.35, 1.9, 0.16))),
      trackMaterial(new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3) })),
    );
    panelGroup.add(panel);

    const borderGeometry = trackGeometry(roundedFrameGeometry(2.35, 1.9, 0.16, 0.018));
    const borderMaterial = trackMaterial(
      new THREE.MeshBasicMaterial({ color: 0x59667a }),
    );
    const borderMesh = new THREE.Mesh(borderGeometry, borderMaterial);
    borderMesh.position.z = 0.012;
    panelGroup.add(borderMesh);

    dossierAccent = new THREE.Mesh(
      trackGeometry(new THREE.PlaneGeometry(0.05, 0.48)),
      trackMaterial(new THREE.MeshBasicMaterial({ color: COLORS.blue })),
    );
    dossierAccent.position.set(-0.98, 0.66, 0.02);
    panelGroup.add(dossierAccent);

    const headerTexture = trackTexture(makeDossierTexture());
    const headerMaterial = trackMaterial(
      new THREE.MeshBasicMaterial({
        map: headerTexture,
        transparent: true,
        depthWrite: false,
      }),
    );
    dossierHeader = new THREE.Mesh(
      trackGeometry(new THREE.PlaneGeometry(1.55, 0.58)),
      headerMaterial,
    );
    dossierHeader.position.set(-0.08, 0.66, 0.02);
    panelGroup.add(dossierHeader);

    const rowGeometry = trackGeometry(new THREE.BoxGeometry(1.95, 0.01, 0.01));
    const rowMaterial = trackMaterial(
      new THREE.MeshBasicMaterial({ color: 0x7b8492 }),
      0.42,
    );
    for (let index = 0; index < 4; index += 1) {
      const row = new THREE.Mesh(rowGeometry, rowMaterial);
      row.position.set(0, 0.2 - index * 0.32, 0.018);
      dossierRows.push(row);
      panelGroup.add(row);
    }

    const fields = ["SOURCE", "REASON", "AGE", "FIT"];
    for (let index = 0; index < fields.length; index += 1) {
      const fieldTexture = trackTexture(makeCapsTexture(fields[index], "#5b6675"));
      const field = new THREE.Mesh(
        // Keeps the 320x128 caps texture at its own 2.5:1 aspect so the labels
        // are not stretched horizontally.
        trackGeometry(new THREE.PlaneGeometry(0.25, 0.1)),
        trackMaterial(
          new THREE.MeshBasicMaterial({
            map: fieldTexture,
            transparent: true,
            depthWrite: false,
            opacity: 1,
          }),
        ),
      );
      field.position.set(0.54, 0.2 - index * 0.32, 0.024);
      panelGroup.add(field);
    }
  }

  function applyGroupOpacity(group: THREE.Group, opacity: number): void {
    group.visible = opacity > 0.01;
    group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.material) return;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of list) {
        const base = typeof material.userData.baseOpacity === "number"
          ? material.userData.baseOpacity
          : 1;
        material.transparent = true;
        material.opacity = opacity * base;
      }
    });
  }

  try {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.7;

    const backdrop = new THREE.Mesh(
      trackGeometry(new THREE.PlaneGeometry(7, 5.25)),
      trackMaterial(
        new THREE.MeshBasicMaterial({
          map: trackTexture(makeVignetteTexture()),
          transparent: true,
          depthWrite: false,
        }),
      ),
    );
    backdrop.position.set(0, 0.05, -1.4);
    backdrop.renderOrder = -2;
    scene.add(backdrop);

    const ground = new THREE.Mesh(
      trackGeometry(new THREE.PlaneGeometry(3.9, 1.35)),
      trackMaterial(
        new THREE.MeshBasicMaterial({
          map: trackTexture(makeSoftShadowTexture()),
          transparent: true,
          opacity: 0.5,
          depthWrite: false,
        }),
      ),
    );
    ground.position.set(0.05, -0.97, -0.12);
    ground.renderOrder = -1;
    scene.add(ground);

    addCurvedRail(1);
    addCurvedRail(-1);

    const mouth = new THREE.Group();
    mouth.position.set(1.2, 0, 0.02);
    const ringMesh = new THREE.Mesh(
      trackGeometry(new THREE.TorusGeometry(0.4, 0.024, 10, 64)),
      trackMaterial(new THREE.MeshBasicMaterial({ color: 0x3f4a5a })),
    );
    mouth.add(ringMesh);
    const discMesh = new THREE.Mesh(
      trackGeometry(new THREE.CircleGeometry(0.37, 48)),
      trackMaterial(new THREE.MeshBasicMaterial({ color: 0xf7f9fc })),
    );
    discMesh.position.z = -0.008;
    mouth.add(discMesh);
    const coreMesh = new THREE.Mesh(
      trackGeometry(new THREE.CircleGeometry(0.065, 24)),
      trackMaterial(new THREE.MeshBasicMaterial({ color: COLORS.blue })),
    );
    coreMesh.position.z = 0.006;
    mouth.add(coreMesh);
    collectGroup.add(mouth);

    const intakeTexture = trackTexture(makeCapsTexture("INTAKE", "#517be8"));
    const intakeMaterial = trackMaterial(
      new THREE.MeshBasicMaterial({
        map: intakeTexture,
        transparent: true,
        toneMapped: false,
        depthWrite: false,
      }),
    );
    const intakeLabel = new THREE.Mesh(
      trackGeometry(new THREE.PlaneGeometry(0.72, 0.288)),
      intakeMaterial,
    );
    intakeLabel.position.set(1.2, 0.66, 0.03);
    collectGroup.add(intakeLabel);

    GATES.forEach((_, index) => addGate(index));
    buildDossier();

    TOKENS.forEach((token, index) => {
      const group = buildToken(token.label, token.tone);
      const pose = tokenTarget(stage, index);
      tokenGroups.push(group);
      tokenPoses.push({ ...pose });
      group.position.set(pose.x, pose.y, pose.z);
      group.scale.setScalar(pose.scale);
      group.visible = pose.opacity > 0.01;
      instrument.add(group);
    });
  } catch {
    onFailure?.();
    dispose();
    return null;
  }

  const cameraFrames = [
    { position: new THREE.Vector3(-0.04, 0.3, 5.6), look: new THREE.Vector3(-0.1, 0, 0) },
    { position: new THREE.Vector3(-0.02, 0.26, 5.4), look: new THREE.Vector3(-0.06, 0, 0) },
    { position: new THREE.Vector3(0.03, 0.18, 4.6), look: new THREE.Vector3(0.02, 0, 0) },
  ] as const;
  const cameraLook = cameraFrames[stage].look.clone();
  camera.position.copy(cameraFrames[stage].position);
  camera.lookAt(cameraLook);

  const updateCameraProjection = (): void => {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    renderer?.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer?.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  const tick = (now: number): void => {
    raf = 0;
    if (disposed || failed) return;

    const delta = lastFrame ? Math.min(0.05, (now - lastFrame) / 1000) : 1 / 60;
    lastFrame = now;
    elapsed += delta;

    yaw = damp(yaw, targetYaw, 8, delta);
    pitch = damp(pitch, targetPitch, 8, delta);
    instrument.rotation.set(pitch, yaw, 0);
    instrument.position.y = Math.sin(elapsed * 0.4) * 0.012;

    for (let index = 0; index < 3; index += 1) {
      stageWeights[index] = damp(stageWeights[index], index === stage ? 1 : 0, 4.2, delta);
    }
    applyGroupOpacity(collectGroup, stageWeights[0]);
    applyGroupOpacity(gateGroup, stageWeights[1]);
    applyGroupOpacity(panelGroup, stageWeights[2]);

    const assembly = Math.min(1, Math.max(0, stageWeights[2]));
    panelGroup.scale.set(0.9 + assembly * 0.1, 0.9 + assembly * 0.1, 1);
    panelGroup.position.y = -0.02 + (1 - assembly) * 0.08;
    dossierRows.forEach((row, index) => {
      const rowProgress = Math.min(1, Math.max(0, (assembly - index * 0.12) / 0.55));
      row.scale.x = 0.45 + rowProgress * 0.55;
      row.position.z = 0.018 + (1 - rowProgress) * 0.05;
    });
    if (dossierHeader) dossierHeader.position.x = -0.08 + (1 - assembly) * 0.2;
    if (dossierAccent) dossierAccent.position.x = -0.98 + (1 - assembly) * 0.14;

    for (let index = 0; index < tokenGroups.length; index += 1) {
      const group = tokenGroups[index];
      const pose = tokenPoses[index];
      const target = tokenTarget(stage, index);

      pose.x = damp(pose.x, target.x, 5, delta);
      pose.y = damp(pose.y, target.y, 5, delta);
      pose.z = damp(pose.z, target.z, 5, delta);
      pose.scale = damp(pose.scale, target.scale, 5.5, delta);
      pose.opacity = damp(pose.opacity, target.opacity, 5.5, delta);
      pose.tilt = damp(pose.tilt, target.tilt, 5.5, delta);

      const drift = stage === 2 ? 0 : Math.sin(elapsed * 0.6 + index * 1.7) * 0.006;
      group.position.set(pose.x, pose.y + drift, pose.z);
      group.rotation.z = pose.tilt;
      group.scale.setScalar(Math.max(0.001, pose.scale));
      group.visible = pose.scale > 0.01;
    }

    const frame = cameraFrames[stage];
    camera.position.x = damp(camera.position.x, frame.position.x, 2.2, delta);
    camera.position.y = damp(camera.position.y, frame.position.y, 2.2, delta);
    camera.position.z = damp(camera.position.z, frame.position.z, 2.2, delta);
    cameraLook.x = damp(cameraLook.x, frame.look.x, 2.2, delta);
    cameraLook.y = damp(cameraLook.y, frame.look.y, 2.2, delta);
    cameraLook.z = damp(cameraLook.z, frame.look.z, 2.2, delta);
    camera.lookAt(cameraLook);

    try {
      renderer?.render(scene, camera);
    } catch {
      fail();
      return;
    }

    raf = window.requestAnimationFrame(tick);
  };

  const canRun = (): boolean => !disposed && !failed && pageVisible && inView;

  function startLoop(): void {
    if (raf || !canRun()) return;
    lastFrame = 0;
    raf = window.requestAnimationFrame(tick);
  }

  function stopLoop(): void {
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
  }

  const syncLoop = (): void => {
    if (canRun()) startLoop();
    else stopLoop();
  };

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    stopLoop();
    detach();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
    geometries.clear();
    materials.clear();
    textures.clear();
    tokenGroups.length = 0;
    tokenPoses.length = 0;
    scene.clear();
    const current = renderer;
    renderer = null;
    void disposeRenderer(current);
  }

  function fail(): void {
    if (failed || disposed) return;
    failed = true;
    stopLoop();
    onFailure?.();
    dispose();
  }

  const onContextLost = (event: Event): void => {
    event.preventDefault();
    fail();
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dragging = true;
    pointerId = event.pointerId;
    pointerX = event.clientX;
    pointerY = event.clientY;
    host.focus({ preventScroll: true });
    try {
      viewCanvas.setPointerCapture(event.pointerId);
    } catch {
      // Some browsers refuse capture outside an active pointer.
    }
    syncLoop();
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!dragging || event.pointerId !== pointerId) return;
    targetYaw = clampRotation(targetYaw + (event.clientX - pointerX) * 0.006, DRAG_YAW);
    targetPitch = clampRotation(targetPitch + (event.clientY - pointerY) * 0.004, DRAG_PITCH);
    pointerX = event.clientX;
    pointerY = event.clientY;
  };

  const endDrag = (event: PointerEvent): void => {
    if (event.pointerId !== pointerId) return;
    dragging = false;
    pointerId = -1;
    try {
      if (viewCanvas.hasPointerCapture(event.pointerId)) {
        viewCanvas.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Capture may already be gone.
    }
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const step = event.shiftKey ? 0.16 : 0.07;
    let handled = true;

    switch (event.key) {
      case "ArrowLeft":
        targetYaw = clampRotation(targetYaw - step, DRAG_YAW);
        break;
      case "ArrowRight":
        targetYaw = clampRotation(targetYaw + step, DRAG_YAW);
        break;
      case "ArrowUp":
        targetPitch = clampRotation(targetPitch - step * 0.7, DRAG_PITCH);
        break;
      case "ArrowDown":
        targetPitch = clampRotation(targetPitch + step * 0.7, DRAG_PITCH);
        break;
      default:
        handled = false;
    }

    if (handled) {
      event.preventDefault();
      syncLoop();
    }
  };

  const onVisibilityChange = (): void => {
    pageVisible = !document.hidden;
    syncLoop();
  };

  const onResize = (): void => {
    updateCameraProjection();
  };

  function detach(): void {
    viewCanvas.removeEventListener("webglcontextlost", onContextLost);
    viewCanvas.removeEventListener("webglcontextrestored", onContextLost);
    viewCanvas.removeEventListener("pointerdown", onPointerDown);
    viewCanvas.removeEventListener("pointermove", onPointerMove);
    viewCanvas.removeEventListener("pointerup", endDrag);
    viewCanvas.removeEventListener("pointercancel", endDrag);
    viewCanvas.remove();
    host.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("resize", onResize);
    resizeObserver?.disconnect();
    intersectionObserver?.disconnect();
    resizeObserver = null;
    intersectionObserver = null;
  }

  viewCanvas.addEventListener("webglcontextlost", onContextLost, false);
  viewCanvas.addEventListener("webglcontextrestored", onContextLost, false);
  viewCanvas.addEventListener("pointerdown", onPointerDown, false);
  viewCanvas.addEventListener("pointermove", onPointerMove, false);
  viewCanvas.addEventListener("pointerup", endDrag, false);
  viewCanvas.addEventListener("pointercancel", endDrag, false);
  host.addEventListener("keydown", onKeyDown, false);
  document.addEventListener("visibilitychange", onVisibilityChange);

  if (webgpu) {
    (renderer as WebGPURendererType).onDeviceLost = () => {
      fail();
    };
  }

  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(host);
  }
  window.addEventListener("resize", onResize, { passive: true });

  if (typeof IntersectionObserver !== "undefined") {
    intersectionObserver = new IntersectionObserver(
      (entries) => {
        inView = entries.some((entry) => entry.isIntersecting);
        syncLoop();
      },
      { threshold: 0.01, rootMargin: "120px" },
    );
    intersectionObserver.observe(host);
  }

  updateCameraProjection();
  applyGroupOpacity(collectGroup, stageWeights[0]);
  applyGroupOpacity(gateGroup, stageWeights[1]);
  applyGroupOpacity(panelGroup, stageWeights[2]);
  try {
    renderer.render(scene, camera);
  } catch {
    fail();
    return null;
  }
  syncLoop();

  return {
    setStage(nextStage: SceneStage): void {
      stage = clampStage(nextStage);
      syncLoop();
    },
    dispose,
  };
}

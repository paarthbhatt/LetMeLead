import * as React from "react";

import { clampStage, stageMeta, type SceneStage } from "./scene-helpers";
import styles from "./scene-styles.module.css";

export type ScenePosterProps = {
  readonly stage?: SceneStage;
  readonly className?: string;
};

const INK = "#15171c";
const BLUE = "#517be8";
const AMBER = "#d49a39";
const SLATE = "#68717f";

type ChipProps = {
  readonly x: number;
  readonly y: number;
  readonly label: string;
  readonly tone?: string;
  readonly scale?: number;
  readonly muted?: boolean;
};

function Chip({ x, y, label, tone = BLUE, scale = 1, muted = false }: ChipProps) {
  const width = 104 * scale;
  const height = 44 * scale;
  const radius = 9 * scale;

  return (
    <g transform={`translate(${x} ${y})`} opacity={muted ? 0.72 : 1}>
      <rect
        x={-width / 2 + 1}
        y={-height / 2 + 4}
        width={width}
        height={height}
        rx={radius}
        fill="#cfd7e4"
        opacity={0.62}
      />
      <rect
        x={-width / 2}
        y={-height / 2}
        width={width}
        height={height}
        rx={radius}
        fill="#ffffff"
        stroke="#aeb9ca"
        strokeWidth={1.3}
      />
      <rect
        x={-width / 2 + 7 * scale}
        y={-height / 2 + 8 * scale}
        width={3 * scale}
        height={height - 16 * scale}
        rx={1.5 * scale}
        fill={tone}
      />
      <text
        x={-width / 2 + 17 * scale}
        y={1}
        dominantBaseline="middle"
        fill={INK}
        fontSize={12.5 * scale}
        fontWeight={650}
      >
        {label}
      </text>
    </g>
  );
}

function Gate({ x, y, width, height, label }: { x: number; y: number; width: number; height: number; label: string }) {
  return (
    <g>
      <rect
        x={x - width / 2}
        y={y - height / 2}
        width={width}
        height={height}
        rx={12}
        fill="none"
        stroke={BLUE}
        strokeWidth={1.5}
        opacity={0.55}
      />
      <text
        x={x}
        y={y - height / 2 - 12}
        textAnchor="middle"
        fill={SLATE}
        fontSize={9.5}
        fontWeight={700}
        letterSpacing={1.4}
      >
        {label}
      </text>
    </g>
  );
}

function StageCaption({ code, label }: { code: string; label: string }) {
  return (
    <g transform="translate(58 430)">
      <circle cx={3} cy={-3.5} r={3} fill={BLUE} />
      <text x={13} y={0} fill={INK} fontSize={10.5} fontWeight={700} letterSpacing={1.5}>
        {code} / {label.toUpperCase()}
      </text>
      <text x={524} y={0} textAnchor="end" fill={SLATE} fontSize={9.5} fontWeight={600} letterSpacing={1.5}>
        EVIDENCE SORTER
      </text>
    </g>
  );
}

function CollectStage() {
  return (
    <g>
      <ellipse cx={320} cy={392} rx={252} ry={20} fill="#cfd8e6" opacity={0.55} />
      <path d="M 60 150 C 200 150 330 210 470 225" fill="none" stroke={BLUE} strokeWidth={1.5} opacity={0.5} />
      <path d="M 60 340 C 200 340 330 270 470 255" fill="none" stroke={BLUE} strokeWidth={1.5} opacity={0.5} />

      <g>
        <circle cx={522} cy={240} r={42} fill="#ffffff" stroke="#59667a" strokeWidth={2} />
        <circle cx={522} cy={240} r={27} fill="none" stroke="#c3cbdb" strokeWidth={1.2} />
        <circle cx={522} cy={240} r={7} fill={BLUE} />
        <text x={522} y={174} textAnchor="middle" fill="#355cb3" fontSize={11} fontWeight={700} letterSpacing={1.6}>
          INTAKE
        </text>
      </g>

      <Chip x={126} y={140} label="Funding" />
      <Chip x={250} y={186} label="Launch" />
      <Chip x={374} y={232} label="Press" tone={AMBER} />
      <Chip x={136} y={336} label="Hiring" />
      <Chip x={256} y={300} label="Docs" />
      <Chip x={380} y={268} label="Shift" tone={AMBER} />
    </g>
  );
}

function QualifyStage() {
  return (
    <g>
      <ellipse cx={318} cy={396} rx={244} ry={16} fill="#dfe5ee" opacity={0.42} />
      <path d="M 50 160 H 560" fill="none" stroke={BLUE} strokeWidth={1.1} strokeDasharray="2 7" opacity={0.45} />

      <Gate x={185} y={160} width={96} height={82} label="FIT" />
      <Gate x={315} y={240} width={104} height={88} label="TIMING" />
      <Gate x={445} y={320} width={90} height={76} label="OWNER" />

      <Chip x={105} y={160} label="Funding" scale={0.8} />
      <Chip x={185} y={160} label="Hiring" scale={0.9} />
      <Chip x={315} y={240} label="Launch" scale={0.9} />
      <Chip x={445} y={320} label="Docs" scale={0.86} />

      <Chip x={250} y={390} label="Press" tone={AMBER} scale={0.68} muted />
      <Chip x={390} y={390} label="Shift" tone={AMBER} scale={0.68} muted />

      <text x={318} y={424} textAnchor="middle" fill={SLATE} fontSize={9.5} fontWeight={600} letterSpacing={1.4}>
        2 OF 6 SET ASIDE
      </text>
    </g>
  );
}

function ReviewStage() {
  const rows = [
    { y: 200, label: "Funding" },
    { y: 251, label: "Hiring" },
    { y: 302, label: "Launch" },
    { y: 353, label: "Docs" },
  ];

  return (
    <g>
      <ellipse cx={318} cy={424} rx={196} ry={12} fill="#dfe5ee" opacity={0.42} />
      <rect x={118} y={84} width={416} height={320} rx={18} fill="#dfe5ee" opacity={0.55} />
      <rect x={112} y={76} width={416} height={320} rx={18} fill="#ffffff" stroke="#aeb9ca" strokeWidth={1.4} />

      <rect x={130} y={100} width={3.5} height={44} rx={1.75} fill={BLUE} />
      <text x={146} y={120} fill={INK} fontSize={16} fontWeight={650} letterSpacing={-0.2}>
        LEAD DOSSIER
      </text>
      <text x={146} y={140} fill={SLATE} fontSize={9.5} fontWeight={500}>
        4 evidence rows / for review
      </text>
      <line x1={132} y1={164} x2={508} y2={164} stroke="#c3cbdb" strokeWidth={1} />

      {rows.map((row, index) => (
        <g key={row.label}>
          <Chip x={178} y={row.y} label={row.label} scale={0.9} />
          <line x1={240} y1={row.y} x2={498} y2={row.y} stroke="#c3cbdb" strokeWidth={1} />
          <text
            x={498}
            y={row.y - 8}
            textAnchor="end"
            fill="#8a94a3"
            fontSize={8}
            fontWeight={700}
            letterSpacing={1.2}
          >
            {["SOURCE", "REASON", "AGE", "FIT"][index]}
          </text>
          <circle cx={508} cy={row.y} r={3} fill={row.label === "Docs" ? AMBER : BLUE} />
        </g>
      ))}

      <text x={132} y={376} fill={SLATE} fontSize={9.5} fontWeight={600} letterSpacing={1.4}>
        READY FOR A HUMAN
      </text>
    </g>
  );
}

export function ScenePoster({ stage = 0, className }: ScenePosterProps) {
  const activeStage = clampStage(stage);
  const meta = stageMeta(activeStage);
  const classes = [styles.poster, className].filter(Boolean).join(" ");

  return (
    <svg
      className={classes}
      viewBox="0 0 640 480"
      role="img"
      aria-label={`${meta.label} stage of the evidence sorter. ${meta.description}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {activeStage === 0 && <CollectStage />}
      {activeStage === 1 && <QualifyStage />}
      {activeStage === 2 && <ReviewStage />}
      <StageCaption code={meta.code} label={meta.label} />
    </svg>
  );
}

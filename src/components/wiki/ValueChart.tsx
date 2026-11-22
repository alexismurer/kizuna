"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { Point } from "@/lib/wiki/loadCharacter";

const W = 640;
const H = 160;
const PAD_L = 8;
const PAD_R = 56;
const PAD_T = 12;
const PAD_B = 34;
const BARS_H = 22;

export function ValueChart({
  points,
  median,
  color,
}: {
  points: Point[];
  median: number | null;
  color: string;
}) {
  const t = useTranslations("wiki.value");
  const format = useFormatter();
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const baseY = PAD_T + plotH;

  const values = points.map((p) => p.median);
  if (median != null) values.push(median);
  const hi = values.length ? Math.max(...values) : 0;
  const lo = values.length ? Math.min(...values) : 0;
  const span = hi - lo || 1;
  const x = (i: number) => (points.length < 2 ? PAD_L + plotW / 2 : PAD_L + (i / (points.length - 1)) * plotW);
  const y = (v: number) => PAD_T + (1 - (v - lo) / span) * plotH;

  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.median).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)} ${baseY} L${x(0).toFixed(1)} ${baseY} Z`;

  const maxSales = Math.max(1, ...points.map((p) => p.sales));
  const tickCount = Math.min(5, points.length);
  const ticks =
    tickCount === 0
      ? []
      : Array.from(new Set(Array.from({ length: tickCount }, (_, k) => (tickCount === 1 ? 0 : Math.round((k * (points.length - 1)) / (tickCount - 1))))));
  const barW = Math.max(2, Math.min(14, plotW / Math.max(points.length, 1) - 3));
  const num = (v: number) => format.number(Math.round(v));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={t("title")}>
      <line x1={PAD_L} x2={W - PAD_R} y1={baseY} y2={baseY} stroke="var(--color-border)" strokeOpacity={1} />
      {points.length > 0 && (
        <>
          <text x={W - PAD_R + 6} y={PAD_T + 4} fontSize={10} fill="currentColor" fillOpacity={0.6}>
            {num(hi)}
          </text>
          <text x={W - PAD_R + 6} y={baseY} fontSize={10} fill="currentColor" fillOpacity={0.6}>
            {num(lo)}
          </text>
        </>
      )}
      {points.map((p, i) => {
        const h = Math.max(2, (p.sales / maxSales) * BARS_H);
        return (
          <rect key={p.day} x={x(i) - barW / 2} y={H - 14 - h} width={barW} height={h} fill={color} opacity={0.35} />
        );
      })}
      {points.length > 1 && (
        <>
          <path d={area} fill={color} opacity={0.15} />
          <path data-line d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        </>
      )}
      {median != null && points.length > 0 && (
        <>
          <line
            x1={PAD_L}
            x2={W - PAD_R}
            y1={y(median)}
            y2={y(median)}
            stroke="currentColor"
            strokeOpacity={0.5}
            strokeDasharray="4 4"
          />
          <text x={PAD_L + 2} y={y(median) - 4} fontSize={10} fill="currentColor" fillOpacity={0.7}>
            {t("med", { value: num(median) })}
          </text>
        </>
      )}
      {points.map((p, i) => (
        <circle key={p.day} cx={x(i)} cy={y(p.median)} r={3} fill={color} />
      ))}
      {ticks.map((i) => (
        <text
          key={points[i].day}
          x={x(i)}
          y={H - 2}
          fontSize={10}
          textAnchor={i === 0 && ticks.length > 1 ? "start" : i === points.length - 1 && ticks.length > 1 ? "end" : "middle"}
          fill="currentColor"
          fillOpacity={0.6}
        >
          {format.dateTime(new Date(`${points[i].day}T00:00:00Z`), { month: "short", day: "numeric" })}
        </text>
      ))}
    </svg>
  );
}

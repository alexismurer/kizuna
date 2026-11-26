"use client";

import { motion, useReducedMotion } from "motion/react";
import { useFormatter } from "next-intl";

// One condition on the road to the next Rebirth: dot, label, have / need (have in red until met) and a
// thin bar in the row's colour that fills on mount.
export function RoadRow({ label, have, need, color }: { label: string; have: number; need: number; color: string }) {
  const format = useFormatter();
  const reduce = useReducedMotion();
  const met = have >= need;
  const pct = need > 0 ? Math.min(100, (have / need) * 100) : 100;

  return (
    <div className="flex flex-col gap-1.5 py-2">
      <div className="flex items-center gap-2 text-sm">
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
        <span className="min-w-0 flex-1 truncate text-white/80">{label}</span>
        <span className="shrink-0 font-mono text-xs tabular-nums">
          <span className={met ? "text-white" : "text-red-400"}>{format.number(have)}</span>
          <span className="text-white/40"> / </span>
          <span className="text-white/60">{format.number(need)}</span>
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: reduce ? `${pct}%` : "0%" }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
        />
      </div>
    </div>
  );
}

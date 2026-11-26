"use client";

import { motion, useReducedMotion } from "motion/react";

// A page section that fades up the first time it scrolls into view; `index` staggers the sections
// that are already on screen at load.
export function FadeUp({ index = 0, className, children }: { index?: number; className?: string; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.section
      className={className}
      initial={reduce ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -60px 0px" }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: Math.min(index, 4) * 0.08 }}
    >
      {children}
    </motion.section>
  );
}

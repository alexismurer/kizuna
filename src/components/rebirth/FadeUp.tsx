"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";

// A page section that fades up the first time it scrolls into view. The server render shows every
// section as is (no blank page before hydration or without JS); after mount, only sections still
// below the fold are hidden (off screen, so nothing flickers) and fade up when they enter. `index`
// staggers sections entering together.
export function FadeUp({ index = 0, className, children }: { index?: number; className?: string; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -60px 0px" });
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (reduce || !ref.current) return;
    if (ref.current.getBoundingClientRect().top > window.innerHeight) setArmed(true);
  }, [reduce]);

  return (
    <motion.section
      ref={ref}
      className={className}
      initial={false}
      animate={
        !armed
          ? undefined
          : inView
            ? { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: Math.min(index, 4) * 0.08 } }
            : { opacity: 0, y: 24, transition: { duration: 0 } }
      }
    >
      {children}
    </motion.section>
  );
}

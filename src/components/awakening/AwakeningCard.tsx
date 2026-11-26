"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { CardRow } from "@/lib/social/thread";
import type { Awakening } from "@/lib/rebirth/types";
import { usePrefs } from "@/lib/fx/prefs";
import { EffectLayer } from "./effects";

export type AwakeningSize = "sm" | "md" | "lg";

const WIDTH: Record<AwakeningSize, string> = {
  sm: "w-[110px]",
  md: "w-44",
  lg: "w-72",
};

// An awakened card: the base card's art inside a foil frame in the awakening's accent colour, its
// effect layer over the art, a 覚醒 seal up top, the character's name in a big banner at the bottom
// with the form under it, and the copy number when there is one. Hover (when interactive) lifts it and
// pushes the effect harder; the Animations setting and prefers-reduced-motion leave a still frame.
export function AwakeningCard({
  awakening,
  card,
  serial,
  total,
  size = "md",
  interactive = false,
}: {
  awakening: Pick<Awakening, "title" | "form" | "effect" | "accent" | "total">;
  card: Pick<CardRow, "name" | "image_url">;
  serial?: number;
  total?: number;
  size?: AwakeningSize;
  interactive?: boolean;
}) {
  const [prefs] = usePrefs();
  const [broken, setBroken] = useState(false);
  const of = total ?? awakening.total;
  const reduce = useReducedMotion();
  const lift = interactive && prefs.animations && !reduce;

  return (
    <motion.div
      data-effect={awakening.effect}
      className={`awk relative ${WIDTH[size]} aspect-[5/7] ${interactive ? "awk-live" : ""} ${prefs.animations ? "" : "fx-still"}`}
      style={{ "--accent": awakening.accent } as React.CSSProperties}
      whileHover={lift ? { y: -6, scale: 1.03 } : undefined}
      transition={{ type: "spring", stiffness: 320, damping: 22 }}
    >
      <span aria-hidden className="awk-halo" />
      <div className="awk-frame">
        <div className="awk-face">
          {card.image_url && !broken ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.image_url}
              alt=""
              loading="lazy"
              onError={() => setBroken(true)}
              className="awk-art"
            />
          ) : (
            <div className="awk-art awk-art-empty" />
          )}
          <EffectLayer effect={awakening.effect} />
          <span aria-hidden className="awk-vignette" />
          <div className="awk-top">
            <span className="awk-seal" lang="ja">
              覚醒
            </span>
            {serial != null && (
              <span className="awk-serial">
                #{serial}
                <span className="awk-serial-of">/{of}</span>
              </span>
            )}
          </div>
          <div className="awk-banner">
            <span className="awk-title">{awakening.title}</span>
            <span className="awk-name">{card.name}</span>
            <span className="awk-form">{awakening.form}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

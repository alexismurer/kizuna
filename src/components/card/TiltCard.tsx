"use client";

import { useRef, useState } from "react";
import type { Rarity } from "@/lib/game/types";
import { usePrefs } from "@/lib/fx/prefs";
import { COLOR } from "./rarityColor";

// A card that tilts toward the pointer with a prism + light under it, a periodic light sweep and a
// turning halo in its rarity colour. Up to 9° forward/back and 12° sideways, flat at the centre.
export function TiltCard({
  rarity,
  label,
  onClick,
  children,
}: {
  rarity: Rarity;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const [prefs] = usePrefs();
  const body = useRef<HTMLDivElement>(null);
  const [tilting, setTilting] = useState(false);

  function move(e: React.PointerEvent<HTMLButtonElement>) {
    if (!prefs.animations || !body.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    const mx = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
    const my = Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100));
    const s = body.current.style;
    s.setProperty("--mx", `${mx}%`);
    s.setProperty("--my", `${my}%`);
    s.setProperty("--rx", `${((50 - my) / 50) * 9}deg`);
    s.setProperty("--ry", `${((mx - 50) / 50) * 12}deg`);
    setTilting(true);
  }

  function leave() {
    const s = body.current?.style;
    if (s) for (const k of ["--mx", "--my", "--rx", "--ry"]) s.removeProperty(k);
    setTilting(false);
  }

  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      onPointerMove={move}
      onPointerLeave={leave}
      data-rarity={rarity}
      className={`tilt-card block w-full cursor-zoom-in rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-white ${tilting ? "tilting" : ""} ${prefs.animations ? "" : "fx-still"}`}
      style={{ "--glow": COLOR[rarity] } as React.CSSProperties}
    >
      {prefs.animations && <span aria-hidden className="tilt-aura" />}
      <div ref={body} className="tilt-body">
        {children}
        <span aria-hidden className="tilt-prism" />
        <span aria-hidden className="tilt-shine" />
        <span aria-hidden className="tilt-sweep" />
      </div>
    </button>
  );
}

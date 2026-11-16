"use client";

import { useEffect, useRef } from "react";
import type { Rarity } from "@/lib/game/types";

const COUNT = 48;
const GOLD_COUNT = 90;
const TEAR_SHARDS = 60;
const FLIP_SHARDS: Partial<Record<Rarity, number>> = { epic: 80, legendary: 120, mythic: 150 };

type Particle = { x: number; y: number; r: number; vx: number; vy: number; phase: number; light: number; color: number };
type Shard = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  va: number;
  size: number;
  color: string;
  age: number;
  life: number;
  gravity: number;
  drag: number;
  tri: boolean;
  glow: boolean;
};

// Where shards burst from, in viewport pixels. "tear": the torn top edge of the
// pack (x..x+w at y), white / gold / grey triangles thrown up. "flip": the
// centre of a revealed card's art (x + w/2, y), spreading out in the tone's
// colour after `delay` seconds.
export type Burst = {
  x: number;
  y: number;
  w: number;
  id: number;
  kind: "tear" | "flip";
  tone?: Rarity;
  delay?: number;
};

const TOKEN: Record<Rarity, string> = {
  common: "--color-common",
  uncommon: "--color-uncommon",
  rare: "--color-rare",
  epic: "--color-epic",
  legendary: "--color-legendary",
  mythic: "--mythic-a",
};

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#ffffff";
}

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

function shards(b: Burst): Shard[] {
  const delay = b.delay ?? 0;
  if (b.kind === "tear") {
    const colors = ["#ffffff", "#ffffff", token("--color-cta"), token("--color-legendary"), token("--color-common")];
    return Array.from({ length: TEAR_SHARDS }, () => ({
      x: b.x + Math.random() * b.w,
      y: b.y,
      vx: (Math.random() - 0.35) * 520,
      vy: -(280 + Math.random() * 460),
      a: Math.random() * Math.PI,
      va: (Math.random() - 0.5) * 16,
      size: 4 + Math.random() * 7,
      color: pick(colors),
      age: -delay,
      life: 1.2,
      gravity: 900,
      drag: 0.6,
      tri: true,
      glow: false,
    }));
  }
  const tone = token(TOKEN[b.tone ?? "epic"]);
  const colors = [tone, tone, tone, "#ffffff"];
  const cx = b.x + b.w / 2;
  return Array.from({ length: FLIP_SHARDS[b.tone ?? "epic"] ?? 80 }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 180 + Math.random() * 620;
    return {
      x: cx + Math.cos(angle) * 6,
      y: b.y + Math.sin(angle) * 6,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      a: Math.random() * Math.PI,
      va: (Math.random() - 0.5) * 12,
      size: 2.5 + Math.random() * 5,
      color: pick(colors),
      age: -delay,
      life: 0.9 + Math.random() * 0.6,
      gravity: 160,
      drag: 1.5,
      tri: Math.random() < 0.35,
      glow: true,
    };
  });
}

// Slowly rising motes in the pack colour (gold and denser for a golden reveal),
// plus shards thrown out when a pack is torn or an Epic+ card flips. Not
// rendered when animations are off; paused while the tab is hidden.
export function FxLayer({
  hue,
  enabled,
  burst = null,
  ambient = false,
}: {
  hue: number;
  enabled: boolean;
  burst?: Burst | null;
  // a golden reveal: warm gold motes
  ambient?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef<Shard[]>([]);

  useEffect(() => {
    if (!enabled || !burst) return;
    live.current.push(...shards(burst));
  }, [burst, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const gold = [token("--color-cta"), token("--color-legendary")];
    const spawn = (anywhere: boolean): Particle => ({
      x: Math.random() * w,
      y: anywhere ? Math.random() * h : h + 8,
      r: ambient ? 1 + Math.random() * 2.6 : 0.6 + Math.random() * 1.8,
      vx: (Math.random() - 0.5) * 8,
      vy: ambient ? 22 + Math.random() * 30 : 8 + Math.random() * 18,
      phase: Math.random() * Math.PI * 2,
      light: 60 + Math.random() * 30,
      color: Math.floor(Math.random() * gold.length),
    });
    const parts = Array.from({ length: ambient ? GOLD_COUNT : COUNT }, () => spawn(true));

    let raf = 0;
    let last = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.y -= p.vy * dt;
        p.x += p.vx * dt + Math.sin(now / 1200 + p.phase) * 0.2;
        if (p.y < -8) Object.assign(p, spawn(false));
        const a = 0.2 + 0.4 * (0.5 + 0.5 * Math.sin(now / 700 + p.phase));
        if (ambient) {
          ctx.fillStyle = gold[p.color];
          ctx.globalAlpha = a * 0.3;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = Math.min(1, a + 0.35);
        } else {
          ctx.fillStyle = `hsla(${hue}, 90%, ${p.light}%, ${a.toFixed(2)})`;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      live.current = live.current.filter((s) => (s.age += dt) < s.life);
      for (const s of live.current) {
        if (s.age < 0) continue;
        const k = Math.exp(-s.drag * dt);
        s.vx *= k;
        s.vy = s.vy * k + s.gravity * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.a += s.va * dt;
        const fade = 1 - s.age / s.life;
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.a);
        ctx.fillStyle = s.color;
        if (s.glow) {
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = fade * 0.35;
          ctx.beginPath();
          ctx.arc(0, 0, s.size * 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = fade;
        ctx.beginPath();
        if (s.tri) {
          ctx.moveTo(0, -s.size);
          ctx.lineTo(s.size * 0.87, s.size * 0.5);
          ctx.lineTo(-s.size * 0.87, s.size * 0.5);
          ctx.closePath();
        } else {
          ctx.arc(0, 0, s.size / 2, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.restore();
      }
      raf = requestAnimationFrame(frame);
    };
    const start = () => {
      if (raf || document.hidden) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const onVisibility = () => (document.hidden ? stop() : start());

    start();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", resize);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", resize);
    };
  }, [enabled, hue, ambient]);

  if (!enabled) return null;
  return (
    <canvas
      ref={ref}
      aria-hidden
      data-ambient={ambient ? "golden" : undefined}
      className="pointer-events-none fixed inset-0 z-20 h-full w-full"
    />
  );
}

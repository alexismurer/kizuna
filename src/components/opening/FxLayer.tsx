"use client";

import { useEffect, useRef } from "react";

const COUNT = 48;
const SHARDS = 40;
const GRAVITY = 900; // px/s²
const SHARD_LIFE = 1.1; // s

type Particle = { x: number; y: number; r: number; vx: number; vy: number; phase: number; light: number };
type Shard = { x: number; y: number; vx: number; vy: number; a: number; va: number; w: number; h: number; light: number; hue: number; age: number };

// Where shards burst from (the torn top edge of the pack, or a revealed card),
// in viewport pixels; hue and count override the pack colour and SHARDS.
export type Burst = { x: number; y: number; w: number; id: number; hue?: number; count?: number };

// Slowly rising motes in the pack colour, plus confetti shards thrown out of
// the pack when it is torn. Not rendered when animations are off; paused while
// the tab is hidden.
export function FxLayer({
  hue,
  enabled,
  burst = null,
}: {
  hue: number;
  enabled: boolean;
  burst?: Burst | null;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const shards = useRef<Shard[]>([]);

  useEffect(() => {
    if (!enabled || !burst) return;
    const base = burst.hue ?? hue;
    for (let i = 0; i < (burst.count ?? SHARDS); i++) {
      const white = Math.random() < 0.3;
      shards.current.push({
        x: burst.x + Math.random() * burst.w,
        y: burst.y,
        vx: (Math.random() - 0.5) * 340,
        vy: -(260 + Math.random() * 380),
        a: Math.random() * Math.PI,
        va: (Math.random() - 0.5) * 14,
        w: 3 + Math.random() * 5,
        h: 2 + Math.random() * 3,
        light: white ? 95 : 55 + Math.random() * 25,
        hue: base + (Math.random() - 0.5) * 60,
        age: 0,
      });
    }
  }, [burst, enabled, hue]);

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

    const spawn = (anywhere: boolean): Particle => ({
      x: Math.random() * w,
      y: anywhere ? Math.random() * h : h + 8,
      r: 0.6 + Math.random() * 1.8,
      vx: (Math.random() - 0.5) * 8,
      vy: 8 + Math.random() * 18,
      phase: Math.random() * Math.PI * 2,
      light: 60 + Math.random() * 30,
    });
    const parts = Array.from({ length: COUNT }, () => spawn(true));

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
        ctx.fillStyle = `hsla(${hue}, 90%, ${p.light}%, ${a.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      shards.current = shards.current.filter((s) => (s.age += dt) < SHARD_LIFE);
      for (const s of shards.current) {
        s.vy += GRAVITY * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.a += s.va * dt;
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.a);
        ctx.globalAlpha = 1 - s.age / SHARD_LIFE;
        ctx.fillStyle = `hsl(${s.hue}, 90%, ${s.light}%)`;
        ctx.fillRect(-s.w / 2, -s.h / 2, s.w, s.h);
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
  }, [enabled, hue]);

  if (!enabled) return null;
  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 h-full w-full"
    />
  );
}

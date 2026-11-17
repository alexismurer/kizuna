"use client";

import { CalendarDays } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

const RING = 2 * Math.PI * 45;

// The daily pack: a fabric pouch with a date tag, closed by a cord on top.
export function PouchFace({ name, hue, cards, hold }: { name: string; hue: number; cards: number; hold: number }) {
  const t = useTranslations("opening");
  const format = useFormatter();
  const today = new Date();
  return (
    <div
      className="absolute inset-0 overflow-hidden rounded-[10px] border border-white/25"
      style={{
        background: `linear-gradient(160deg, hsl(${hue} 70% 52%), hsl(${hue} 65% 34%))`,
        boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.35), inset 0 -18px 30px -12px rgb(0 0 0 / 0.45)",
      }}
    >
      {/* woven lattice */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          background:
            "repeating-linear-gradient(60deg, transparent 0 9px, rgb(255 255 255 / 0.35) 9px 10px), repeating-linear-gradient(-60deg, transparent 0 9px, rgb(255 255 255 / 0.35) 9px 10px)",
        }}
      />
      {/* the gathered top above the tie line */}
      <div
        className="absolute inset-x-0 top-0 h-[18%]"
        style={{ background: `linear-gradient(to bottom, hsl(${hue} 60% 62% / 0.6), transparent)` }}
      />
      <div className="absolute inset-x-0 top-[18%] h-[1.5%] bg-[#f4ead2]/80" />
      {/* the paper label */}
      <div className="absolute inset-x-[13%] bottom-[5%] top-[23%] flex flex-col items-center rounded-[6px] border-2 border-black/15 bg-[#f4ead2] px-[4cqw] pt-[5cqw] text-[#1c1a24] shadow-inner">
        <div
          data-testid="pouch-date"
          className="flex w-[30cqw] flex-col items-center overflow-hidden rounded-[4px] bg-white shadow"
        >
          <span className="h-[2.5cqw] w-full bg-[#e5533d]" />
          <span suppressHydrationWarning className="font-display text-[11cqw] font-bold leading-none">
            {format.dateTime(today, { day: "numeric" })}
          </span>
          <span suppressHydrationWarning className="pb-[1cqw] font-mono text-[4.5cqw] leading-none text-black/60">
            {format.dateTime(today, { month: "short" })}
          </span>
        </div>
        <div className="relative mt-[6cqw] flex h-[22cqw] w-[22cqw] items-center justify-center">
          <CalendarDays className="h-[17cqw] w-[17cqw]" style={{ color: `hsl(${hue} 60% 32%)` }} strokeWidth={1.75} />
          {hold > 0 && (
            <svg viewBox="0 0 100 100" className="absolute -inset-[3cqw] -rotate-90">
              <circle cx="50" cy="50" r="45" fill="none" stroke="rgb(0 0 0 / 0.12)" strokeWidth="5" />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke={`hsl(${hue} 60% 32%)`}
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={RING}
                strokeDashoffset={RING * (1 - hold)}
              />
            </svg>
          )}
        </div>
        <span className="mt-[3cqw] text-[4.5cqw] text-black/60">{t("dailyPack")}</span>
        <span className="text-center font-display text-[8cqw] font-bold leading-tight">{name}</span>
        <span className="mt-auto pb-[3cqw] font-mono text-[4.5cqw] text-black/55">{t("cards", { count: cards })}</span>
      </div>
    </div>
  );
}

// Two loops and a knot over the pouch's top edge; lifted by the pull.
export function Cord({ lift }: { lift: number }) {
  return (
    <svg
      aria-hidden
      data-testid="pack-cord"
      viewBox="0 0 80 44"
      className="absolute left-1/2 top-0 w-[30%] cursor-grab"
      style={{ transform: `translate(-50%, calc(-78% - ${lift}px))` }}
    >
      <g fill="none" stroke="#e5533d" strokeWidth="5" strokeLinecap="round">
        <ellipse cx="24" cy="18" rx="17" ry="12" transform="rotate(-12 24 18)" />
        <ellipse cx="56" cy="18" rx="17" ry="12" transform="rotate(12 56 18)" />
        <path d="M40 30 L40 44" />
      </g>
      <circle cx="40" cy="30" r="6" fill="#c63f2b" stroke="#f4ead2" strokeWidth="1.5" />
    </svg>
  );
}

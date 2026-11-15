"use client";

import { useEffect, useRef } from "react";
import { Package } from "lucide-react";
import { useTranslations } from "next-intl";
import { EMBLEM } from "@/components/PackArt";

const MAX_TILT = 12; // degrees

const clamp = (v: number) => Math.max(-0.5, Math.min(0.5, v));

export function PackStage({
  packId,
  name,
  hue,
  animations,
}: {
  packId: string;
  name: string;
  hue: number;
  animations: boolean;
}) {
  const t = useTranslations("card");
  const tiltRef = useRef<HTMLDivElement>(null);
  const Icon = EMBLEM[packId] ?? Package;

  const resetTilt = () => {
    if (tiltRef.current) tiltRef.current.style.transform = "";
  };

  useEffect(() => {
    if (!animations) resetTilt();
  }, [animations]);

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!animations || !tiltRef.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = clamp((e.clientX - r.left) / r.width - 0.5);
    const y = clamp((e.clientY - r.top) / r.height - 0.5);
    tiltRef.current.style.transform = `rotateX(${(-y * 2 * MAX_TILT).toFixed(2)}deg) rotateY(${(x * 2 * MAX_TILT).toFixed(2)}deg)`;
  }

  return (
    <div
      onPointerMove={onPointerMove}
      onPointerLeave={resetTilt}
      className="flex w-full flex-1 flex-col items-center justify-center py-2 [perspective:900px]"
    >
      <div className={animations ? "pack-bob" : undefined}>
        <div
          ref={tiltRef}
          className="relative h-[15rem] w-[10.5rem] transition-transform duration-200 ease-out [transform-style:preserve-3d] sm:h-[20rem] sm:w-[14rem]"
        >
          <div
            className="relative h-full w-full overflow-hidden rounded-[14px] border border-white/25"
            style={{
              background: `linear-gradient(160deg, hsl(${hue} 85% 66%), hsl(${hue} 75% 42%) 45%, hsl(${hue} 70% 18%))`,
              boxShadow: `0 24px 70px -12px hsl(${hue} 85% 50% / 0.65), inset 0 1px 0 rgb(255 255 255 / 0.4)`,
            }}
          >
            {/* crimped seals */}
            <div
              className="absolute inset-x-0 top-0 h-3 border-b border-white/20"
              style={{ background: "repeating-linear-gradient(90deg, rgb(255 255 255 / 0.3) 0 3px, transparent 3px 6px)" }}
            />
            <div
              className="absolute inset-x-0 bottom-0 h-3 border-t border-white/20"
              style={{ background: "repeating-linear-gradient(90deg, rgb(255 255 255 / 0.3) 0 3px, transparent 3px 6px)" }}
            />
            {/* foil */}
            <div
              className="absolute inset-0 opacity-25"
              style={{ background: "repeating-linear-gradient(115deg, transparent 0 10px, rgb(255 255 255 / 0.22) 10px 12px)" }}
            />
            <div
              className="absolute inset-0"
              style={{ background: "radial-gradient(circle at 50% 42%, rgb(255 255 255 / 0.25), transparent 55%)" }}
            />
            {animations && <div className="holo absolute inset-0" />}
            <span className="absolute inset-x-0 top-6 text-center font-mono text-[10px] tracking-[0.35em] text-white/80">
              {t("brand")}
            </span>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-3">
              <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-white/60 bg-black/20 shadow-lg backdrop-blur-sm sm:h-24 sm:w-24">
                <Icon className="h-10 w-10 sm:h-12 sm:w-12" color="white" strokeWidth={1.75} />
              </div>
              <span className="text-center font-display text-xl leading-tight text-white drop-shadow sm:text-2xl">
                {name}
              </span>
            </div>
          </div>
        </div>
      </div>
      <div
        aria-hidden
        className={`mt-4 h-3 w-28 rounded-full bg-black/70 blur-md sm:w-36 ${animations ? "pack-shadow-bob" : ""}`}
      />
    </div>
  );
}

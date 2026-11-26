"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronsUp, Coins, Layers, Package, Sparkles, Trophy } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Dialog } from "@/components/market/Dialog";
import type { RebirthStatus } from "@/lib/rebirth/types";

const HOLD_MS = 1200;
const RING = 2 * Math.PI * 9;

// The confirm button: it only fires after being held for 1.2 s (pointer, Space or Enter). Letting go early
// cancels, and the ring around the icon shows how far along the hold is.
function HoldButton({ label, holdingLabel, disabled, onDone }: { label: string; holdingLabel: string; disabled: boolean; onDone: () => void }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => () => clearTimeout(timer.current ?? undefined), []);

  const start = () => {
    if (disabled || timer.current) return;
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setHolding(false);
      done.current();
    }, HOLD_MS);
  };
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };
  const isKey = (e: React.KeyboardEvent) => e.key === " " || e.key === "Enter";

  return (
    <button
      type="button"
      disabled={disabled}
      aria-describedby="rebirth-hold-hint"
      onPointerDown={(e) => e.button === 0 && start()}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (!isKey(e)) return;
        e.preventDefault();
        if (!e.repeat) start();
      }}
      onKeyUp={(e) => {
        if (!isKey(e)) return;
        e.preventDefault();
        stop();
      }}
      onBlur={stop}
      className="relative flex touch-none select-none items-center justify-center gap-2.5 overflow-hidden rounded-full bg-gradient-to-b from-[#ffe27a] to-[#f5b301] py-3 pl-3 pr-6 font-display text-base font-extrabold text-black shadow-[0_0_30px_rgb(245_179_1/0.35)] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cta disabled:opacity-50 sm:text-lg"
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-full origin-left bg-white/45"
        style={{
          transform: `scaleX(${holding ? 1 : 0})`,
          transition: holding ? `transform ${HOLD_MS}ms linear` : "transform 200ms ease-out",
        }}
      />
      <svg aria-hidden viewBox="0 0 24 24" className="relative h-7 w-7 -rotate-90">
        <circle cx="12" cy="12" r="9" fill="none" stroke="rgb(0 0 0 / 0.18)" strokeWidth="3" />
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke="#000"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={RING}
          style={{
            strokeDashoffset: holding ? 0 : RING,
            transition: holding ? `stroke-dashoffset ${HOLD_MS}ms linear` : "stroke-dashoffset 200ms ease-out",
          }}
        />
      </svg>
      <span className="relative">{holding ? holdingLabel : label}</span>
    </button>
  );
}

function Row({ icon: Icon, children, tone }: { icon: typeof Coins; children: React.ReactNode; tone: "gone" | "gain" }) {
  return (
    <li className="flex items-start gap-2.5 text-sm leading-snug">
      <Icon aria-hidden className={`mt-0.5 h-4 w-4 shrink-0 ${tone === "gone" ? "text-[#f2643d]" : "text-cta"}`} />
      <span>{children}</span>
    </li>
  );
}

// "Be reborn?" with what goes and what you get, then a hold-to-confirm button.
export function RebirthDialog({
  tier,
  preview,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  tier: number;
  preview: RebirthStatus["preview"];
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("rebirth.confirm");
  const te = useTranslations();
  const format = useFormatter();
  const next = tier + 1;
  const title = t("title", { tier: next });

  return (
    <Dialog label={title} title={title} size="sheet" onClose={busy ? () => {} : onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <section className="rounded-xl border border-[#f2643d]/30 bg-[#f2643d]/[0.06] p-4">
          <h3 className="font-display text-sm font-bold text-[#ff8a66]">{t("goes")}</h3>
          <ul className="mt-3 flex flex-col gap-2.5">
            <Row icon={Layers} tone="gone">
              {t("copies", { count: preview.removeCopies })}
            </Row>
            <Row icon={Coins} tone="gone">
              {t("currency", { amount: format.number(preview.currencyGain) })}
            </Row>
          </ul>
        </section>
        <section className="rounded-xl border border-cta/35 bg-cta/[0.07] p-4">
          <h3 className="font-display text-sm font-bold text-cta">{t("gains")}</h3>
          <ul className="mt-3 flex flex-col gap-2.5">
            <Row icon={ChevronsUp} tone="gain">
              {t("level", { tier: next })}
            </Row>
            <Row icon={Package} tone="gain">
              {t("seal")}
            </Row>
            <Row icon={Sparkles} tone="gain">
              {t("chance", { mult: Math.max(1, Math.min(next, 5)) })}
            </Row>
            <Row icon={Trophy} tone="gain">
              {t("renown", { amount: format.number(preview.renownBank) })}
            </Row>
          </ul>
        </section>
      </div>

      <p id="rebirth-hold-hint" className="mt-4 text-xs text-white/55">
        {t("hint")}
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {te(error)}
        </p>
      )}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <button type="button" onClick={onClose} disabled={busy} className="rounded-full border border-border px-5 py-3 text-sm font-bold disabled:opacity-50">
          {t("cancel")}
        </button>
        {busy ? (
          <p role="status" className="px-5 py-3 text-center font-display font-bold text-cta">
            {t("busy")}
          </p>
        ) : (
          <HoldButton label={t("hold")} holdingLabel={t("holding")} disabled={busy} onDone={onConfirm} />
        )}
      </div>
    </Dialog>
  );
}

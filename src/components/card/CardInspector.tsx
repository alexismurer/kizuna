"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { RecycleButton } from "@/components/RecycleButton";
import { Link } from "@/i18n/navigation";
import { tiltFor } from "@/lib/card/tilt";
import { usePrefs } from "@/lib/fx/prefs";
import { recyclable, RECYCLE_VALUE } from "@/lib/game/recycle";
import { createBrowserClient } from "@/lib/supabase/client";
import { COLOR, CardView, type CardFace } from "./CardView";

const RAYS = new Set(["legendary", "mythic"]);

// A card shown large: tilt it with the pointer, tap to flip it to its back
// (owners count, owned since, link to the card page). Esc / ✕ / backdrop close it.
// `owned` (from the collection) adds a Recycle-one button while a spare, unlocked copy exists.
export function CardInspector({
  card,
  owned,
  onClose,
}: {
  card: CardFace & { id: number; sourceId: number };
  owned?: { count: number; locked: number; protected: boolean };
  onClose: () => void;
}) {
  const t = useTranslations("inspector");
  const tr = useTranslations("rarity");
  const tc = useTranslations("card");
  const format = useFormatter();
  const [prefs] = usePrefs();
  const [flipped, setFlipped] = useState(false);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, gx: 50, gy: 50 });
  const [owners, setOwners] = useState<number | null>(null);
  const [since, setSince] = useState<string | null | undefined>(undefined);
  const latest = useRef(onClose);
  useEffect(() => {
    latest.current = onClose;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && latest.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let live = true;
    const supabase = createBrowserClient();
    supabase.rpc("card_owners", { p_card_id: card.id }).then(({ data }) => {
      if (live) setOwners((data as number | null) ?? null);
    });
    supabase
      .from("inventory")
      .select("first_at")
      .eq("card_id", card.id)
      .maybeSingle()
      .then(({ data }) => {
        if (live) setSince((data as { first_at: string | null } | null)?.first_at ?? null);
      });
    return () => {
      live = false;
    };
  }, [card.id]);

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!prefs.animations) return;
    const r = e.currentTarget.getBoundingClientRect();
    const { rx, ry } = tiltFor(e.clientX, e.clientY, r);
    setTilt({
      rx,
      ry,
      gx: ((e.clientX - r.left) / r.width) * 100,
      gy: ((e.clientY - r.top) / r.height) * 100,
    });
  }

  const color = COLOR[card.rarity];
  const tile = "rounded-xl border border-white/10 bg-black/30 px-3 py-2";
  const tileLabel = "font-mono text-[10px] uppercase tracking-[0.15em] text-white/50";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={card.name}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 p-4"
    >
      <div aria-hidden className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <button
        type="button"
        aria-label={t("close")}
        onClick={onClose}
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/50 hover:bg-white/10"
      >
        <X aria-hidden className="h-5 w-5" />
      </button>
      {RAYS.has(card.rarity) && prefs.animations && (
        <div
          aria-hidden
          data-testid="inspector-rays"
          className="inspector-rays pointer-events-none absolute h-[620px] w-[620px] max-w-[150vw] rounded-full"
          style={{ "--fx": color } as React.CSSProperties}
        />
      )}
      <div
        className="relative"
        style={{ perspective: "900px" }}
        onPointerMove={onMove}
        onPointerLeave={() => setTilt({ rx: 0, ry: 0, gx: 50, gy: 50 })}
      >
        <div
          role="button"
          tabIndex={0}
          aria-label={t("flip")}
          data-testid="inspector-card"
          data-flipped={flipped}
          onClick={() => setFlipped((f) => !f)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setFlipped((f) => !f);
            }
          }}
          className="relative cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-white"
          style={{
            transformStyle: "preserve-3d",
            transition: prefs.animations ? "transform 0.5s cubic-bezier(.2,.7,.2,1)" : "none",
            transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry + (flipped ? 180 : 0)}deg)`,
          }}
        >
          <div aria-hidden={flipped} className="backface-hidden">
            <CardView card={card} size="lg" />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-xl mix-blend-overlay"
              style={{
                background: `radial-gradient(circle at ${tilt.gx}% ${tilt.gy}%, rgb(255 255 255 / 0.35), transparent 55%)`,
              }}
            />
          </div>
          <div
            aria-hidden={!flipped}
            className="backface-hidden absolute inset-0 flex flex-col gap-3 overflow-hidden rounded-xl border-2 p-5 text-left"
            style={{
              transform: "rotateY(180deg)",
              borderColor: color,
              background: `linear-gradient(160deg, color-mix(in srgb, ${color} 28%, #15151b), #0b0b0f 70%)`,
            }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-bold" style={{ color }}>
                {tr(card.rarity)}
              </span>
              <span className="font-mono text-xs text-white/50">
                #{String(card.number).padStart(4, "0")}/{card.total}
              </span>
            </div>
            <div>
              <p className="font-display text-2xl leading-tight">{card.name}</p>
              {card.nativeName && <p className="text-sm text-white/60">{card.nativeName}</p>}
              <p className="mt-1 text-sm text-white/70">{card.seriesTitle}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className={tile}>
                <p className={tileLabel}>{tc("pow")}</p>
                <p className="font-mono text-lg font-bold">{card.pow}</p>
              </div>
              <div className={tile}>
                <p className={tileLabel}>{tc("aura")}</p>
                <p className="font-mono text-lg font-bold">{card.aura}</p>
              </div>
              <div className={tile}>
                <p className={tileLabel}>{t("owners")}</p>
                <p className="font-mono text-lg font-bold">{owners === null ? "…" : format.number(owners)}</p>
              </div>
              <div className={tile}>
                <p className={tileLabel}>{t("since")}</p>
                <p className="text-sm font-bold">
                  {since === undefined
                    ? "…"
                    : since
                      ? format.dateTime(new Date(since), { dateStyle: "long" })
                      : t("notOwned")}
                </p>
              </div>
            </div>
            <Link
              href={`/wiki/${card.sourceId}`}
              onClick={(e) => e.stopPropagation()}
              className="mt-auto text-sm font-bold text-accent hover:underline"
            >
              {t("page")}
            </Link>
          </div>
        </div>
      </div>
      <p className="relative text-xs text-white/60">{t("hint")}</p>
      {owned && !owned.protected && recyclable(owned.count, owned.locked) >= 1 && (
        <div className="relative">
          <RecycleButton mode="one" cardId={card.id} estimate={RECYCLE_VALUE[card.rarity]} />
        </div>
      )}
    </div>
  );
}

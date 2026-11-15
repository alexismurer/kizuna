"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Link2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { COLOR, CardView } from "@/components/card/CardView";
import type { CardSize } from "@/components/card/CardBack";
import { Link } from "@/i18n/navigation";
import { bestCard, compareCards } from "@/lib/opening/best";
import { QuantitySelect } from "./QuantitySelect";
import type { RevealCard } from "./RevealFlow";

const TOAST_MS = 2500;
const FLY_MS = 300;
const STAGGER_MAX_MS = 300; // last card starts by then: ≤ 600 ms in all
// html-to-image draws this when a card image can't be fetched
const BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

function useDesktop() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(min-width: 768px)");
    const on = () => setDesktop(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return desktop;
}

type Slot = { c: RevealCard; best: boolean };

export function Summary({
  packName,
  cards,
  packCount,
  quantityOptions,
  quantity,
  onQuantity,
  openLabel,
  busy,
  onOpenAgain,
  openRef,
  collectionHref,
  animations,
}: {
  packName: string;
  cards: RevealCard[];
  packCount: number;
  quantityOptions: number[];
  quantity: number;
  onQuantity: (n: number) => void;
  openLabel: string;
  busy: boolean;
  onOpenAgain: (n: number) => void;
  openRef?: React.Ref<HTMLButtonElement>;
  collectionHref: string;
  animations: boolean;
}) {
  const t = useTranslations("summary");
  const tr = useTranslations();
  const desktop = useDesktop();
  const captureRef = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(id);
  }, [toast]);

  const fresh = cards.filter((c) => c.isNew).length;
  const multi = packCount > 1;
  const best = bestCard(cards.map((c) => ({ rarity: c.rarity, number: c.card.number })));

  let slots: Slot[];
  if (multi) {
    // the best card sorts first
    slots = cards
      .map((c, i) => ({ c, best: i === best }))
      .sort((a, b) =>
        compareCards(
          { rarity: a.c.rarity, number: a.c.card.number },
          { rarity: b.c.rarity, number: b.c.card.number },
        ),
      );
  } else {
    // the best card in the middle, the others in pull order around it
    const others: Slot[] = cards.filter((_, i) => i !== best).map((c) => ({ c, best: false }));
    others.splice(Math.floor(others.length / 2), 0, { c: cards[best], best: true });
    slots = best < 0 ? [] : others;
  }

  const step = slots.length > 1 ? Math.min(70, STAGGER_MAX_MS / (slots.length - 1)) : 0;
  const fly = (i: number): React.CSSProperties | undefined =>
    animations
      ? { animation: `summary-in ${FLY_MS}ms cubic-bezier(.2,.7,.2,1) ${Math.round(i * step)}ms both` }
      : undefined;

  async function copyLink() {
    const url = location.href;
    try {
      if (!navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(url);
      setToast(t("copied"));
    } catch {
      setToast(url);
    }
  }

  async function exportImage() {
    const node = captureRef.current;
    if (!node || exporting) return;
    setExporting(true);
    try {
      const { toPng } = await import("html-to-image");
      const url = await toPng(node, {
        pixelRatio: 2,
        backgroundColor: "#0b0b0f",
        imagePlaceholder: BLANK,
      });
      const a = document.createElement("a");
      a.download = "anicards-pull.png";
      a.href = url;
      a.click();
    } catch {
      setToast(t("imageError"));
    } finally {
      setExporting(false);
    }
  }

  function label(s: Slot) {
    return (
      <span
        className="whitespace-nowrap rounded-full bg-black/70 px-2.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.2em]"
        style={{ color: COLOR[s.c.rarity] }}
      >
        {t("best")}
      </span>
    );
  }

  const secondary =
    "flex items-center gap-1.5 rounded-full border border-white/20 bg-black/30 px-4 py-2 text-sm font-semibold backdrop-blur hover:bg-white/10 disabled:opacity-50";
  const outer: CardSize = desktop ? "md" : "sm";
  const centre: CardSize = desktop ? "lg" : "md";
  const mid = (slots.length - 1) / 2;
  const edgePill = (p: number) => !desktop && p !== 0;

  return (
    <section
      data-testid="summary"
      className="flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-3 md:gap-4"
    >
      <div
        ref={captureRef}
        data-testid="summary-capture"
        className="flex w-full flex-col items-center gap-2 rounded-2xl px-2 py-3"
      >
        <h2 className="text-center font-display text-3xl leading-tight md:text-5xl">{packName}</h2>
        <p className="rounded-full border border-white/15 bg-black/40 px-3 py-0.5 text-xs font-semibold text-white/80">
          {t("newCards", { count: fresh })}
        </p>

        {multi ? (
          <ul
            aria-label={t("cards")}
            className="mt-2 flex max-h-[44dvh] w-full flex-wrap justify-center gap-x-3 gap-y-4 overflow-y-auto px-1 pt-3 pb-2 md:max-h-[52dvh] md:gap-x-4"
          >
            {slots.map((s, i) => (
              <li
                key={i}
                data-testid={s.best ? "summary-best" : "summary-card"}
                className="relative"
                style={fly(i)}
              >
                <CardView card={s.c.card} size={desktop ? "md" : "sm"} isNew={s.c.isNew} />
                {s.best && <div className="mt-1.5 text-center">{label(s)}</div>}
              </li>
            ))}
          </ul>
        ) : (
          <ul
            aria-label={t("cards")}
            className="mt-5 flex items-center justify-center pb-8 md:mt-9 md:pb-10"
          >
            {slots.map((s, i) => {
              const p = i - mid;
              const drop = desktop ? 22 : 10;
              return (
                <li
                  key={i}
                  data-testid={s.best ? "summary-best" : "summary-card"}
                  className="relative -mx-12 md:-mx-4"
                  style={{
                    zIndex: 10 - Math.abs(Math.round(p * 2)),
                    transform: s.best
                      ? `translateY(-${drop}px)`
                      : `translateY(${p * p * drop}px) rotate(${p * 7}deg)`,
                  }}
                >
                  <div className="relative" style={fly(i)}>
                    <CardView
                      card={s.c.card}
                      size={s.best ? centre : outer}
                      isNew={s.c.isNew && !edgePill(p)}
                    />
                    {/* the phone arc overlaps so much that a centred pill would hide */}
                    {s.c.isNew && edgePill(p) && (
                      <span
                        className={`absolute top-0 z-30 -translate-y-1/2 rounded-full bg-white px-2 py-0.5 font-mono text-[10px] font-bold text-black ${p < 0 ? "left-1" : "right-1"}`}
                      >
                        {tr("reveal.new")}
                      </span>
                    )}
                  </div>
                  {s.best && (
                    <div className="absolute left-1/2 top-full mt-2 -translate-x-1/2">{label(s)}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <QuantitySelect options={quantityOptions} value={quantity} onChange={onQuantity} disabled={busy} />
      {quantityOptions.length > 0 && (
        <button
          type="button"
          ref={openRef}
          disabled={busy || !quantity}
          onClick={() => onOpenAgain(quantity)}
          className="w-full max-w-xs rounded-full bg-cta px-6 py-3 font-semibold text-black shadow-[0_8px_30px_-6px_var(--color-cta)] transition hover:brightness-110 disabled:opacity-50 disabled:shadow-none"
        >
          {openLabel}
        </button>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/" className={secondary}>
          {t("change")}
        </Link>
        <Link href={collectionHref} className={secondary}>
          {t("collection")}
        </Link>
        <button type="button" onClick={copyLink} className={secondary}>
          <Link2 aria-hidden className="h-4 w-4" />
          {t("copy")}
        </button>
        <button type="button" onClick={exportImage} disabled={exporting} className={secondary}>
          <Download aria-hidden className="h-4 w-4" />
          {t("image")}
        </button>
      </div>

      {toast && (
        <p
          role="status"
          className="fixed top-16 left-1/2 z-50 max-w-[calc(100vw-2rem)] -translate-x-1/2 break-all rounded-full bg-white px-4 py-2 text-center text-sm font-semibold text-black shadow-lg"
        >
          {toast}
        </p>
      )}
    </section>
  );
}

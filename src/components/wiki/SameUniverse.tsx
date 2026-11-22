import { useTranslations } from "next-intl";
import { COLOR } from "@/components/card/rarityColor";
import { Link } from "@/i18n/navigation";
import type { Character } from "@/lib/wiki/loadCharacter";

// Every tile links to its page (locked pages show their locked state); hover lifts the tile
// and turns its border to the page's rarity colour.
export function SameUniverse({
  seriesTitle,
  accent,
  cards,
}: {
  seriesTitle: string;
  accent: string;
  cards: Character["sameUniverse"];
}) {
  const t = useTranslations();
  if (!cards.length) return null;
  return (
    <section id="same-universe" className="scroll-mt-4 space-y-4">
      <div>
        <p className="font-mono text-xs tracking-widest text-cta">{t("wiki.page.sameEyebrow")}</p>
        <h2 className="break-words font-display text-2xl">{t("wiki.page.sameTitle", { series: seriesTitle })}</h2>
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2" style={{ "--acc": accent } as React.CSSProperties}>
        {cards.map((c) => {
          const rarity = t(`rarity.${c.rarity}`);
          return (
            <li key={c.sourceId}>
              <Link
                href={`/wiki/${c.sourceId}`}
                className="flex items-center gap-3.5 rounded-[14px] border border-border bg-panel p-3.5 transition-[transform,border-color] duration-[180ms] hover:-translate-y-[3px] hover:border-[var(--acc)]"
              >
                {c.owned ? (
                  <span className="size-16 shrink-0 overflow-hidden rounded-[10px] bg-white/5">
                    {c.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                    )}
                  </span>
                ) : (
                  <span className="flex size-16 shrink-0 items-center justify-center rounded-[10px] border-2 border-dashed border-white/15 bg-white/5 font-display text-2xl font-black text-white/20">
                    ?
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate font-display text-sm font-bold">
                    {c.owned ? c.name : t("wiki.page.unknown")}
                  </span>{" "}
                  <span className="block text-[13px] font-bold" style={{ color: COLOR[c.rarity] }}>
                    {c.owned ? rarity : t("wiki.page.toFind", { rarity })}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

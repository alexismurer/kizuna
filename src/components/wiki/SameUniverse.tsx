import { useTranslations } from "next-intl";
import { COLOR } from "@/components/card/CardView";
import { Link } from "@/i18n/navigation";
import type { Character } from "@/lib/wiki/loadCharacter";

export function SameUniverse({
  seriesTitle,
  cards,
}: {
  seriesTitle: string;
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
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cards.map((c) => {
          const rarity = t(`rarity.${c.rarity}`);
          const tile = "flex items-center gap-3 rounded-xl border border-border bg-panel p-3";
          return (
            <li key={c.sourceId}>
              {c.owned ? (
                <Link href={`/wiki/${c.sourceId}`} className={`${tile} hover:border-common`}>
                  <span className="h-16 w-11 shrink-0 overflow-hidden rounded bg-border">
                    {c.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{c.name}</span>
                    <span className="text-xs" style={{ color: COLOR[c.rarity] }}>
                      {rarity}
                    </span>
                  </span>
                </Link>
              ) : (
                <div className={tile}>
                  <span className="flex h-16 w-11 shrink-0 items-center justify-center rounded border border-dashed border-common text-common">
                    ?
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-common">{t("wiki.page.unknown")}</span>
                    <span className="text-xs" style={{ color: COLOR[c.rarity] }}>
                      {t("wiki.page.toFind", { rarity })}
                    </span>
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

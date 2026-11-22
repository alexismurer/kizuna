import { useTranslations } from "next-intl";
import type { Character } from "@/lib/wiki/loadCharacter";
import { Appearances } from "./Appearances";
import { CardValue } from "./CardValue";
import { LockedBox } from "./LockedBox";
import { SameUniverse } from "./SameUniverse";
import { SidePanel } from "./SidePanel";
import { WikiHeader } from "./WikiHeader";

// The whole character page; owned and locked states differ in the main column and side panel.
export function CharacterPage({ character }: { character: Character }) {
  const t = useTranslations("wiki.page");
  const { card } = character;
  const chips = (
    [
      ["#appearances", t("chipAppearances"), !character.owned || character.appearances.length > 0],
      ["#market", t("chipMarket"), true],
      ["#same-universe", t("chipSame"), character.sameUniverse.length > 0],
    ] as const
  ).filter(([, , shown]) => shown);

  return (
    <>
      <WikiHeader character={character} />
      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_280px] lg:gap-10">
        <nav className="flex flex-wrap gap-2 lg:col-start-1 lg:row-start-1">
          {chips.map(([href, label]) => (
            <a key={href} href={href} className="rounded-full border border-border px-3 py-1.5 text-sm font-semibold hover:bg-panel">
              {label}
            </a>
          ))}
        </nav>
        <aside className="lg:sticky lg:top-4 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          <SidePanel character={character} />
        </aside>
        <div className="min-w-0 space-y-12 lg:col-start-1 lg:row-start-2">
          {character.owned ? (
            <Appearances appearances={character.appearances} />
          ) : (
            <LockedBox
              name={card.name}
              rarity={card.rarity}
              odds={character.odds}
              cheapest={
                character.cheapestListingId != null && character.stats.cheapest != null
                  ? { id: character.cheapestListingId, price: character.stats.cheapest }
                  : null
              }
              currency={character.currency}
            />
          )}
          <div id="market" className="scroll-mt-4">
            <CardValue
              cardId={card.id}
              cardName={card.name}
              rarity={card.rarity}
              stats={character.stats}
              history30={character.history30}
              history7={character.history7}
              latest={character.latest}
            />
          </div>
          <SameUniverse seriesTitle={card.seriesTitle} cards={character.sameUniverse} />
        </div>
      </div>
    </>
  );
}

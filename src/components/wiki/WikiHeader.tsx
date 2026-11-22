import { useTranslations } from "next-intl";
import { COLOR } from "@/components/card/CardView";
import { Link } from "@/i18n/navigation";
import type { Character } from "@/lib/wiki/loadCharacter";

// Full-width band: breadcrumb, tags, big name over a faded native name.
export function WikiHeader({ character }: { character: Character }) {
  const t = useTranslations();
  const { card, total, owned } = character;
  const color = COLOR[card.rarity];
  const tint = (pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

  return (
    <header
      className="relative overflow-hidden border-b border-border"
      style={{
        background: `repeating-linear-gradient(135deg, ${tint(7)} 0 14px, transparent 14px 28px), linear-gradient(to bottom, ${tint(22)}, transparent)`,
      }}
    >
      <p
        aria-hidden
        className="pointer-events-none absolute -top-4 right-0 select-none whitespace-nowrap font-display text-[7rem] font-bold leading-none opacity-[0.07] sm:text-[11rem]"
      >
        {card.nativeName || card.name}
      </p>
      <div className="relative mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
        <nav className="flex flex-wrap items-center gap-2 text-sm text-common">
          <Link href="/wiki" className="hover:text-white">
            {t("wiki.page.wiki")}
          </Link>
          <span aria-hidden>/</span>
          <Link href={`/wiki?q=${encodeURIComponent(card.seriesTitle)}`} className="hover:text-white">
            {card.seriesTitle}
          </Link>
          <span aria-hidden>/</span>
          <span className="text-white">{card.name}</span>
        </nav>
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="rounded px-2 py-1 text-black" style={{ background: color }}>
            {card.seriesTitle}
          </span>
          <span className="rounded border px-2 py-1" style={{ borderColor: color, color }}>
            {t(`rarity.${card.rarity}`)}
          </span>
          <span className="px-1 text-common">
            {owned?.count ? t("wiki.page.owned", { count: owned.count }) : t("wiki.page.notOwned")}
          </span>
        </div>
        <h1 className="break-words font-display text-4xl font-bold leading-tight sm:text-6xl">{card.name}</h1>
        <p className="text-common">
          {card.nativeName && <span className="text-lg">{card.nativeName} · </span>}
          <span className="font-mono text-sm">
            #{String(card.number).padStart(4, "0")}/{total}
          </span>
        </p>
      </div>
    </header>
  );
}

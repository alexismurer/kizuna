import { Lock } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Rarity } from "@/lib/game/types";
import { formatChance } from "@/lib/wiki/chance";
import type { PackOdds } from "@/lib/wiki/odds";

// Shown instead of the appearances while the player has never owned the card.
export function LockedBox({ name, rarity, odds }: { name: string; rarity: Rarity; odds: PackOdds[] }) {
  const t = useTranslations();
  const format = useFormatter();
  const best = odds[0];

  return (
    <section id="appearances" className="scroll-mt-4 space-y-4 rounded-xl border border-border bg-panel p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border">
          <Lock aria-hidden className="h-5 w-5 text-cta" />
        </span>
        <h2 className="font-display text-xl font-bold">{t("wiki.page.lockedTitle")}</h2>
      </div>
      <p className="text-sm text-common">
        {t.rich("wiki.page.lockedBody", { name, b: (chunks) => <b className="text-white">{chunks}</b> })}
      </p>
      {best && (
        <>
          <p className="font-mono text-xs">
            {t("wiki.page.lockedChance", {
              rarity: t(`rarity.${rarity}`),
              chance: formatChance(format, best.chance),
              pack: best.title,
            })}
          </p>
          <Link
            href={`/open/${best.packId}`}
            className="inline-block rounded-md bg-cta px-4 py-2 text-sm font-semibold text-black"
          >
            {t("wiki.page.openBooster")}
          </Link>
        </>
      )}
      <div aria-hidden className="space-y-2 pt-2">
        {["w-full", "w-11/12", "w-3/4"].map((w) => (
          <div key={w} className={`h-3 rounded bg-border ${w}`} />
        ))}
      </div>
    </section>
  );
}

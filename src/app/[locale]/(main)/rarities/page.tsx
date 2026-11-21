import { use } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { InfoPage } from "@/components/InfoPage";
import { BASE, packChances } from "@/lib/game/odds";
import { RECYCLE_VALUE } from "@/lib/game/recycle";
import { RARITIES, type Rarity } from "@/lib/game/types";

const SECTIONS = ["slots", "golden", "pity", "divine", "daily", "recycle"];

// popularity bands per rarity, in % of the catalog (mirrors RARITY_STEPS in scripts/import-anilist/derive.ts)
const BANDS: Record<Rarity, [from: number, to: number]> = {
  mythic: [0, 3],
  legendary: [3, 10],
  epic: [10, 25],
  rare: [25, 50],
  uncommon: [50, 75],
  common: [75, 100],
};

// the standard 5-card booster (Mix and the other free packs)
const STANDARD: Rarity[] = ["common", "common", "common", "uncommon", "rare"];

async function RarityTable() {
  const t = await getTranslations("pages.rarities");
  const tr = await getTranslations("rarity");
  const format = await getFormatter();
  const perBooster = packChances(STANDARD);
  const total = BASE.reduce((a, b) => a + b, 0);
  const pct = (p: number) =>
    format.number(p, { style: "percent", maximumSignificantDigits: p < 0.01 ? 2 : 3 });
  const rows = [...RARITIES].reverse();

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-2xl border border-border bg-panel">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-wider text-white/45">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">{t("table.rarity")}</th>
              <th scope="col" className="px-4 py-3 font-semibold">{t("table.share")}</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">{t("table.card")}</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">{t("table.booster")}</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">{t("table.recycle")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => {
              const [from, to] = BANDS[r];
              const share =
                from === 0
                  ? t("shareTop", { to })
                  : to === 100
                    ? t("shareRest", { pct: 100 - from })
                    : t("shareRange", { from, to });
              return (
                <tr key={r}>
                  <th scope="row" className="px-4 py-3 font-semibold">
                    <span className="flex items-center gap-2.5">
                      <span
                        aria-hidden
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{
                          background:
                            r === "mythic"
                              ? "linear-gradient(135deg, var(--mythic-a), var(--mythic-b), var(--mythic-c))"
                              : `var(--color-${r})`,
                        }}
                      />
                      {tr(r)}
                    </span>
                  </th>
                  <td className="px-4 py-3 text-white/70">{share}</td>
                  <td className="px-4 py-3 text-right font-mono">{pct(BASE[RARITIES.indexOf(r)] / total)}</td>
                  <td className="px-4 py-3 text-right font-mono">{pct(perBooster[r])}</td>
                  <td className="px-4 py-3 text-right font-mono">+{format.number(RECYCLE_VALUE[r])}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs leading-relaxed text-white/45">{t("tableNote")}</p>
    </div>
  );
}

export default function RaritiesPage({ params }: PageProps<"/[locale]/rarities">) {
  const { locale } = use(params);
  setRequestLocale(locale);
  return (
    <InfoPage page="rarities" sections={SECTIONS}>
      <RarityTable />
    </InfoPage>
  );
}

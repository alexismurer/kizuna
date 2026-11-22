import { useTranslations } from "next-intl";
import type { Character } from "@/lib/wiki/loadCharacter";

export function Appearances({ appearances }: { appearances: Character["appearances"] }) {
  const t = useTranslations("wiki.page");
  if (!appearances.length) return null;
  return (
    <section id="appearances" className="scroll-mt-4 space-y-3">
      <p className="font-mono text-xs tracking-widest text-cta">{t("appearancesEyebrow")}</p>
      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-panel text-left">
            <tr>
              <th className="w-24 px-4 py-3 font-semibold">{t("media")}</th>
              <th className="px-4 py-3 font-semibold">{t("mediaTitle")}</th>
            </tr>
          </thead>
          <tbody>
            {appearances.map((a, i) => (
              <tr key={i} className="border-t border-border">
                <td className="px-4 py-3 text-common">{t(a.mediaType === "ANIME" ? "anime" : "manga")}</td>
                <td className="break-words px-4 py-3">{a.title}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

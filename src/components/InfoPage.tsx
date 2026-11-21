import { getFormatter, getTranslations } from "next-intl/server";

// the date shown as "Last updated" on the rules, rarities and legal pages
export const INFO_UPDATED = new Date("2026-11-21T12:00:00Z");

// A plain reading page: eyebrow, title, intro, optional extra block, then titled sections.
export async function InfoPage({
  page,
  sections,
  children,
}: {
  page: "rules" | "rarities" | "terms" | "privacy";
  sections: string[];
  children?: React.ReactNode;
}) {
  const t = await getTranslations(`pages.${page}`);
  const tp = await getTranslations("pages");
  const format = await getFormatter();
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-3">
        <p className="font-mono text-xs font-semibold tracking-[0.2em] text-accent">{t("eyebrow")}</p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{t("title")}</h1>
        <p className="text-base leading-relaxed text-white/70">{t("intro")}</p>
        <p className="font-mono text-xs text-white/40">
          {tp("updated", { date: format.dateTime(INFO_UPDATED, { dateStyle: "long" }) })}
        </p>
      </header>
      {children}
      <div className="flex flex-col gap-3">
        {sections.map((s) => (
          <section key={s} id={s} className="scroll-mt-6 rounded-2xl border border-border bg-panel p-5 sm:p-6">
            <h2 className="font-display text-xl font-bold">{t(`${s}.title`)}</h2>
            <p className="mt-2 leading-relaxed text-white/70">{t(`${s}.body`)}</p>
          </section>
        ))}
      </div>
    </main>
  );
}

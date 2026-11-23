import { BookOpen, ChevronDown, Crown, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { TACTICS, type Ability, type Row } from "@/lib/duel/cards";
import { ABILITY_ICON, ROW_ICON, TACTIC_ICON, TACTIC_TINT } from "./DuelCardChip";

const ABILITIES: Ability[] = ["spy", "medic", "morale", "muster", "scorch", "horn"];
const STEPS = ["1", "2", "3", "4", "5", "6"] as const;

function Tile({ icon, color, name, text }: { icon: React.ReactNode; color: string; name: string; text: string }) {
  return (
    <li className="flex gap-3 rounded-2xl border border-white/10 bg-black/20 p-3">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
        style={{ borderColor: `color-mix(in srgb, ${color} 50%, transparent)`, color, background: `color-mix(in srgb, ${color} 10%, transparent)` }}
      >
        {icon}
      </span>
      <span className="min-w-0 text-sm">
        <b className="block">{name}</b>
        <span className="text-common">{text}</span>
      </span>
    </li>
  );
}

export function HowToPlay() {
  const t = useTranslations("duel");
  return (
    <details className="group overflow-hidden rounded-3xl border border-white/10 bg-panel">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-5 sm:p-6 [&::-webkit-details-marker]:hidden">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-cta/40 bg-cta/10 text-cta">
          <BookOpen className="h-5 w-5" aria-hidden />
        </span>
        <span className="flex-1 font-display text-2xl font-bold">{t("rules.title")}</span>
        <ChevronDown className="h-5 w-5 text-common transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="flex flex-col gap-8 border-t border-white/10 p-5 sm:p-6">
        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-bold uppercase tracking-[0.25em] text-cta">{t("rules.basics")}</h3>
          <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((k) => (
              <li key={k} className="flex gap-3 rounded-2xl border border-white/10 bg-black/20 p-3 text-sm">
                <span aria-hidden className="duel-hex flex h-8 w-9 shrink-0 items-center justify-center bg-accent text-sm font-extrabold text-white">
                  {k}
                </span>
                <span className="text-white/80">{t(`rules.step${k}`)}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="grid gap-3 lg:grid-cols-3">
          <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm">
            <h3 className="font-bold">{t("rules.rows")}</h3>
            <ul className="flex flex-col gap-1.5">
              {([0, 1, 2] as Row[]).map((r) => {
                const Icon = ROW_ICON[r];
                return (
                  <li key={r} className="flex items-center gap-2 text-common">
                    <Icon className="h-4 w-4 text-white" aria-hidden />
                    {t(`row.${r}`)}
                  </li>
                );
              })}
            </ul>
            <p className="text-common">{t("rules.rowsText")}</p>
          </div>
          <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm">
            <h3 className="flex items-center gap-2 font-bold">
              <Crown className="h-4 w-4 text-legendary" aria-hidden />
              {t("rules.deckTitle")}
            </h3>
            <p className="text-common">{t("rules.deck")}</p>
            <p className="text-common">{t("rules.hero")}</p>
          </div>
          <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm">
            <h3 className="flex items-center gap-2 font-bold">
              <Sparkles className="h-4 w-4 text-cta" aria-hidden />
              {t("rules.bondTitle")}
            </h3>
            <p className="text-common">{t("rules.bond")}</p>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-bold uppercase tracking-[0.25em] text-cta">{t("rules.abilities")}</h3>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ABILITIES.map((a) => {
              const Icon = ABILITY_ICON[a];
              return <Tile key={a} icon={<Icon className="h-4 w-4" aria-hidden />} color="var(--color-cta)" name={t(`ability.${a}.name`)} text={t(`ability.${a}.text`)} />;
            })}
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-bold uppercase tracking-[0.25em] text-cta">{t("rules.tactics")}</h3>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {TACTICS.map((k) => {
              const Icon = TACTIC_ICON[k];
              return <Tile key={k} icon={<Icon className="h-4 w-4" aria-hidden />} color={TACTIC_TINT[k]} name={t(`tactic.${k}.name`)} text={t(`tactic.${k}.text`)} />;
            })}
          </ul>
        </section>
      </div>
    </details>
  );
}

import { Crown } from "lucide-react";
import { useTranslations } from "next-intl";
import { TACTICS, type Ability, type Row } from "@/lib/duel/cards";
import { ABILITY_ICON, ROW_ICON, TACTIC_ICON, TACTIC_TINT } from "./DuelCardChip";

const ABILITIES: Ability[] = ["spy", "medic", "morale", "muster", "scorch", "horn"];

export function HowToPlay() {
  const t = useTranslations("duel");
  return (
    <details className="group rounded-2xl border border-border bg-panel p-4 sm:p-5">
      <summary className="cursor-pointer font-display text-xl font-bold">{t("rules.title")}</summary>
      <div className="mt-4 grid gap-6 text-sm md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h3 className="font-bold text-cta">{t("rules.basics")}</h3>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-common">
            {(["1", "2", "3", "4", "5", "6"] as const).map((k) => (
              <li key={k}>{t(`rules.step${k}`)}</li>
            ))}
          </ol>
          <h3 className="mt-2 font-bold text-cta">{t("rules.rows")}</h3>
          <ul className="flex flex-col gap-1 text-common">
            {([0, 1, 2] as Row[]).map((r) => {
              const Icon = ROW_ICON[r];
              return (
                <li key={r} className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-white" aria-hidden />
                  {t(`row.${r}`)}
                </li>
              );
            })}
          </ul>
          <p className="text-common">{t("rules.rowsText")}</p>
          <p className="flex items-start gap-2 text-common">
            <Crown className="mt-0.5 h-4 w-4 shrink-0 text-legendary" aria-hidden />
            {t("rules.hero")}
          </p>
          <p className="text-common">
            <b className="text-white">{t("rules.bondTitle")}</b> {t("rules.bond")}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="font-bold text-cta">{t("rules.abilities")}</h3>
          <ul className="flex flex-col gap-1.5">
            {ABILITIES.map((a) => {
              const Icon = ABILITY_ICON[a];
              return (
                <li key={a} className="flex items-start gap-2">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-cta" aria-hidden />
                  <span>
                    <b>{t(`ability.${a}.name`)}</b> <span className="text-common">— {t(`ability.${a}.text`)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          <h3 className="mt-2 font-bold text-cta">{t("rules.tactics")}</h3>
          <ul className="flex flex-col gap-1.5">
            {TACTICS.map((k) => {
              const Icon = TACTIC_ICON[k];
              return (
                <li key={k} className="flex items-start gap-2">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: TACTIC_TINT[k] }} aria-hidden />
                  <span>
                    <b>{t(`tactic.${k}.name`)}</b> <span className="text-common">— {t(`tactic.${k}.text`)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </details>
  );
}

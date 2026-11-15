import { useTranslations } from "next-intl";
import { sectionCount, streakTicked, type MissionsData } from "@/lib/game/missions";

export function SummaryChips({ data }: { data: MissionsData }) {
  const t = useTranslations("missions.chips");
  const chips = [
    { id: "streak", label: t("login"), done: streakTicked(data.streak), total: 7 },
    { id: "first", label: t("first"), ...sectionCount(data.first) },
    { id: "daily", label: t("daily"), ...sectionCount(data.daily) },
    { id: "weekly", label: t("weekly"), ...sectionCount(data.weekly) },
    { id: "achievements", label: t("achievements"), ...sectionCount(data.achievements) },
  ];
  return (
    <nav className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <a
          key={c.id}
          href={`#${c.id}`}
          className="rounded-full border border-border bg-panel px-4 py-1.5 text-sm hover:border-cta"
        >
          {c.label}{" "}
          <span className={`font-mono ${c.total > 0 && c.done === c.total ? "text-uncommon" : "text-cta"}`}>
            {c.done}/{c.total}
          </span>
        </a>
      ))}
    </nav>
  );
}

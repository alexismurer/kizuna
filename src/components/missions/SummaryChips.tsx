import { useTranslations } from "next-intl";
import { sectionCount, streakTicked, type MissionsData } from "@/lib/game/missions";
import { IconBadge, SECTION_LOOK, type SectionLookId } from "./look";
import { Count } from "./MissionList";

// One tile per section (icon, name, count, progress), each a link to its section.
export function SummaryChips({ data }: { data: MissionsData }) {
  const t = useTranslations("missions.chips");
  const chips: { id: SectionLookId; label: string; done: number; total: number }[] = [
    { id: "streak", label: t("login"), done: streakTicked(data.streak), total: 7 },
    { id: "first", label: t("first"), ...sectionCount(data.first) },
    { id: "daily", label: t("daily"), ...sectionCount(data.daily) },
    { id: "weekly", label: t("weekly"), ...sectionCount(data.weekly) },
    { id: "achievements", label: t("achievements"), ...sectionCount(data.achievements) },
  ];
  return (
    <nav className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
      {chips.map((c) => {
        const { icon, color } = SECTION_LOOK[c.id];
        const complete = c.total > 0 && c.done === c.total;
        const pct = c.total > 0 ? (c.done / c.total) * 100 : 0;
        return (
          <a
            key={c.id}
            href={`#${c.id}`}
            className="group flex items-center gap-3 rounded-2xl border border-border bg-panel p-3 transition-colors hover:border-white/30"
          >
            <IconBadge icon={icon} color={color} size="sm" />
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate font-semibold">{c.label}</span>{" "}
                <Count
                  done={c.done}
                  total={c.total}
                  className={`text-xs ${complete ? "text-uncommon" : "text-cta"}`}
                />
              </span>
              <span aria-hidden className="block h-1 overflow-hidden rounded-full bg-border">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${pct}%`, background: complete ? "var(--color-uncommon)" : color }}
                />
              </span>
            </span>
          </a>
        );
      })}
    </nav>
  );
}

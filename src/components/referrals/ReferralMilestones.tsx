import { useTranslations } from "next-intl";

export type Milestone = {
  invites: number;
  rarity: "legendary" | "mythic";
  cards: number;
  reached: boolean;
  won: { name: string; imageUrl: string | null }[];
};

export function ReferralMilestones({ milestones, confirmed }: { milestones: Milestone[]; confirmed: number }) {
  const t = useTranslations("referrals");
  return (
    <ul className="flex flex-col gap-3">
      {milestones.map((m) => (
        <li key={m.invites} className="flex flex-col gap-3 rounded-2xl border border-border bg-panel p-4">
          <div className="flex items-center justify-between gap-3">
            <span>
              {t.rich("milestoneReward", {
                invites: m.invites,
                count: m.cards,
                rarity: m.rarity,
                r: (chunks) => (
                  <span className={`font-semibold ${m.rarity === "mythic" ? "text-mythic" : "text-legendary"}`}>
                    {chunks}
                  </span>
                ),
              })}
            </span>
            {m.reached ? (
              <span className="shrink-0 rounded-full bg-uncommon/20 px-3 py-1 text-xs font-semibold text-uncommon">
                {t("rewarded")}
              </span>
            ) : (
              <span className="shrink-0 font-mono text-xs text-white/70">
                {Math.min(confirmed, m.invites)}/{m.invites}
              </span>
            )}
          </div>
          {m.reached ? (
            <p className="text-sm text-white/70">{m.won.map((c) => c.name).join(" · ")}</p>
          ) : (
            <div className="h-2 overflow-hidden rounded-full bg-bg" aria-hidden>
              <div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${(Math.min(confirmed, m.invites) / m.invites) * 100}%` }} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

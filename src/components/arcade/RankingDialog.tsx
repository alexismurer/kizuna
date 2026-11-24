"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog } from "@/components/market/Dialog";
import { Avatar } from "@/components/social/Avatar";
import { arcadeRanking, type Ranking } from "@/lib/actions/arcade";
import type { ArcadeGameId } from "@/lib/arcade/registry";
import { Stars } from "./Stars";

// This week's board of a game: top 100 and where I stand.
export function RankingDialog({ game, today = false, onClose }: { game: ArcadeGameId; today?: boolean; onClose: () => void }) {
  const t = useTranslations("arcade");
  const [data, setData] = useState<Ranking | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    arcadeRanking(game, today).then((r) => {
      if (!live) return;
      if (r.ok) setData(r.data);
      else setFailed(true);
    });
    return () => {
      live = false;
    };
  }, [game, today]);

  return (
    <Dialog label={t(today ? "rankingToday" : "rankingTitle")} title={t(today ? "rankingToday" : "rankingTitle")} onClose={onClose}>
      {failed && <p role="alert" className="text-sm text-accent">{t("errors.generic")}</p>}
      {!data && !failed && <p className="text-sm text-common">{t("loading")}</p>}
      {data && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-common">{t("players", { n: data.players })}</p>
          {data.me && (
            <p className="rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-sm font-semibold">
              {t("myRank", { rank: data.me.rank, score: data.me.score })}
            </p>
          )}
          {data.top.length === 0 ? (
            <p className="text-sm text-common">{t("rankingEmpty")}</p>
          ) : (
            <ol className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto">
              {data.top.map((r) => (
                <li key={r.rank} className="flex items-center gap-3 rounded-lg px-2 py-1.5 odd:bg-white/[0.03]">
                  <span className={`w-6 text-center font-mono text-sm font-bold ${r.rank <= 3 ? "text-legendary" : "text-common"}`}>{r.rank}</span>
                  <Avatar url={r.avatarUrl} username={r.username} size={28} frame={r.frameId} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{r.username}</span>
                  <Stars n={r.stars} size="sm" />
                  <span className="w-14 text-right font-mono text-sm font-bold text-legendary">{r.score}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </Dialog>
  );
}

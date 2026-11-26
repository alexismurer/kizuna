"use client";

import { motion } from "motion/react";
import { Skull, Swords } from "lucide-react";
import { useTranslations } from "next-intl";
import { COLOR } from "@/components/card/rarityColor";
import { Link } from "@/i18n/navigation";
import type { Rarity } from "@/lib/game/types";

export type HomeBossData = {
  name: string;
  imageUrl: string | null;
  rarity: string;
  hp: number;
  damage: number;
  defeated: boolean;
  mine: number;
  share: number;
  rank: number | null;
  chance: number;
  tenth: number | null;
  claimed: boolean;
};

// A strip under the status tiles: this week's boss and the race for its card.
export function HomeBoss({ boss }: { boss: HomeBossData }) {
  const t = useTranslations("home.boss");
  const canClaim = boss.defeated && !boss.claimed && boss.rank !== null;
  // once it fell, the strip only stays to send winners to their reward
  if (boss.defeated && !canClaim) return null;

  const left = Math.max(0, boss.hp - boss.damage);
  const color = COLOR[boss.rarity as Rarity] ?? "var(--color-legendary)";
  let line: string;
  if (canClaim) line = t("claim");
  else if (boss.rank !== null && boss.chance > 0) line = t("ranked", { rank: boss.rank, chance: boss.chance });
  else if (boss.rank !== null && boss.tenth !== null) line = t("gap", { n: boss.tenth - boss.mine + 1 });
  else line = t("join", { share: boss.share - boss.mine });

  return (
    <Link
      href="/play"
      data-testid="home-boss"
      className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-accent/40 bg-panel p-3 pr-4 transition-colors hover:border-accent sm:p-4"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(40%_140%_at_0%_50%,color-mix(in_srgb,var(--color-accent)_18%,transparent),transparent_70%)]" />
      <motion.span
        className="relative block aspect-[5/7] w-14 shrink-0 overflow-hidden rounded-lg border-2 sm:w-16"
        style={{ borderColor: color }}
        animate={{ boxShadow: [`0 0 10px ${color}`, `0 0 26px ${color}`, `0 0 10px ${color}`], rotate: [-2, 2, -2] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      >
        {boss.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={boss.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <Skull className="m-auto h-full w-6 text-common" aria-hidden />
        )}
      </motion.span>
      <div className="relative flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-[10px] font-bold tracking-[0.25em] text-accent sm:text-xs">{t("eyebrow")}</p>
        <p className="line-clamp-2 font-display text-base leading-tight font-extrabold sm:text-lg">{t("title", { name: boss.name })}</p>
        {!boss.defeated && (
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-accent to-cta"
              initial={{ width: "100%" }}
              animate={{ width: `${(left / boss.hp) * 100}%` }}
              transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
            />
          </div>
        )}
        <p className="line-clamp-2 text-xs text-common sm:text-sm">{line}</p>
      </div>
      <span className="relative flex shrink-0 items-center gap-1.5 rounded-full bg-cta px-3 py-1.5 text-sm font-extrabold text-black transition-transform group-hover:scale-105">
        <Swords className="h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">{canClaim ? t("claimCta") : t("cta")}</span>
      </span>
    </Link>
  );
}

"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Crown, Gift, Skull, Sparkles, Swords } from "lucide-react";
import { useTranslations } from "next-intl";
import { COLOR } from "@/components/card/rarityColor";
import {
  bossClaim,
  type Boss,
  type BossReward,
  type SecretBoss,
} from "@/lib/actions/games";
import type { Rarity } from "@/lib/game/types";

// The weekly boss: its health falls with every ticket anyone earns. When it falls, the
// top 3 damage dealers get its card, 4th-10th have a falling chance, the rest boosters.
export function BossCard({ boss }: { boss: Boss | null }) {
  const t = useTranslations("games.boss");
  const [reward, setReward] = useState<BossReward | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!boss) {
    return (
      <section className="flex items-center gap-4 rounded-2xl border border-border bg-panel p-5">
        <Skull className="h-8 w-8 text-common" aria-hidden />
        <p className="text-sm text-common">{t("none")}</p>
      </section>
    );
  }
  const left = Math.max(0, boss.hp - boss.damage);
  const color = COLOR[boss.rarity as Rarity] ?? "var(--color-legendary)";
  const claimed = boss.claimed || reward !== null;
  const canClaim = boss.defeated && !claimed && boss.rank !== null;
  // what the player got: from this claim, or from an earlier one
  const gotCard = reward ? reward.card : boss.gotCard;

  return (
    <section
      className={`relative flex flex-col gap-4 overflow-hidden rounded-2xl border bg-panel p-5 ${boss.defeated ? "border-uncommon/40" : "border-accent/40"}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_120%_at_0%_50%,color-mix(in_srgb,var(--color-accent)_14%,transparent),transparent_70%)]"
      />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative w-28 shrink-0 self-center">
          <motion.span
            className="block aspect-[5/7] overflow-hidden rounded-xl border-2"
            style={{ borderColor: color }}
            animate={
              reward?.card
                ? {
                    rotateY: [0, 360],
                    boxShadow: [
                      `0 0 24px ${color}`,
                      `0 0 60px ${color}`,
                      `0 0 24px ${color}`,
                    ],
                  }
                : { boxShadow: `0 0 24px ${color}` }
            }
            transition={{ duration: 1.2, ease: "easeInOut" }}
          >
            {boss.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={boss.imageUrl}
                alt=""
                className={`h-full w-full object-cover ${boss.defeated ? "brightness-75 grayscale" : ""}`}
              />
            ) : (
              <Skull className="m-auto h-full w-10 text-common" aria-hidden />
            )}
          </motion.span>
          {boss.defeated && <DefeatedStamp />}
        </div>
        <div className="relative flex min-w-0 flex-1 flex-col gap-2">
          <p className="text-xs font-bold tracking-[0.25em] text-accent">
            {t("eyebrow")}
          </p>
          <p className="font-display text-2xl font-extrabold">
            {boss.name}{" "}
            <span className="text-sm font-normal text-common">
              · {boss.series}
            </span>
          </p>
          {boss.defeated ? (
            <p className="rounded-lg border border-uncommon/40 bg-uncommon/10 px-3 py-2 text-sm font-semibold text-uncommon">
              {t("defeated")}
            </p>
          ) : (
            <div>
              <div className="h-3 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-accent to-cta transition-[width] duration-700"
                  style={{ width: `${(left / boss.hp) * 100}%` }}
                />
              </div>
              <p className="mt-1 text-sm">
                <b className="font-mono">{left}</b>{" "}
                <span className="text-common">{t("hp", { max: boss.hp })}</span>
              </p>
            </div>
          )}
          <p className="text-sm text-common">
            {t("rule", { share: boss.share, boosters: boss.boosters })}
          </p>
          <p className="flex flex-wrap items-center gap-1.5 text-sm">
            <Swords className="h-4 w-4 text-cta" aria-hidden />
            {t("yours", { n: boss.mine })}
            {boss.rank !== null ? (
              <span className="rounded-full bg-cta/15 px-2 py-0.5 text-xs font-bold text-cta">
                {t("rank", { rank: boss.rank, chance: boss.chance })}
              </span>
            ) : (
              <span className="text-common">
                {t("unranked", { share: boss.share })}
              </span>
            )}
          </p>
          {canClaim && (
            <motion.button
              type="button"
              disabled={pending}
              whileTap={{ scale: 0.95 }}
              animate={{ scale: [1, 1.04, 1] }}
              transition={{ duration: 1.6, repeat: Infinity }}
              onClick={() =>
                start(async () => {
                  const r = await bossClaim("weekly");
                  if (!r.ok) return setError(r.error);
                  setReward(r.data);
                })
              }
              className="w-fit rounded-full bg-cta px-5 py-2 text-sm font-extrabold text-black"
            >
              {t("claim")}
            </motion.button>
          )}
          <AnimatePresence>
            {claimed && (
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-1.5 text-sm font-semibold text-uncommon"
              >
                {gotCard ? (
                  <Sparkles className="h-4 w-4" aria-hidden />
                ) : (
                  <Gift className="h-4 w-4" aria-hidden />
                )}
                {gotCard
                  ? t("gotCard", { name: boss.name })
                  : t("gotBoosters", { boosters: boss.boosters })}
              </motion.p>
            )}
          </AnimatePresence>
          {error && <p className="text-sm text-accent">{t("claimError")}</p>}
        </div>
      </div>
      <BossTop top={boss.top} />
    </section>
  );
}

// Top 10 damage dealers, with each rank's card chance.
function BossTop({ top }: { top: Boss["top"] }) {
  const t = useTranslations("games.boss");
  if (top.length === 0) return null;
  return (
    <div className="relative">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-bold tracking-[0.2em] text-common">
        <Crown className="h-3.5 w-3.5 text-legendary" aria-hidden />
        {t("top")}
      </p>
      <ol className="grid gap-1 sm:grid-cols-2">
        {top.map((row, i) => (
          <motion.li
            key={row.rank}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm ${row.me ? "bg-cta/15 ring-1 ring-cta/50" : "bg-white/5"}`}
          >
            <b
              className={`w-6 font-mono ${row.rank <= 3 ? "text-legendary" : "text-common"}`}
            >
              #{row.rank}
            </b>
            <span className="min-w-0 flex-1 truncate">{row.name}</span>
            <span className="font-mono text-xs">{row.damage}</span>
            <span
              className={`w-10 text-right text-xs font-bold ${row.rank <= 3 ? "text-legendary" : "text-common"}`}
            >
              {row.rank <= 3 ? t("sure") : `${70 - (row.rank - 4) * 10}%`}
            </span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

// The secret boss: it appears when the weekly boss falls. If it falls before Monday it
// pays like the weekly boss: its card for the top 3, a chance for 4th-10th, boosters otherwise.
export function SecretBossCard({ boss }: { boss: SecretBoss }) {
  const t = useTranslations("games.secret");
  const tb = useTranslations("games.boss");
  const [reward, setReward] = useState<BossReward | null>(null);
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();
  const left = Math.max(0, boss.hp - boss.damage);
  const claimed = boss.claimed || reward !== null;
  const canClaim = boss.defeated && !claimed && boss.rank !== null;
  const gotCard = reward ? reward.card : boss.gotCard;

  return (
    <section className="relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-legendary/50 bg-panel p-5 shadow-[0_0_40px_-10px_rgb(245_179_1/0.45)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_120%_at_0%_50%,rgb(245_179_1/0.16),transparent_70%)]"
      />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative w-28 shrink-0 self-center">
          <motion.span
            className="card-sheen block aspect-[5/7] overflow-hidden rounded-xl border-2 border-transparent [background:linear-gradient(#1c1a23,#1c1a23)_padding-box,linear-gradient(135deg,var(--mythic-a),var(--mythic-b),var(--mythic-c))_border-box]"
            animate={
              reward?.card
                ? { rotateY: [0, 360], scale: [1, 1.08, 1] }
                : undefined
            }
            transition={{ duration: 1.2, ease: "easeInOut" }}
          >
            {boss.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={boss.imageUrl}
                alt=""
                className={`h-full w-full object-cover ${boss.defeated ? "brightness-75 grayscale" : ""}`}
              />
            ) : (
              <Sparkles
                className="m-auto h-full w-10 text-legendary"
                aria-hidden
              />
            )}
          </motion.span>
          {boss.defeated && <DefeatedStamp />}
        </div>
        <div className="relative flex min-w-0 flex-1 flex-col gap-2">
          <p className="flex items-center gap-1.5 text-xs font-bold tracking-[0.25em] text-legendary">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {t("eyebrow")}
          </p>
          <p className="text-sm font-semibold">{t("appeared")}</p>
          <p className="font-display text-2xl font-extrabold">
            {boss.name}{" "}
            <span className="text-sm font-normal text-common">
              · {boss.series}
            </span>
          </p>
          {boss.defeated ? (
            <p className="rounded-lg border border-uncommon/40 bg-uncommon/10 px-3 py-2 text-sm font-semibold text-uncommon">
              {t("defeated")}
            </p>
          ) : (
            <div>
              <div className="h-3 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-legendary to-cta transition-[width] duration-700"
                  style={{ width: `${(left / boss.hp) * 100}%` }}
                />
              </div>
              <p className="mt-1 text-sm">
                <b className="font-mono">{left}</b>{" "}
                <span className="text-common">{t("hp", { max: boss.hp })}</span>
              </p>
            </div>
          )}
          <p className="text-sm text-common">
            {t("rule", { share: boss.share, boosters: boss.boosters })}
          </p>
          <p className="flex flex-wrap items-center gap-1.5 text-sm">
            <Swords className="h-4 w-4 text-legendary" aria-hidden />
            {t("yours", { n: boss.mine })}
            {boss.rank !== null ? (
              <span className="rounded-full bg-legendary/15 px-2 py-0.5 text-xs font-bold text-legendary">
                {tb("rank", { rank: boss.rank, chance: boss.chance })}
              </span>
            ) : (
              <span className="text-common">
                {tb("unranked", { share: boss.share })}
              </span>
            )}
          </p>
          {canClaim && (
            <motion.button
              type="button"
              disabled={pending}
              whileTap={{ scale: 0.95 }}
              animate={{ scale: [1, 1.04, 1] }}
              transition={{ duration: 1.6, repeat: Infinity }}
              onClick={() =>
                start(async () => {
                  const r = await bossClaim("secret");
                  if (!r.ok) return setError(true);
                  setReward(r.data);
                })
              }
              className="w-fit rounded-full bg-legendary px-5 py-2 text-sm font-extrabold text-black"
            >
              {t("claim")}
            </motion.button>
          )}
          <AnimatePresence>
            {claimed && (
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-1.5 text-sm font-semibold text-uncommon"
              >
                {gotCard ? (
                  <Sparkles className="h-4 w-4" aria-hidden />
                ) : (
                  <Gift className="h-4 w-4" aria-hidden />
                )}
                {gotCard
                  ? tb("gotCard", { name: boss.name })
                  : tb("gotBoosters", { boosters: boss.boosters })}
              </motion.p>
            )}
          </AnimatePresence>
          {error && <p className="text-sm text-accent">{t("claimError")}</p>}
        </div>
      </div>
      <BossTop top={boss.top} />
    </section>
  );
}

// Red rubber stamp pressed across a fallen boss's card.
function DefeatedStamp() {
  const t = useTranslations("games.boss");
  return (
    <motion.span
      initial={{ scale: 2.4, opacity: 0, rotate: -24 }}
      animate={{ scale: 1, opacity: 1, rotate: -12 }}
      transition={{ duration: 0.35, ease: [0.5, 0, 0.75, 0], delay: 0.2 }}
      className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -mt-4 flex justify-center"
    >
      <span className="rounded-md border-[3px] border-red-500 bg-black/35 px-2 py-0.5 font-display text-sm leading-tight font-black tracking-[0.15em] whitespace-nowrap text-red-500 uppercase shadow-[0_0_14px_rgb(239_68_68/0.45),inset_0_0_8px_rgb(239_68_68/0.35)] [text-shadow:0_0_6px_rgb(239_68_68/0.5)]">
        {t("defeatedStamp")}
      </span>
    </motion.span>
  );
}

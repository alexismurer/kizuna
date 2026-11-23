"use client";

import { useState, useTransition } from "react";
import { Skull, Sparkles, Swords } from "lucide-react";
import { useTranslations } from "next-intl";
import { COLOR } from "@/components/card/rarityColor";
import { bossClaim, type Boss, type SecretBoss } from "@/lib/actions/games";
import type { Rarity } from "@/lib/game/types";

// The weekly boss: its health falls with every ticket anyone earns.
export function BossCard({ boss }: { boss: Boss | null }) {
  const t = useTranslations("games.boss");
  const [claimed, setClaimed] = useState(boss?.claimed ?? false);
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
  const canClaim = boss.defeated && !claimed && boss.mine >= boss.share;

  return (
    <section
      className={`relative flex flex-col gap-4 overflow-hidden rounded-2xl border bg-panel p-5 sm:flex-row sm:items-center ${boss.defeated ? "border-uncommon/40" : "border-accent/40"}`}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_120%_at_0%_50%,color-mix(in_srgb,var(--color-accent)_14%,transparent),transparent_70%)]" />
      <div className="relative w-28 shrink-0 self-center">
        <span className="block aspect-[5/7] overflow-hidden rounded-xl border-2" style={{ borderColor: color, boxShadow: `0 0 24px ${color}` }}>
          {boss.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={boss.imageUrl} alt="" className={`h-full w-full object-cover ${boss.defeated ? "grayscale" : ""}`} />
          ) : (
            <Skull className="m-auto h-full w-10 text-common" aria-hidden />
          )}
        </span>
        {boss.defeated && (
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-12 rounded border-2 border-accent bg-bg/90 px-2 py-0.5 text-xs font-extrabold tracking-widest text-accent">
            {t("defeatedStamp")}
          </span>
        )}
      </div>
      <div className="relative flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-xs font-bold tracking-[0.25em] text-accent">{t("eyebrow")}</p>
        <p className="font-display text-2xl font-extrabold">
          {boss.name} <span className="text-sm font-normal text-common">· {boss.series}</span>
        </p>
        {boss.defeated ? (
          <p className="rounded-lg border border-uncommon/40 bg-uncommon/10 px-3 py-2 text-sm font-semibold text-uncommon">{t("defeated")}</p>
        ) : (
          <div>
            <div className="h-3 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-accent to-cta transition-[width] duration-700" style={{ width: `${(left / boss.hp) * 100}%` }} />
            </div>
            <p className="mt-1 text-sm">
              <b className="font-mono">{left}</b> <span className="text-common">{t("hp", { max: boss.hp })}</span>
            </p>
          </div>
        )}
        <p className="text-sm text-common">{t("rule", { share: boss.share, reward: boss.reward })}</p>
        <p className="flex items-center gap-1.5 text-sm">
          <Swords className="h-4 w-4 text-cta" aria-hidden />
          {t("yours", { n: boss.mine, share: boss.share })}
        </p>
        {canClaim && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await bossClaim("weekly");
                if (!r.ok) return setError(r.error);
                setClaimed(true);
              })
            }
            className="w-fit rounded-full bg-cta px-5 py-2 text-sm font-extrabold text-black"
          >
            {t("claim", { reward: boss.reward })}
          </button>
        )}
        {claimed && <p className="text-sm font-semibold text-uncommon">{t("claimed", { reward: boss.reward })}</p>}
        {error && <p className="text-sm text-accent">{t("claimError")}</p>}
      </div>
    </section>
  );
}

// The secret boss: it appears when the weekly boss falls; a golden booster for everyone
// who earned 30+ tickets since, if it falls before Monday.
export function SecretBossCard({ boss }: { boss: SecretBoss }) {
  const t = useTranslations("games.secret");
  const [claimed, setClaimed] = useState(boss.claimed);
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();
  const left = Math.max(0, boss.hp - boss.damage);
  const canClaim = boss.defeated && !claimed && boss.mine >= boss.share;

  return (
    <section className="relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-legendary/50 bg-panel p-5 shadow-[0_0_40px_-10px_rgb(245_179_1/0.45)] sm:flex-row sm:items-center">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_120%_at_0%_50%,rgb(245_179_1/0.16),transparent_70%)]" />
      <div className="relative w-28 shrink-0 self-center">
        <span className="card-sheen block aspect-[5/7] overflow-hidden rounded-xl border-2 border-transparent [background:linear-gradient(#1c1a23,#1c1a23)_padding-box,linear-gradient(135deg,var(--mythic-a),var(--mythic-b),var(--mythic-c))_border-box]">
          {boss.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={boss.imageUrl} alt="" className={`h-full w-full object-cover ${boss.defeated ? "grayscale" : ""}`} />
          ) : (
            <Sparkles className="m-auto h-full w-10 text-legendary" aria-hidden />
          )}
        </span>
      </div>
      <div className="relative flex min-w-0 flex-1 flex-col gap-2">
        <p className="flex items-center gap-1.5 text-xs font-bold tracking-[0.25em] text-legendary">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          {t("eyebrow")}
        </p>
        <p className="text-sm font-semibold">{t("appeared")}</p>
        <p className="font-display text-2xl font-extrabold">
          {boss.name} <span className="text-sm font-normal text-common">· {boss.series}</span>
        </p>
        {boss.defeated ? (
          <p className="rounded-lg border border-uncommon/40 bg-uncommon/10 px-3 py-2 text-sm font-semibold text-uncommon">{t("defeated")}</p>
        ) : (
          <div>
            <div className="h-3 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-legendary to-cta transition-[width] duration-700" style={{ width: `${(left / boss.hp) * 100}%` }} />
            </div>
            <p className="mt-1 text-sm">
              <b className="font-mono">{left}</b> <span className="text-common">{t("hp", { max: boss.hp })}</span>
            </p>
          </div>
        )}
        <p className="text-sm text-common">{t("rule", { share: boss.share })}</p>
        <p className="flex items-center gap-1.5 text-sm">
          <Swords className="h-4 w-4 text-legendary" aria-hidden />
          {t("yours", { n: boss.mine, share: boss.share })}
        </p>
        {canClaim && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await bossClaim("secret");
                if (!r.ok) return setError(true);
                setClaimed(true);
              })
            }
            className="w-fit rounded-full bg-legendary px-5 py-2 text-sm font-extrabold text-black"
          >
            {t("claim")}
          </button>
        )}
        {claimed && <p className="text-sm font-semibold text-uncommon">{t("claimed")}</p>}
        {error && <p className="text-sm text-accent">{t("claimError")}</p>}
      </div>
    </section>
  );
}

"use client";

import { useState } from "react";
import { Check, Link2, MessageCircle, Repeat2, SlidersHorizontal } from "lucide-react";
import { MotionConfig, motion } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { PushSettings } from "@/components/push/PushSettings";
import { completionPct } from "@/lib/social/format";
import type { Friendship, ProfileCard, ProfileData } from "@/lib/social/types";
import { Avatar } from "./Avatar";
import { PlayerTitle } from "./PlayerTitle";
import { AppearancePicker } from "./AppearancePicker";
import { AvatarPicker } from "./AvatarPicker";
import { FriendButton } from "./FriendButton";
import { ShowcasePicker } from "./ShowcasePicker";

const BTN =
  "inline-flex items-center gap-2 rounded-full border border-border bg-bg/60 px-4 py-2 text-sm font-bold transition hover:-translate-y-0.5 hover:border-accent hover:text-accent";
const BTN_MAIN =
  "inline-flex items-center gap-2 rounded-full border border-accent bg-accent px-4 py-2 text-sm font-bold text-black transition hover:-translate-y-0.5 hover:brightness-110";
const R = 34;
const C = 2 * Math.PI * R;

function Ring({ pct }: { pct: number }) {
  return (
    <svg viewBox="0 0 80 80" className="h-20 w-20 shrink-0 -rotate-90" aria-hidden>
      <circle cx="40" cy="40" r={R} fill="none" strokeWidth="7" className="stroke-border" />
      <motion.circle
        cx="40"
        cy="40"
        r={R}
        fill="none"
        strokeWidth="7"
        strokeLinecap="round"
        className="stroke-accent"
        strokeDasharray={C}
        initial={{ strokeDashoffset: C }}
        animate={{ strokeDashoffset: C * (1 - pct / 100) }}
        transition={{ duration: 1.1, ease: "easeOut", delay: 0.35 }}
      />
    </svg>
  );
}

const group = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
const rise = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};

// The top of a profile: a hero with the player's identity and the buttons that fit who is looking,
// then the stat tiles.
export function ProfileHeader({
  profile,
  owned,
  cosmetics = [],
}: {
  profile: ProfileData;
  owned: ProfileCard[];
  // ids of the titles and frames the player owns (own profile only)
  cosmetics?: string[];
}) {
  const t = useTranslations("profile");
  const tPush = useTranslations("push");
  const format = useFormatter();
  const [friendship, setFriendship] = useState<Friendship>(profile.friendship);
  const [picker, setPicker] = useState<"avatar" | "showcase" | "appearance" | null>(null);
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const pct = completionPct(profile.uniqueCards, profile.catalogSize);
  const label = "font-mono text-[10px] uppercase tracking-[0.18em] text-white/50";
  const banner = profile.showcase.filter((c) => c.imageUrl).slice(0, 3);
  const tile = "relative flex flex-col justify-center gap-1 overflow-hidden rounded-2xl border border-border bg-panel p-4";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <MotionConfig reducedMotion="user">
      <motion.div variants={group} initial="hidden" animate="show" className="flex flex-col gap-4">
        <motion.header variants={rise} className="relative rounded-3xl border border-border bg-panel">
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
            <div className="absolute inset-0 flex">
              {banner.map((c) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={c.id}
                  src={c.imageUrl ?? ""}
                  alt=""
                  className="h-full flex-1 scale-125 object-cover object-top opacity-50 blur-xl"
                />
              ))}
            </div>
            <div className="absolute inset-0 bg-[radial-gradient(70%_120%_at_100%_50%,color-mix(in_srgb,var(--color-accent)_20%,transparent),transparent_70%),linear-gradient(to_top,var(--color-panel),color-mix(in_srgb,var(--color-panel)_55%,transparent))]" />
          </div>
          <div className="relative flex flex-col gap-5 p-5 sm:p-8 md:flex-row md:items-end md:justify-between">
            <div className="flex min-w-0 items-center gap-4 sm:gap-6">
              <Avatar url={profile.avatarUrl} username={profile.username} size={104} frame={profile.frameId} />
              <div className="min-w-0">
                <p className="text-xs font-bold tracking-[0.25em] text-accent">{t("eyebrow")}</p>
                <h1 className="truncate font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
                  {profile.username}
                </h1>
                <PlayerTitle id={profile.titleId} className="text-base" />
                <p className="mt-1 text-sm text-common">
                  {t("memberSince", { date: format.dateTime(new Date(profile.memberSince), { dateStyle: "medium" }) })}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-start gap-2">
              {profile.isMe ? (
                <>
                  <div className="relative">
                    <button
                      type="button"
                      aria-expanded={menu}
                      onClick={() => setMenu((m) => !m)}
                      className={BTN_MAIN}
                    >
                      <SlidersHorizontal aria-hidden className="h-4 w-4" />
                      {t("customize")}
                    </button>
                    {menu && (
                      <div className="absolute left-0 top-full z-20 mt-2 w-48 overflow-hidden rounded-xl border border-border bg-panel p-1 shadow-xl shadow-black/50 md:left-auto md:right-0">
                        {(
                          [
                            ["avatar", "changeAvatar"],
                            ["showcase", "editShowcase"],
                            ["appearance", "appearance"],
                          ] as const
                        ).map(([id, key]) => (
                          <button
                            key={id}
                            type="button"
                            className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-border"
                            onClick={() => {
                              setMenu(false);
                              setPicker(id);
                            }}
                          >
                            {t(key)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button type="button" onClick={copyLink} className={BTN}>
                    {copied ? <Check aria-hidden className="h-4 w-4 text-uncommon" /> : <Link2 aria-hidden className="h-4 w-4" />}
                    {t("copyLink")}
                  </button>
                  {copied && (
                    <p role="status" className="basis-full text-sm text-uncommon">
                      {t("copied")}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <FriendButton username={profile.username} friendship={friendship} onChange={setFriendship} />
                  {friendship === "friends" && (
                    <Link href={`/messages/${encodeURIComponent(profile.username)}`} className={BTN}>
                      <MessageCircle aria-hidden className="h-4 w-4" />
                      {t("message")}
                    </Link>
                  )}
                  <Link href={`/market?tab=trades&to=${encodeURIComponent(profile.username)}`} className={BTN}>
                    <Repeat2 aria-hidden className="h-4 w-4" />
                    {t("trade")}
                  </Link>
                </>
              )}
            </div>
          </div>
        </motion.header>

        <motion.dl variants={rise} className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <div className={`${tile} col-span-2 flex-row items-center gap-4 md:col-span-1`}>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_90%_at_0%_50%,color-mix(in_srgb,var(--color-accent)_14%,transparent),transparent_70%)]"
            />
            <div className="relative shrink-0">
              <Ring pct={pct} />
              <span className="absolute inset-0 flex items-center justify-center font-display text-sm">{pct}%</span>
            </div>
            <div className="relative flex flex-col gap-1">
              <dd className="font-mono text-2xl font-bold leading-none">
                {format.number(profile.uniqueCards)}/{format.number(profile.catalogSize)}
              </dd>
              <dt className={label}>{t("uniqueCards")}</dt>
            </div>
          </div>
          <div className={tile}>
            <dd className="font-mono text-2xl font-bold leading-none text-mythic">{format.number(profile.mythics)}</dd>
            <dt className={label}>{t("mythics")}</dt>
          </div>
          <div className={tile}>
            <dd className="font-mono text-2xl font-bold leading-none text-cta">{format.number(profile.boostersOpened)}</dd>
            <dt className={label}>{t("boostersOpened")}</dt>
          </div>
        </motion.dl>

        {profile.isMe && (
          <motion.div variants={rise}>
            <PushSettings title={tPush("profileTitle")} className="!mx-0 rounded-2xl bg-panel p-4" />
          </motion.div>
        )}
      </motion.div>

      {picker === "appearance" && (
        <AppearancePicker
          owned={cosmetics}
          me={{ username: profile.username, avatarUrl: profile.avatarUrl, frameId: profile.frameId ?? null, titleId: profile.titleId ?? null }}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === "avatar" && <AvatarPicker owned={owned} total={profile.catalogSize} onClose={() => setPicker(null)} />}
      {picker === "showcase" && (
        <ShowcasePicker
          owned={owned}
          total={profile.catalogSize}
          initial={profile.showcase.map((c) => c.id)}
          onClose={() => setPicker(null)}
        />
      )}
    </MotionConfig>
  );
}

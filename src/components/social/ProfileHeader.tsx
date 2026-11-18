"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { completionPct } from "@/lib/social/format";
import type { Friendship, ProfileCard, ProfileData } from "@/lib/social/types";
import { Avatar } from "./Avatar";
import { AvatarPicker } from "./AvatarPicker";
import { FriendButton } from "./FriendButton";
import { ShowcasePicker } from "./ShowcasePicker";

const BTN = "rounded-full border border-border px-4 py-1.5 text-sm font-bold hover:border-accent";
const R = 34;
const C = 2 * Math.PI * R;

function Ring({ pct }: { pct: number }) {
  return (
    <svg viewBox="0 0 80 80" className="h-20 w-20 shrink-0 -rotate-90" aria-hidden>
      <circle cx="40" cy="40" r={R} fill="none" strokeWidth="7" className="stroke-border" />
      <circle
        cx="40"
        cy="40"
        r={R}
        fill="none"
        strokeWidth="7"
        strokeLinecap="round"
        className="stroke-accent"
        strokeDasharray={C}
        strokeDashoffset={C * (1 - pct / 100)}
      />
    </svg>
  );
}

// Left column of a profile: identity, stats and the buttons that fit who is looking.
export function ProfileHeader({ profile, owned }: { profile: ProfileData; owned: ProfileCard[] }) {
  const t = useTranslations("profile");
  const format = useFormatter();
  const [friendship, setFriendship] = useState<Friendship>(profile.friendship);
  const [picker, setPicker] = useState<"avatar" | "showcase" | null>(null);
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const pct = completionPct(profile.uniqueCards, profile.catalogSize);
  const label = "font-mono text-[10px] uppercase tracking-[0.18em] text-white/50";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <aside className="flex flex-col gap-5 rounded-2xl border border-border bg-panel p-5">
      <div className="flex items-center gap-4">
        <Avatar url={profile.avatarUrl} username={profile.username} size={72} />
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl leading-tight">{profile.username}</h1>
          <p className="text-sm text-common">
            {t("memberSince", { date: format.dateTime(new Date(profile.memberSince), { dateStyle: "medium" }) })}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative">
          <Ring pct={pct} />
          <span className="absolute inset-0 flex items-center justify-center font-display text-sm">{pct}%</span>
        </div>
        <dl className="flex flex-col gap-1">
          <dd className="font-display text-2xl leading-none">
            {profile.uniqueCards}/{profile.catalogSize}
          </dd>
          <dt className={label}>{t("uniqueCards")}</dt>
        </dl>
      </div>

      <dl className="grid grid-cols-2 divide-x divide-border rounded-xl border border-border py-3">
        <div className="flex flex-col gap-1 px-4">
          <dd className="font-display text-xl leading-none text-accent">{format.number(profile.mythics)}</dd>
          <dt className={label}>{t("mythics")}</dt>
        </div>
        <div className="flex flex-col gap-1 px-4">
          <dd className="font-display text-xl leading-none">{format.number(profile.boostersOpened)}</dd>
          <dt className={label}>{t("boostersOpened")}</dt>
        </div>
      </dl>

      <div className="flex flex-wrap items-start gap-2">
        {profile.isMe ? (
          <>
            <div className="relative">
              <button type="button" aria-expanded={menu} onClick={() => setMenu((m) => !m)} className={BTN}>
                {t("customize")}
              </button>
              {menu && (
                <div className="absolute left-0 top-full z-10 mt-1 w-44 overflow-hidden rounded-md border border-border bg-panel">
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-border"
                    onClick={() => {
                      setMenu(false);
                      setPicker("avatar");
                    }}
                  >
                    {t("changeAvatar")}
                  </button>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-border"
                    onClick={() => {
                      setMenu(false);
                      setPicker("showcase");
                    }}
                  >
                    {t("editShowcase")}
                  </button>
                </div>
              )}
            </div>
            <button type="button" onClick={copyLink} className={BTN}>
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
              <Link href={`/messages/${profile.username}`} className={BTN}>
                {t("message")}
              </Link>
            )}
            <Link href={`/market?tab=trades&to=${encodeURIComponent(profile.username)}`} className={BTN}>
              {t("trade")}
            </Link>
          </>
        )}
      </div>

      {picker === "avatar" && <AvatarPicker owned={owned} total={profile.catalogSize} onClose={() => setPicker(null)} />}
      {picker === "showcase" && (
        <ShowcasePicker
          owned={owned}
          total={profile.catalogSize}
          initial={profile.showcase.map((c) => c.id)}
          onClose={() => setPicker(null)}
        />
      )}
    </aside>
  );
}

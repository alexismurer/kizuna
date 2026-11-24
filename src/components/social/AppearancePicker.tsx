"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Dialog } from "@/components/market/Dialog";
import { Link, useRouter } from "@/i18n/navigation";
import { equipCosmetic } from "@/lib/actions/games";
import { FRAMES, TITLES } from "@/lib/cosmetics";
import { Avatar } from "./Avatar";
import { PlayerTitle } from "./PlayerTitle";

// Equip or take off the titles and frames bought at the prize counter.
export function AppearancePicker({
  owned,
  me,
  onClose,
}: {
  owned: string[];
  me: { username: string; avatarUrl: string | null; frameId: string | null; titleId: string | null };
  onClose: () => void;
}) {
  const t = useTranslations("profile");
  const tc = useTranslations("cosmetics");
  const tg = useTranslations("games.prizes");
  const router = useRouter();
  const [frame, setFrame] = useState(me.frameId);
  const [title, setTitle] = useState(me.titleId);
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);
  const frames = owned.filter((id) => FRAMES[id]);
  const titles = owned.filter((id) => TITLES[id]);

  const pick = (kind: "frame" | "title", id: string | null) =>
    start(async () => {
      const r = await equipCosmetic(kind, id);
      setFailed(!r.ok);
      if (!r.ok) return;
      if (kind === "frame") setFrame(id);
      else setTitle(id);
      router.refresh();
    });

  const chip = (on: boolean) =>
    `rounded-full border px-3 py-1.5 text-sm font-semibold ${on ? "border-accent bg-accent/15 text-white" : "border-border hover:border-accent/60"}`;

  return (
    <Dialog label={t("appearanceTitle")} title={t("appearanceTitle")} onClose={onClose}>
      <div className="mb-5 flex items-center gap-3">
        <Avatar url={me.avatarUrl} username={me.username} size={56} frame={frame} />
        <span className="min-w-0">
          <span className="block truncate font-display text-lg font-bold">{me.username}</span>
          <PlayerTitle id={title} />
        </span>
      </div>
      {failed && (
        <p role="alert" className="mb-3 text-sm text-accent">
          {tg("errors.generic")}
        </p>
      )}
      {owned.length === 0 ? (
        <p className="text-sm text-common">
          {t("noCosmetics")}{" "}
          <Link href="/play/prizes" className="font-bold text-accent">
            →
          </Link>
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {frames.length > 0 && (
            <fieldset disabled={pending} className="flex flex-col gap-2">
              <legend className="mb-1 text-xs font-bold uppercase tracking-widest text-common">{t("frame")}</legend>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={chip(frame === null)} onClick={() => pick("frame", null)}>
                  {t("none")}
                </button>
                {frames.map((id) => (
                  <button key={id} type="button" className={chip(frame === id)} onClick={() => pick("frame", id)}>
                    {tc(`frames.${id}`)}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {titles.length > 0 && (
            <fieldset disabled={pending} className="flex flex-col gap-2">
              <legend className="mb-1 text-xs font-bold uppercase tracking-widest text-common">{t("title")}</legend>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={chip(title === null)} onClick={() => pick("title", null)}>
                  {t("none")}
                </button>
                {titles.map((id) => (
                  <button key={id} type="button" className={chip(title === id)} onClick={() => pick("title", id)}>
                    {tc(`titles.${id}`)}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
        </div>
      )}
    </Dialog>
  );
}

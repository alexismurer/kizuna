"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Dialog } from "@/components/market/Dialog";
import { Link, useRouter } from "@/i18n/navigation";
import { equipCosmetic } from "@/lib/actions/games";
import { BANNERS, FRAMES, NAMES, TITLES } from "@/lib/cosmetics";
import { Avatar } from "./Avatar";
import { BannerBackdrop } from "./BannerBackdrop";
import { PlayerName } from "./PlayerName";
import { PlayerTitle } from "./PlayerTitle";

type Kind = "frame" | "title" | "banner" | "name";
// the cosmetics of each kind, the label of its section and where its names live
const KINDS: { kind: Kind; ids: Record<string, unknown>; label: string; names: string }[] = [
  { kind: "frame", ids: FRAMES, label: "frame", names: "frames" },
  { kind: "title", ids: TITLES, label: "title", names: "titles" },
  { kind: "banner", ids: BANNERS, label: "banner", names: "banners" },
  { kind: "name", ids: NAMES, label: "nameStyle", names: "names" },
];

// Equip or take off the titles and frames bought at the prize counter.
export function AppearancePicker({
  owned,
  me,
  onClose,
}: {
  owned: string[];
  me: { username: string; avatarUrl: string | null; frameId: string | null; titleId: string | null; bannerId: string | null; nameId: string | null };
  onClose: () => void;
}) {
  const t = useTranslations("profile");
  const tc = useTranslations("cosmetics");
  const tg = useTranslations("games.prizes");
  const router = useRouter();
  const [sel, setSel] = useState<Record<Kind, string | null>>({ frame: me.frameId, title: me.titleId, banner: me.bannerId, name: me.nameId });
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);

  const pick = (kind: Kind, id: string | null) =>
    start(async () => {
      const r = await equipCosmetic(kind, id);
      setFailed(!r.ok);
      if (!r.ok) return;
      setSel((x) => ({ ...x, [kind]: id }));
      router.refresh();
    });

  const chip = (on: boolean) =>
    `rounded-full border px-3 py-1.5 text-sm font-semibold ${on ? "border-accent bg-accent/15 text-white" : "border-border hover:border-accent/60"}`;

  return (
    <Dialog label={t("appearanceTitle")} title={t("appearanceTitle")} onClose={onClose}>
      <div className="relative mb-5 flex items-center gap-3 overflow-hidden rounded-2xl border border-border p-3">
        <BannerBackdrop id={sel.banner} />
        <Avatar url={me.avatarUrl} username={me.username} size={56} frame={sel.frame} />
        <span className="relative min-w-0">
          <span className="block truncate font-display text-lg font-bold">
            <PlayerName name={me.username} styleId={sel.name} />
          </span>
          <PlayerTitle id={sel.title} />
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
          {KINDS.map(({ kind, ids, label, names }) => {
            const mine = owned.filter((id) => id in ids);
            if (mine.length === 0) return null;
            return (
              <fieldset key={kind} disabled={pending} className="flex flex-col gap-2">
                <legend className="mb-1 text-xs font-bold uppercase tracking-widest text-common">{t(label)}</legend>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={chip(sel[kind] === null)} onClick={() => pick(kind, null)}>
                    {t("none")}
                  </button>
                  {mine.map((id) => (
                    <button key={id} type="button" className={chip(sel[kind] === id)} onClick={() => pick(kind, id)}>
                      {tc(`${names}.${id}`)}
                    </button>
                  ))}
                </div>
              </fieldset>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}

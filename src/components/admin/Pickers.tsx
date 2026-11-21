"use client";

import { useTranslations } from "next-intl";
import { RarityBadge } from "@/components/RarityBadge";
import { Avatar } from "@/components/social/Avatar";
import { adminCardSearch, adminPlayerSearch, type AdminCardHit, type AdminPlayerHit } from "@/lib/actions/admin";
import { Combobox } from "./Combobox";

export function PlayerPicker({ value, onChange }: { value: AdminPlayerHit | null; onChange: (v: AdminPlayerHit | null) => void }) {
  const t = useTranslations("admin.grant");
  return (
    <Combobox
      label={t("username")}
      search={adminPlayerSearch}
      value={value}
      onChange={onChange}
      keyOf={(p) => p.username}
      render={(p) => (
        <span className="flex items-center gap-2.5">
          <Avatar url={p.avatarUrl} username={p.username} size={28} />
          <span className="truncate font-semibold">{p.username}</span>
        </span>
      )}
    />
  );
}

export function CardPicker({ value, onChange }: { value: AdminCardHit | null; onChange: (v: AdminCardHit | null) => void }) {
  const t = useTranslations("admin.grantCard");
  return (
    <Combobox
      label={t("card")}
      search={adminCardSearch}
      value={value}
      onChange={onChange}
      keyOf={(c) => c.id}
      render={(c) => (
        <span className="flex items-center gap-2.5">
          {c.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.imageUrl} alt="" className="h-10 w-7 shrink-0 rounded object-cover object-top" />
          ) : (
            <span className="h-10 w-7 shrink-0 rounded bg-white/10" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{c.name}</span>
            <span className="block truncate text-xs text-white/50">
              #{c.number} · {c.seriesTitle}
            </span>
          </span>
          <RarityBadge rarity={c.rarity} className="h-5 w-5 text-[10px]" />
        </span>
      )}
    />
  );
}

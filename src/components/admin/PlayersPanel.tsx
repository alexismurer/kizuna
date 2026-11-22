"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { AdminPlayers } from "@/lib/actions/admin";
import { AdminSection, secondary } from "./ui";

const PAGE = 20;

export function PlayersPanel({ data }: { data: AdminPlayers }) {
  const t = useTranslations("admin.players");
  const format = useFormatter();
  const [shown, setShown] = useState(PAGE);
  const { totals, players, catalogSize } = data;
  const [now] = useState(Date.now);
  const ago = (iso: string | null) => (iso ? format.relativeTime(new Date(iso), now) : t("never"));
  const pct = (n: number) => (catalogSize > 0 ? format.number(n / catalogSize, { style: "percent", maximumFractionDigits: 1 }) : "—");

  const stats: [key: keyof AdminPlayers["totals"], value: number][] = [
    ["players", totals.players],
    ["active24h", totals.active24h],
    ["active7d", totals.active7d],
    ["new7d", totals.new7d],
    ["referred", totals.referred],
    ["boostersOpened", totals.boostersOpened],
  ];

  return (
    <AdminSection id="players" Icon={Users} color="var(--color-legendary)" title={t("title")} description={t("description")}>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {stats.map(([key, value]) => (
          <div key={key} className="rounded-xl border border-border bg-bg/60 px-3 py-2">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-white/45">{t(`totals.${key}`)}</dt>
            <dd className="mt-0.5 font-mono text-xl font-bold">{format.number(value)}</dd>
          </div>
        ))}
      </dl>
      {players.length === 0 ? (
        <p className="py-6 text-center text-sm text-white/45">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead className="bg-white/[0.02] text-[11px] uppercase tracking-wider text-white/45">
              <tr>
                {(["player", "lastSeen", "joined", "currency", "cards", "boosters", "streak", "invited"] as const).map((k) => (
                  <th key={k} scope="col" className="px-3 py-2 font-semibold">
                    {t(`cols.${k}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {players.slice(0, shown).map((p) => (
                <tr key={p.username} className="align-top">
                  <td className="px-3 py-2">
                    <span className="font-bold break-all">{p.username}</span>
                    {p.referredBy && <span className="block text-xs text-white/45">{t("via", { name: p.referredBy })}</span>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-white/80">{ago(p.lastSeenAt)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-white/60">{format.dateTime(new Date(p.joinedAt), { dateStyle: "medium" })}</td>
                  <td className="px-3 py-2 font-mono">{format.number(p.currency)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="font-mono">{format.number(p.uniqueCards)}</span>
                    <span className="text-white/45"> · {pct(p.uniqueCards)}</span>
                    <span className="block text-xs text-white/45">{t("copies", { count: p.totalCards })}</span>
                  </td>
                  <td className="px-3 py-2 font-mono">{format.number(p.boostersOpened)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="font-mono">{p.streak}</span>
                    <span className="block text-xs text-white/45">{t("logins", { count: p.logins })}</span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="font-mono">{p.invited}</span>
                    {p.invited > 0 && <span className="block text-xs text-white/45">{t("rewarded", { count: p.invitedRewarded })}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {shown < players.length && (
        <button type="button" onClick={() => setShown((n) => n + PAGE)} className={`${secondary} self-center`}>
          {t("more", { count: Math.min(PAGE, players.length - shown), left: players.length - shown })}
        </button>
      )}
    </AdminSection>
  );
}

"use client";

import { useState, useTransition } from "react";
import { Ban, Pencil, Users } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Dialog } from "@/components/market/Dialog";
import { Avatar } from "@/components/social/Avatar";
import { adminSetBan, adminSetRole, adminUpdatePlayer, type AdminPlayer, type AdminPlayers, type StaffRole } from "@/lib/actions/admin";
import { adminErrorKey } from "./errors";
import { AdminSection, danger, errorText, input, label, primary, secondary, small } from "./ui";

const PAGE = 20;
const ROLES: StaffRole[] = ["player", "moderator", "admin"];
const ROLE_STYLE: Record<StaffRole, string> = {
  player: "bg-white/[0.06] text-white/60",
  moderator: "bg-rare/15 text-rare",
  admin: "bg-accent/15 text-accent",
};

// canEdit: admins can edit every stored field, change roles and ban; moderators only read
export function PlayersPanel({ data, canEdit = false }: { data: AdminPlayers; canEdit?: boolean }) {
  const t = useTranslations("admin.players");
  const tr = useTranslations("admin.roles");
  const format = useFormatter();
  const [shown, setShown] = useState(PAGE);
  const [players, setPlayers] = useState(data.players);
  const [editing, setEditing] = useState<AdminPlayer | null>(null);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const list = q ? players.filter((p) => p.username.toLowerCase().includes(q)) : players;
  const { totals, catalogSize } = data;
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
  const cols = ["player", "role", "lastSeen", "joined", "currency", "cards", "boosters", "streak", "invited"] as const;

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
      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setShown(PAGE);
        }}
        placeholder={t("search")}
        aria-label={t("search")}
        className={`${input} sm:max-w-xs`}
      />
      {list.length === 0 ? (
        <p className="py-6 text-center text-sm text-white/45">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[60rem] text-left text-sm">
            <thead className="bg-white/[0.02] text-[11px] uppercase tracking-wider text-white/45">
              <tr>
                {cols.map((k) => (
                  <th key={k} scope="col" className="px-3 py-2 font-semibold">
                    {t(`cols.${k}`)}
                  </th>
                ))}
                {canEdit && (
                  <th scope="col" className="px-3 py-2">
                    <span className="sr-only">{t("edit")}</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.slice(0, shown).map((p) => (
                <tr key={p.id} className={`align-top ${p.bannedAt ? "bg-red-500/[0.04]" : ""}`}>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2">
                      <Avatar url={p.avatarUrl} username={p.username} size={32} />
                      <span className="min-w-0">
                        <span className="block font-bold break-all">{p.username}</span>
                        {p.referredBy && <span className="block text-xs text-white/45">{t("via", { name: p.referredBy })}</span>}
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ROLE_STYLE[p.role]}`}>{tr(p.role)}</span>
                    {p.bannedAt && (
                      <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-red-300">
                        <Ban className="h-3 w-3" aria-hidden />
                        {t("banned")}
                      </span>
                    )}
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
                  {canEdit && (
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => setEditing(p)} className={small} aria-label={t("editName", { name: p.username })}>
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {shown < list.length && (
        <button type="button" onClick={() => setShown((n) => n + PAGE)} className={`${secondary} self-center`}>
          {t("more", { count: Math.min(PAGE, list.length - shown), left: list.length - shown })}
        </button>
      )}
      {editing && (
        <EditPlayer
          player={editing}
          onClose={() => setEditing(null)}
          onSaved={(next) => {
            setPlayers((cur) => cur.map((p) => (p.id === next.id ? next : p)));
            setEditing(next);
          }}
        />
      )}
    </AdminSection>
  );
}

function EditPlayer({ player, onClose, onSaved }: { player: AdminPlayer; onClose: () => void; onSaved: (p: AdminPlayer) => void }) {
  const t = useTranslations("admin");
  const [username, setUsername] = useState(player.username);
  const [currency, setCurrency] = useState(String(player.currency));
  const [streak, setStreak] = useState(String(player.streak));
  const [role, setRole] = useState<StaffRole>(player.role);
  const [confirmBan, setConfirmBan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    start(async () => {
      const cur = Number(currency);
      const st = Number(streak);
      const r = await adminUpdatePlayer(player.id, username, cur, st);
      if (!r.ok) return setError(r.error);
      let next: AdminPlayer = { ...player, username: username.trim(), currency: cur, streak: st };
      if (role !== player.role) {
        const rr = await adminSetRole(player.id, role);
        if (!rr.ok) {
          onSaved(next);
          return setError(rr.error);
        }
        next = { ...next, role };
      }
      setError(null);
      setSaved(true);
      onSaved(next);
    });
  };

  const ban = (banned: boolean) =>
    start(async () => {
      const r = await adminSetBan(player.id, banned);
      setConfirmBan(false);
      if (!r.ok) return setError(r.error);
      setError(null);
      onSaved({ ...player, bannedAt: banned ? new Date().toISOString() : null });
    });

  return (
    <Dialog label={t("players.editName", { name: player.username })} title={t("players.editName", { name: player.username })} onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-3">
        <label className={label}>
          {t("players.cols.player")}
          <input className={input} value={username} minLength={3} maxLength={20} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={label}>
            {t("players.cols.currency")}
            <input className={input} type="number" min={0} value={currency} onChange={(e) => setCurrency(e.target.value)} />
          </label>
          <label className={label}>
            {t("players.cols.streak")}
            <input className={input} type="number" min={0} value={streak} onChange={(e) => setStreak(e.target.value)} />
          </label>
        </div>
        <label className={label}>
          {t("players.cols.role")}
          <select className={input} value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`roles.${r}`)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={pending} className={primary}>
          {t("players.save")}
        </button>
        {saved && !error && <p className="text-sm text-uncommon">{t("players.saved")}</p>}
      </form>

      <div className="mt-5 flex flex-col gap-2 border-t border-border pt-4">
        <p className="text-sm font-bold">{player.bannedAt ? t("players.bannedTitle") : t("players.banTitle")}</p>
        <p className="text-xs text-white/50">{player.bannedAt ? t("players.unbanHint") : t("players.banHint")}</p>
        {player.bannedAt ? (
          <button type="button" disabled={pending} onClick={() => ban(false)} className={`${secondary} self-start`}>
            {t("players.unban")}
          </button>
        ) : confirmBan ? (
          <span className="flex gap-2">
            <button type="button" disabled={pending} onClick={() => ban(true)} className={danger}>
              {t("players.confirmBan", { name: player.username })}
            </button>
            <button type="button" onClick={() => setConfirmBan(false)} className={small}>
              {t("players.cancel")}
            </button>
          </span>
        ) : (
          <button type="button" disabled={pending} onClick={() => setConfirmBan(true)} className={`${danger} self-start`}>
            <Ban className="mr-1 h-3.5 w-3.5" aria-hidden />
            {t("players.ban")}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className={`${errorText} mt-3`}>
          {t(`errors.${adminErrorKey(error)}`)}
        </p>
      )}
    </Dialog>
  );
}

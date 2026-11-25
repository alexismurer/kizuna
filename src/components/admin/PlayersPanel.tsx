"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { Ban, ChevronRight, Coins, Gift, Layers, Package, Ticket, Users, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Avatar } from "@/components/social/Avatar";
import { adminSetBan, adminSetRole, adminUpdatePlayer, type AdminPlayer, type AdminPlayers, type StaffRole } from "@/lib/actions/admin";
import { adminErrorKey } from "./errors";
import { AdminSection, danger, errorText, input, label, primary, secondary, small } from "./ui";

const PAGE = 25;
const ROLES: StaffRole[] = ["player", "moderator", "admin"];
const ROLE_STYLE: Record<StaffRole, string> = {
  player: "bg-white/[0.06] text-white/60",
  moderator: "bg-rare/15 text-rare",
  admin: "bg-accent/15 text-accent",
};
// name | currency | cards | opened | bonus | tickets | last seen (from md up; below it the stats wrap as chips)
const ROW = "md:grid md:grid-cols-[minmax(0,1.7fr)_repeat(5,minmax(0,1fr))_minmax(0,1.1fr)] md:items-center md:gap-3";
const eyebrow = "font-mono text-[11px] font-bold uppercase tracking-wider text-accent";

// canEdit: admins can edit every stored field, change roles and ban; moderators only read
export function PlayersPanel({ data, canEdit = false }: { data: AdminPlayers; canEdit?: boolean }) {
  const t = useTranslations("admin.players");
  const tr = useTranslations("admin.roles");
  const format = useFormatter();
  const [shown, setShown] = useState(PAGE);
  const [players, setPlayers] = useState(data.players);
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<StaffRole | "all">("all");
  const q = query.trim().toLowerCase();
  const list = players.filter((p) => (roleFilter === "all" || p.role === roleFilter) && (!q || p.username.toLowerCase().includes(q)));
  const { totals, catalogSize } = data;
  const [now] = useState(Date.now);
  const ago = (iso: string | null) => (iso ? format.relativeTime(new Date(iso), now) : t("never"));
  const pct = (n: number) => (catalogSize > 0 ? format.number(n / catalogSize, { style: "percent", maximumFractionDigits: 1 }) : "—");
  const num = (n: number | undefined) => (n === undefined ? "—" : format.number(n));
  const open = players.find((p) => p.id === openId) ?? null;

  const stats: [key: keyof AdminPlayers["totals"], value: number][] = [
    ["players", totals.players],
    ["active24h", totals.active24h],
    ["active7d", totals.active7d],
    ["new7d", totals.new7d],
    ["referred", totals.referred],
    ["boostersOpened", totals.boostersOpened],
  ];

  const heads: [string, string][] = [
    ["player", ""],
    ["currency", ""],
    ["cards", ""],
    ["boosters", ""],
    ["bonus", ""],
    ["tickets", ""],
    ["lastSeen", ""],
  ];

  return (
    <AdminSection id="players" Icon={Users} color="var(--color-legendary)" title={t("title")} description={t("description")}>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {stats.map(([key, value]) => (
          <div key={key} className="min-w-0 rounded-xl border border-border bg-bg/60 px-3 py-2">
            <dt className="text-[10px] font-semibold uppercase leading-tight tracking-wider text-white/45 sm:text-[11px]">{t(`totals.${key}`)}</dt>
            <dd className="mt-0.5 font-mono text-lg font-bold sm:text-xl">{format.number(value)}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-2 sm:flex-row">
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
        <select
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value as StaffRole | "all");
            setShown(PAGE);
          }}
          aria-label={t("allRoles")}
          className={`${input} sm:w-44`}
        >
          <option value="all">{t("allRoles")}</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {tr(r)}
            </option>
          ))}
        </select>
      </div>
      {list.length === 0 ? (
        <p className="py-6 text-center text-sm text-white/45">{t("empty")}</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <div className={`${ROW} hidden border-b border-border bg-white/[0.02] px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-white/45 md:grid`}>
            {heads.map(([k]) => (
              <span key={k} className={k === "player" ? "" : "text-right"}>
                {t(`cols.${k}`)}
              </span>
            ))}
          </div>
          <ul className="divide-y divide-border">
            {list.slice(0, shown).map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  data-player-row
                  onClick={() => setOpenId(p.id)}
                  aria-label={t("openName", { name: p.username })}
                  className={`group flex w-full flex-col gap-2 px-3 py-2.5 text-left transition hover:bg-white/[0.04] focus-visible:bg-white/[0.04] focus-visible:outline-none ${ROW} ${p.bannedAt ? "bg-red-500/[0.05]" : ""}`}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Avatar url={p.avatarUrl} username={p.username} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{p.username}</span>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                        <span className={`rounded-full px-1.5 py-px font-semibold ${ROLE_STYLE[p.role]}`}>{tr(p.role)}</span>
                        {p.bannedAt && (
                          <span className="flex items-center gap-1 font-semibold text-red-300">
                            <Ban className="h-3 w-3" aria-hidden />
                            {t("banned")}
                          </span>
                        )}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-white/30 transition group-hover:text-white/70 md:hidden" aria-hidden />
                  </span>
                  <span className="flex flex-wrap gap-1.5 md:contents">
                    <Cell Icon={Coins} title={t("cols.currency")} color="var(--color-legendary)">
                      {format.number(p.currency)}
                    </Cell>
                    <Cell Icon={Layers} title={t("cols.cards")} color="var(--color-rare)">
                      {format.number(p.uniqueCards)}
                      <span className="text-white/40"> {pct(p.uniqueCards)}</span>
                    </Cell>
                    <Cell Icon={Package} title={t("cols.boosters")} color="var(--color-uncommon)">
                      {format.number(p.boostersOpened)}
                    </Cell>
                    <Cell Icon={Gift} title={t("cols.bonus")} color="var(--color-epic)">
                      {num(p.bonusBoosters)}
                    </Cell>
                    <Cell Icon={Ticket} title={t("cols.tickets")} color="var(--color-accent)">
                      {num(p.tickets)}
                    </Cell>
                    <span className="ml-auto self-center text-xs whitespace-nowrap text-white/50 md:ml-0 md:text-right md:text-sm md:text-white/70">{ago(p.lastSeenAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {shown < list.length && (
        <button type="button" onClick={() => setShown((n) => n + PAGE)} className={`${secondary} self-center`}>
          {t("more", { count: Math.min(PAGE, list.length - shown), left: list.length - shown })}
        </button>
      )}
      {open && (
        <PlayerDrawer
          key={open.id}
          player={open}
          canEdit={canEdit}
          catalogSize={catalogSize}
          onClose={() => setOpenId(null)}
          onSaved={(next) => setPlayers((cur) => cur.map((p) => (p.id === next.id ? next : p)))}
        />
      )}
    </AdminSection>
  );
}

// a stat in the list: a chip with an icon on small screens, a right-aligned number column from md up
function Cell({ Icon, title, color, children }: { Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; title: string; color: string; children: React.ReactNode }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1.5 rounded-md bg-white/[0.04] px-2 py-1 font-mono text-xs md:justify-end md:bg-transparent md:p-0 md:text-sm"
    >
      <Icon className="h-3.5 w-3.5 shrink-0 md:hidden" style={{ color }} />
      <span className="sr-only">{title}</span>
      <span>{children}</span>
    </span>
  );
}

function Tile({ label: name, value, sub, color }: { label: string; value: React.ReactNode; sub?: React.ReactNode; color?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-bg/60 px-3 py-2">
      <dt className="truncate text-[10px] font-semibold uppercase tracking-wider text-white/45">{name}</dt>
      <dd className="mt-0.5 truncate font-mono text-lg font-bold" style={color ? { color } : undefined}>
        {value}
      </dd>
      {sub && <dd className="truncate text-[11px] text-white/45">{sub}</dd>}
    </div>
  );
}

// side panel on desktop, bottom sheet on mobile; admins get an Edit tab, moderators just read
function PlayerDrawer({
  player,
  canEdit,
  catalogSize,
  onClose,
  onSaved,
}: {
  player: AdminPlayer;
  canEdit: boolean;
  catalogSize: number;
  onClose: () => void;
  onSaved: (p: AdminPlayer) => void;
}) {
  const t = useTranslations("admin.players");
  const tr = useTranslations("admin.roles");
  const format = useFormatter();
  const [tab, setTab] = useState<"overview" | "edit">("overview");
  const [wide] = useState(() => window.matchMedia?.("(min-width: 768px)").matches ?? false);
  const [now] = useState(Date.now);
  const panel = useRef<HTMLDivElement>(null);
  const latest = useRef(onClose);
  useEffect(() => {
    latest.current = onClose;
  });
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") latest.current();
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, []);

  const n = (v: number | undefined) => (v === undefined ? "—" : format.number(v));
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium" });
  const pct = catalogSize > 0 ? format.number(player.uniqueCards / catalogSize, { style: "percent", maximumFractionDigits: 1 }) : "—";
  const hasMore = player.tickets !== undefined;

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      <motion.div
        className="absolute inset-0 bg-black/60"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={onClose}
        aria-hidden
      />
      <motion.div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={player.username}
        tabIndex={-1}
        initial={wide ? { x: 48, opacity: 0 } : { y: 64, opacity: 0 }}
        animate={{ x: 0, y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 36 }}
        className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-3xl border border-border bg-panel shadow-2xl outline-none md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:w-[28rem] md:rounded-none md:rounded-l-3xl md:border-r-0"
      >
        <div className="flex items-center gap-3 border-b border-border px-4 pt-4 pb-3 sm:px-5">
          <Avatar url={player.avatarUrl} username={player.username} size={48} />
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-display text-xl font-extrabold leading-tight">{player.username}</h3>
            <p className="flex flex-wrap items-center gap-x-2 text-xs">
              <span className={`rounded-full px-1.5 py-px font-semibold ${ROLE_STYLE[player.role]}`}>{tr(player.role)}</span>
              {player.bannedAt && (
                <span className="flex items-center gap-1 font-semibold text-red-300">
                  <Ban className="h-3 w-3" aria-hidden />
                  {t("banned")}
                </span>
              )}
              {player.referredBy && <span className="text-white/45">{t("via", { name: player.referredBy })}</span>}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label={t("close")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-white/70 hover:bg-white/[0.06]">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        {canEdit && (
          <div role="tablist" className="mx-4 mt-3 grid grid-cols-2 rounded-full border border-border bg-bg/60 p-1 sm:mx-5">
            {(["overview", "edit"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`h-8 rounded-full text-sm font-semibold transition ${tab === k ? "bg-white/10 text-white" : "text-white/55 hover:text-white"}`}
              >
                {t(k === "edit" ? "editSection" : "overview")}
              </button>
            ))}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5">
          {tab === "overview" ? (
            <div className="flex flex-col gap-4">
              <section className="flex flex-col gap-2">
                <p className={eyebrow}>{t("activity")}</p>
                <dl className="grid grid-cols-2 gap-2">
                  <Tile label={t("cols.currency")} value={format.number(player.currency)} color="var(--color-legendary)" />
                  <Tile label={t("cols.streak")} value={player.streak} sub={t("logins", { count: player.logins })} />
                  <Tile label={t("cols.joined")} value={<span className="text-base">{date(player.joinedAt)}</span>} />
                  <Tile
                    label={t("cols.lastSeen")}
                    value={<span className="text-base">{player.lastSeenAt ? date(player.lastSeenAt) : t("never")}</span>}
                    sub={player.lastSeenAt ? format.relativeTime(new Date(player.lastSeenAt), now) : undefined}
                  />
                </dl>
              </section>
              <section className="flex flex-col gap-2">
                <p className={eyebrow}>{t("collection")}</p>
                <dl className="grid grid-cols-2 gap-2">
                  <Tile label={t("cols.cards")} value={format.number(player.uniqueCards)} sub={`${pct} · ${t("copies", { count: player.totalCards })}`} color="var(--color-rare)" />
                  <Tile label={t("cols.boosters")} value={format.number(player.boostersOpened)} color="var(--color-uncommon)" />
                  <Tile label={t("cols.bonus")} value={n(player.bonusBoosters)} color="var(--color-epic)" />
                  <Tile
                    label={t("golden")}
                    value={player.goldenNext === undefined ? "—" : player.goldenNext ? t("yes") : t("no")}
                    sub={player.goldenLeft ? t("goldenLeft", { count: player.goldenLeft }) : undefined}
                  />
                </dl>
              </section>
              <section className="flex flex-col gap-2">
                <p className={eyebrow}>{t("arcade")}</p>
                <dl className="grid grid-cols-2 gap-2">
                  <Tile label={t("cols.tickets")} value={n(player.tickets)} color="var(--color-accent)" />
                  <Tile label={t("ticketsEarned")} value={n(player.ticketsEarned)} />
                  <Tile label={t("ticketsToday")} value={n(player.ticketsToday)} />
                  <Tile label={t("ticketsWeek")} value={n(player.ticketsWeek)} />
                  {hasMore && (
                    <>
                      <Tile label={t("titleLabel")} value={<span className="text-sm">{player.titleId ?? t("none")}</span>} />
                      <Tile label={t("frame")} value={<span className="text-sm">{player.frameId ?? t("none")}</span>} />
                    </>
                  )}
                </dl>
              </section>
              <section className="flex flex-col gap-2">
                <p className={eyebrow}>{t("cols.invited")}</p>
                <dl className="grid grid-cols-2 gap-2">
                  <Tile label={t("cols.invited")} value={player.invited} sub={player.invited > 0 ? t("rewarded", { count: player.invitedRewarded }) : undefined} />
                </dl>
              </section>
            </div>
          ) : (
            <EditPlayer player={player} onSaved={onSaved} />
          )}
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}

function EditPlayer({ player, onSaved }: { player: AdminPlayer; onSaved: (p: AdminPlayer) => void }) {
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
    <div>
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
          <span className="flex flex-wrap gap-2">
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
    </div>
  );
}

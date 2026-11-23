"use client";

import { useState, useTransition } from "react";
import { Coins, Package, Ticket } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dialog } from "@/components/market/Dialog";
import { useRouter } from "@/i18n/navigation";
import { redeemPrize, type GameRoomStatus } from "@/lib/actions/games";

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold">{label}</span>
        <span className="font-mono text-common">
          {value} / {max}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
      </div>
    </div>
  );
}

// Your tickets, today's and this week's earnings against the caps, and the prize counter.
export function TicketsBar({ status }: { status: GameRoomStatus }) {
  const t = useTranslations("games.tickets");
  const tc = useTranslations("topbar");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tickets, setTickets] = useState(status.tickets);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const redeem = (id: string) =>
    start(async () => {
      const r = await redeemPrize(id);
      if (!r.ok) return setMsg({ ok: false, text: t.has(`errors.${r.error}`) ? t(`errors.${r.error}`) : t("errors.generic") });
      setTickets(r.data);
      setMsg({ ok: true, text: t("redeemed") });
      router.refresh();
    });

  return (
    <section className="relative overflow-hidden rounded-2xl border border-accent/30 bg-panel p-4 sm:p-5">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_120%_at_0%_0%,color-mix(in_srgb,var(--color-accent)_16%,transparent),transparent_70%)]" />
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-accent/40 bg-accent/10 text-accent">
            <Ticket className="h-6 w-6" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-semibold text-common">{t("label")}</p>
            <p className="font-display text-3xl font-extrabold">{tickets}</p>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex gap-4">
            <Bar label={t("today")} value={status.today} max={status.dayCap} />
            <Bar label={t("week")} value={status.week} max={status.weekCap} />
          </div>
          <p className="text-xs text-common">{t("text")}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setMsg(null);
            setOpen(true);
          }}
          className="h-11 rounded-full bg-accent px-6 text-sm font-extrabold text-white shadow-[0_0_24px_rgb(255_61_127/0.35)]"
        >
          {t("counter")}
        </button>
      </div>

      {open && (
        <Dialog label={t("counter")} title={t("counter")} onClose={() => setOpen(false)}>
          <p className="mb-4 flex items-center gap-2 text-sm text-common">
            <Ticket className="h-4 w-4 text-accent" aria-hidden />
            {t("balance", { n: tickets })}
          </p>
          <ul className="flex flex-col gap-2">
            {status.prizes.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-xl border border-border bg-bg/60 p-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/5">
                  {p.coins ? <Coins className="h-5 w-5 text-legendary" aria-hidden /> : <Package className="h-5 w-5 text-cta" aria-hidden />}
                </span>
                <span className="min-w-0 flex-1 text-sm font-semibold">
                  {p.coins ? `${p.coins} ${tc("currency")}` : t("prizeBoosters", { n: p.boosters ?? 1 })}
                </span>
                <button
                  type="button"
                  disabled={pending || tickets < p.cost}
                  onClick={() => redeem(p.id)}
                  className="flex items-center gap-1.5 rounded-full bg-cta px-4 py-2 text-sm font-extrabold text-black disabled:opacity-40"
                >
                  <Ticket className="h-4 w-4" aria-hidden />
                  {p.cost}
                </button>
              </li>
            ))}
          </ul>
          {msg && (
            <p role={msg.ok ? "status" : "alert"} className={`mt-3 text-sm ${msg.ok ? "text-uncommon" : "text-accent"}`}>
              {msg.text}
            </p>
          )}
        </Dialog>
      )}
    </section>
  );
}

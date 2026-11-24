import { Ticket } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { GameRoomStatus } from "@/lib/actions/games";

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

// Your tickets, today's and this week's earnings against the caps, and the way to the prize counter.
export function TicketsBar({ status }: { status: GameRoomStatus }) {
  const t = useTranslations("games.tickets");
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
            <p className="font-display text-3xl font-extrabold">{status.tickets}</p>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex gap-4">
            <Bar label={t("today")} value={status.today} max={status.dayCap} />
            <Bar label={t("week")} value={status.week} max={status.weekCap} />
          </div>
          <p className="text-xs text-common">{t("text")}</p>
        </div>
        <Link
          href="/play/prizes"
          className="flex h-11 items-center justify-center rounded-full bg-accent px-6 text-sm font-extrabold text-white shadow-[0_0_24px_rgb(255_61_127/0.35)]"
        >
          {t("counter")}
        </Link>
      </div>
    </section>
  );
}

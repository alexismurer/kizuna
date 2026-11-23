import { Lock, Swords, User, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { GameRoomStatus } from "@/lib/actions/games";
import { GAMES } from "@/lib/games/registry";
import { BossCard, SecretBossCard } from "./BossCard";
import { TicketsBar } from "./TicketsBar";

// The Play landing: tickets, the games (Duel first), the boss of the week.
export function GameRoom({ art, status }: { art: string[]; status: GameRoomStatus | null }) {
  const t = useTranslations("games");
  const duel = GAMES[0];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-xs font-bold tracking-[0.25em] text-accent">{t("eyebrow")}</p>
        <h1 className="font-display text-3xl font-extrabold sm:text-5xl">{t("title")}</h1>
        <p className="mt-2 max-w-xl text-sm text-common">{t("subtitle")}</p>
      </header>

      {status && <TicketsBar status={status} />}

      {/* featured: Duel */}
      <Link
        href={duel.href}
        className="group relative grid overflow-hidden rounded-3xl border border-border bg-panel transition-colors hover:border-accent/60 md:grid-cols-[1fr_minmax(0,22rem)]"
      >
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_100%_at_100%_50%,color-mix(in_srgb,var(--color-accent)_18%,transparent),transparent_70%)]" />
        <Swords aria-hidden className="pointer-events-none absolute -bottom-10 -left-8 h-56 w-56 rotate-12 text-accent/[0.06]" />
        <div className="relative flex flex-col gap-4 p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-accent/40 bg-accent/10 text-accent">
              <Swords className="h-5 w-5" aria-hidden />
            </span>
            <Modes solo={duel.solo} multi={duel.multi} />
            <span className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-common">{t("duel.tag")}</span>
          </div>
          <h2 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{t("duel.name")}</h2>
          <p className="max-w-md text-sm text-common sm:text-base">{t("duel.pitch")}</p>
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-accent px-6 py-3 font-display font-extrabold text-white shadow-[0_0_30px_color-mix(in_srgb,var(--color-accent)_45%,transparent)] transition group-hover:brightness-110">
            {t("play")}
          </span>
        </div>
        {/* a fan of famous faces */}
        <div aria-hidden className="relative hidden h-full min-h-56 items-center justify-center md:flex">
          {art.map((src, i) => (
            <span
              key={src}
              className="absolute aspect-[5/7] w-32 overflow-hidden rounded-xl border-2 border-legendary/70 shadow-2xl transition-transform duration-500 ease-out"
              style={{
                transform: `translateX(${(i - 1) * 46}px) rotate(${(i - 1) * 9}deg) translateY(${Math.abs(i - 1) * 10}px)`,
                zIndex: i === 1 ? 2 : 1,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" />
            </span>
          ))}
        </div>
      </Link>

      {/* more games */}
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-2xl font-bold">{t("more")}</h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex min-h-40 flex-col gap-3 rounded-2xl border border-dashed border-border bg-panel/50 p-5">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-border text-common">
                <Lock className="h-5 w-5" aria-hidden />
              </span>
              <p className="font-display text-lg font-bold text-common">{t("soon.title")}</p>
              <p className="text-sm text-common/70">{t("soon.text")}</p>
            </li>
          ))}
        </ul>
      </section>

      <BossCard boss={status?.boss ?? null} />
      {status?.secret && <SecretBossCard boss={status.secret} />}
    </div>
  );
}

function Modes({ solo, multi }: { solo: boolean; multi: boolean }) {
  const t = useTranslations("games");
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-accent/40 px-2.5 py-1 text-xs font-semibold text-accent">
      {solo && (
        <>
          <User className="h-3.5 w-3.5" aria-hidden />
          {t("solo")}
        </>
      )}
      {solo && multi && <span className="text-accent/50">/</span>}
      {multi && (
        <>
          <Users className="h-3.5 w-3.5" aria-hidden />
          {t("multi")}
        </>
      )}
    </span>
  );
}

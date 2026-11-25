import { ArrowRight, CalendarDays, Compass, Grid2x2, Heart, Layers, Link2, Merge, ScanFace, Shuffle, Spade, Swords, Tv, User, Users, type LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { GameRoomStatus } from "@/lib/actions/games";
import { GAMES, type GameEntry } from "@/lib/games/registry";
import { BossCard, SecretBossCard } from "./BossCard";
import { TicketsBar } from "./TicketsBar";

// The Play landing: tickets, the games (Duel first), the boss of the week.
export function GameRoom({ art, status }: { art: string[]; status: GameRoomStatus | null }) {
  const t = useTranslations("games");
  const duel = GAMES[0];
  const more = GAMES.filter((g) => g.msg);
  const daily = more.filter((g) => DAILY.has(g.id));
  const rank = (id: string) => (ORDER.includes(id) ? ORDER.indexOf(id) : ORDER.length);
  const rest = more.filter((g) => !DAILY.has(g.id)).sort((a, b) => rank(a.id) - rank(b.id));
  // the faces after the Duel's three go to the wide tiles (the first four games in order)
  const tileArt = art.length > 3 ? art.slice(3) : art;
  const hero = (
      <Link
        href={duel.href}
        className="group relative grid h-full overflow-hidden rounded-3xl border border-border bg-panel transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-[0_18px_50px_-18px_var(--color-accent)] active:scale-[0.99] motion-reduce:transition-none motion-reduce:hover:translate-y-0 md:grid-cols-[1fr_minmax(0,22rem)]"
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
        <div aria-hidden className="relative hidden h-full min-h-56 items-center justify-center transition-transform duration-500 ease-out group-hover:-rotate-2 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:transform-none md:flex">
          {art.slice(0, 3).map((src, i) => (
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
  );

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-xs font-bold tracking-[0.25em] text-accent">{t("eyebrow")}</p>
        <h1 className="font-display text-3xl font-extrabold sm:text-5xl">{t("title")}</h1>
        <p className="mt-2 max-w-xl text-sm text-common">{t("subtitle")}</p>
      </header>

      {status && <TicketsBar status={status} />}

      {/* the bento: Duel and the daily boards side by side, then the rest in a fixed order */}
      <ul className="grid auto-rows-[minmax(11.5rem,auto)] grid-cols-2 gap-3 md:grid-cols-6 lg:grid-cols-12">
        <li className="bento-in col-span-2 md:col-span-6 lg:col-span-7 lg:row-span-2" style={{ "--i": 0 } as CSSProperties}>
          {hero}
        </li>
        {daily.length > 0 && (
          <li className="bento-in col-span-2 flex flex-col gap-2 md:col-span-6 lg:col-span-5 lg:row-span-2" style={{ "--i": 1 } as CSSProperties}>
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-common">
              <span className="flex items-center gap-1 font-semibold text-accent">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                {t("today")}
              </span>
              {t("todayNote")}
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:flex-1 lg:auto-rows-fr lg:grid-cols-1">
              {daily.map((g) => (
                <div key={g.id} className="min-h-24 lg:min-h-0">
                  <GameTile game={g} size="day" />
                </div>
              ))}
            </div>
          </li>
        )}
        {rest.map((g, i) => (
          <li key={g.id} className={`bento-in ${SIZES[tileSize(g.id)]}`} style={{ "--i": i + 2 } as CSSProperties}>
            <GameTile game={g} size={tileSize(g.id)} face={tileArt.length ? tileArt[i % tileArt.length] : undefined} />
          </li>
        ))}
      </ul>

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

const ICONS: Record<GameEntry["icon"], LucideIcon> = { swords: Swords, spade: Spade, face: ScanFace, tv: Tv, heart: Heart, grid: Grid2x2, calendar: CalendarDays, shuffle: Shuffle, sword: Swords, link: Link2, compass: Compass, merge: Merge, layers: Layers };

// values for game texts with a placeholder (Memory shows its first level)
const TILE_VALUES = { n: 8 };

type Size = "day" | "flag" | "wide" | "mid" | "mid2";

// grid footprint per size: phone (2 columns) / tablet (6) / desktop (12)
const SIZES: Record<Size, string> = {
  day: "",
  flag: "col-span-2 md:col-span-3 lg:col-span-6",
  wide: "col-span-1 md:col-span-3 lg:col-span-6",
  mid: "col-span-1 md:col-span-3 lg:col-span-4",
  mid2: "col-span-2 md:col-span-3 lg:col-span-4",
};

const DAILY = new Set(["daily-hand", "daily-raid", "daily-peaks"]);
// the order after the dailies; games added later follow
const ORDER = ["expedition", "raid", "fusion", "peaks", "kizuna-hand", "twenty-one", "memory", "whos-that", "series-rush", "most-loved"];
const SIZE_OF: Record<string, Size> = { expedition: "flag", raid: "flag", fusion: "wide", peaks: "wide", "kizuna-hand": "mid2", "most-loved": "mid2" };

// games added later fall back to a small tile
function tileSize(id: string): Size {
  return DAILY.has(id) ? "day" : (SIZE_OF[id] ?? "mid");
}


// A game in the bento grid.
function GameTile({ game, size, face }: { game: GameEntry; size: Size; face?: string }) {
  const t = useTranslations(game.msg!);
  const tg = useTranslations("games");
  const Icon = ICONS[game.icon] ?? Swords;
  const big = size === "flag" || size === "wide";
  const daily = size === "day";
  // a daily is a compact row next to the Duel: icon, name and pitch, arrow
  if (daily)
    return (
      <Link
        href={game.href}
        style={{ "--c": game.color } as CSSProperties}
        className="group relative flex h-full items-center gap-3 overflow-hidden rounded-2xl border border-dashed border-[color:color-mix(in_srgb,var(--c)_40%,var(--color-border))] bg-panel p-4 transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-[color:var(--c)] hover:shadow-[0_16px_44px_-16px_var(--c)] active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      >
        <span aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_90%_at_100%_0%,color-mix(in_srgb,var(--c)_18%,transparent),transparent_70%)] opacity-70 transition-opacity duration-300 group-hover:opacity-100" />
        <span
          className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110 motion-reduce:transition-none"
          style={{ color: "var(--c)", borderColor: "color-mix(in srgb, var(--c) 45%, transparent)", background: "color-mix(in srgb, var(--c) 12%, transparent)" }}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <span className="relative min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-display text-lg leading-tight font-bold">{t("name")}</span>
            <span className="shrink-0 rounded-full border border-white/15 px-2 py-0.5 text-[11px] font-semibold text-common">{t("chip", TILE_VALUES)}</span>
          </span>
          <span className="mt-0.5 line-clamp-2 text-sm text-common">{t("pitch", TILE_VALUES)}</span>
        </span>
        <ArrowRight className="relative h-4 w-4 shrink-0 text-common transition group-hover:translate-x-0.5 group-hover:text-white motion-reduce:transition-none" aria-hidden />
      </Link>
    );
  return (
    <Link
      href={game.href}
      style={{ "--c": game.color } as CSSProperties}
      className={`group relative flex h-full flex-col gap-2 overflow-hidden rounded-2xl border bg-panel p-4 transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-1 hover:border-[color:var(--c)] hover:shadow-[0_16px_44px_-16px_var(--c)] active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${daily ? "border-dashed border-[color:color-mix(in_srgb,var(--c)_40%,var(--color-border))]" : "border-border"} ${big ? "sm:p-5" : ""}`}
    >
      {/* accent glow, a faint dot grain and a big ghost glyph */}
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_70%_at_100%_0%,color-mix(in_srgb,var(--c)_20%,transparent),transparent_70%)] opacity-70 transition-opacity duration-300 group-hover:opacity-100" />
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,#fff_1px,transparent_1.2px)] bg-[length:14px_14px] opacity-[0.07] [mask-image:linear-gradient(to_bottom_left,black,transparent_70%)]" />
      <Icon
        aria-hidden
        className={`pointer-events-none absolute opacity-[0.07] transition-transform duration-500 ease-out group-hover:-rotate-6 group-hover:scale-110 motion-reduce:transition-none ${big ? "-right-6 -bottom-8 h-44 w-44" : "-right-5 -bottom-5 h-28 w-28"}`}
        style={{ color: "var(--c)" }}
      />
      {big && face && (
        <span aria-hidden className="pointer-events-none absolute top-14 -right-2 hidden aspect-[5/7] w-28 rotate-6 overflow-hidden rounded-xl border-2 border-[color:var(--c)]/50 opacity-40 shadow-2xl transition-[transform,opacity] duration-500 ease-out group-hover:-translate-x-2 group-hover:-translate-y-1 group-hover:rotate-3 group-hover:opacity-70 motion-reduce:transition-none sm:block w-24 md:w-28">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={face} alt="" className="h-full w-full object-cover" />
        </span>
      )}
      <div className="relative flex flex-wrap items-center justify-between gap-2">
        <span
          className="flex h-10 w-10 items-center justify-center rounded-xl border transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110 motion-reduce:transition-none"
          style={{
            color: "var(--c)",
            borderColor: "color-mix(in srgb, var(--c) 45%, transparent)",
            background: "color-mix(in srgb, var(--c) 12%, transparent)",
          }}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <Modes solo={game.solo} multi={game.multi} />
      </div>
      <div className="relative mt-1 min-w-0">
        {daily && (
          <p className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold" style={{ color: "var(--c)" }}>
            <CalendarDays className="h-3 w-3" aria-hidden />
            {tg("today")}
          </p>
        )}
        <p className={`font-display leading-tight font-bold ${big ? "text-xl sm:text-2xl" : "text-lg"}`}>{t("name")}</p>
        <p className={`mt-1 text-sm text-common ${big ? "line-clamp-3 max-w-[70%]" : "line-clamp-2"}`}>{t("pitch", TILE_VALUES)}</p>
      </div>
      <div className="relative mt-auto flex items-center justify-between gap-2">
        <span className="truncate rounded-full border border-white/15 px-2.5 py-1 text-xs font-semibold text-common">{t("chip", TILE_VALUES)}</span>
        <ArrowRight className="h-4 w-4 shrink-0 text-common transition group-hover:translate-x-0.5 group-hover:text-white motion-reduce:transition-none" aria-hidden />
      </div>
    </Link>
  );
}

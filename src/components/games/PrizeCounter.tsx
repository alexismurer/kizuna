"use client";

import { useState, useTransition } from "react";
import { Check, Heart, Ticket } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";
import { PackArt } from "@/components/PackArt";
import { Avatar } from "@/components/social/Avatar";
import { BannerBackdrop } from "@/components/social/BannerBackdrop";
import { PlayerName } from "@/components/social/PlayerName";
import { PlayerTitle } from "@/components/social/PlayerTitle";
import { useRouter } from "@/i18n/navigation";
import {
  equipCosmetic,
  lastWishCard,
  redeemPrize,
  type PrizeCounterData,
  type PrizeItem,
  type PrizeTier,
  type WishCard,
} from "@/lib/actions/games";

type Me = { username: string; avatarUrl: string | null };

const TIERS: { id: PrizeTier; dot: string }[] = [
  { id: "big", dot: "bg-legendary" },
  { id: "medium", dot: "bg-epic" },
  { id: "small", dot: "bg-rare" },
];

// cosmetics you own for good and can wear
const WORN = ["title", "frame", "banner", "name"];
const isWorn = (p: PrizeItem) => WORN.includes(p.kind);
// kinds that share one card (with a list) when a tier has several of them
const LISTED = ["title", "name"];

// The prize counter: tickets for boosters and cosmetics, in three tiers with limits.
export function PrizeCounter({ data, me }: { data: PrizeCounterData; me: Me }) {
  const t = useTranslations("games.prizes");
  const tg = useTranslations("games");
  const format = useFormatter();
  const router = useRouter();
  const [tickets, setTickets] = useState(data.tickets);
  const [prizes, setPrizes] = useState(data.prizes);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [reveal, setReveal] = useState<WishCard | null>(null);
  const [burst, setBurst] = useState<{ id: string; n: number } | null>(null);
  const [pending, start] = useTransition();
  const capped = data.today >= data.dayCap;

  const err = (e: string) => setMsg({ ok: false, text: t.has(`errors.${e}`) ? t(`errors.${e}`) : t("errors.generic") });

  const buy = (p: PrizeItem) =>
    start(async () => {
      const r = await redeemPrize(p.id);
      if (!r.ok) return err(r.error.replace(/^.*?(\w+)$/, "$1"));
      setTickets(r.data);
      setPrizes((all) => all.map((x) => (x.id === p.id ? { ...x, left: x.left - 1, owned: isWorn(x) ? true : x.owned } : x)));
      setBurst((b) => ({ id: p.id, n: (b?.n ?? 0) + 1 }));
      setMsg({
        ok: true,
        text: t(isWorn(p) ? "doneCosmetic" : p.kind === "golden" ? "doneGolden" : p.kind === "wish" ? "doneWish" : "doneBooster"),
      });
      setReveal(p.kind === "wish" ? await lastWishCard() : null);
      setTimeout(() => router.refresh(), 0);
    });

  const equip = (p: PrizeItem, on: boolean) =>
    start(async () => {
      const r = await equipCosmetic(p.kind as "title" | "frame" | "banner" | "name", on ? p.id : null);
      if (!r.ok) return err(r.error);
      setPrizes((all) => all.map((x) => (x.kind === p.kind ? { ...x, equipped: on && x.id === p.id } : x)));
      setTimeout(() => router.refresh(), 0);
    });

  const actions = { buy, equip, tickets, pending, me, burst };

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <p className="text-xs font-bold tracking-[0.25em] text-accent">{tg("eyebrow")}</p>
          <h1 className="font-display text-4xl font-extrabold sm:text-5xl">{t("title")}</h1>
          <p className="mt-3 text-sm text-common sm:text-base">{t("pitch")}</p>
          <p className="mt-2 text-xs text-common">{t("caps", { today: data.today, dayCap: data.dayCap, week: data.week, weekCap: data.weekCap })}</p>
          {capped && <p className="mt-1 text-xs font-semibold text-legendary">{t("capReached")}</p>}
        </div>
        <p className="flex items-center gap-2 rounded-full border border-accent/50 bg-accent/10 px-5 py-2.5 text-accent">
          <Ticket className="h-5 w-5" aria-hidden />
          <span className="font-display text-2xl font-extrabold text-white">{format.number(tickets)}</span>
          <span className="text-sm font-semibold">{t("ticketsWord")}</span>
        </p>
      </header>

      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`rounded-xl border px-4 py-2 text-sm ${msg.ok ? "border-uncommon/40 text-uncommon" : "border-accent/40 text-accent"}`}>
          {msg.text}
        </p>
      )}
      <AnimatePresence>
        {reveal && (
          <motion.div
            key={reveal.name}
            initial={{ opacity: 0, y: 12, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-3 self-start rounded-2xl border border-epic/50 bg-panel p-2 pr-4"
          >
            {reveal.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={reveal.imageUrl} alt="" className="h-20 w-14 rounded-lg object-cover object-top" />
            )}
            <span className="font-display text-base font-bold">{reveal.name}</span>
            <button type="button" onClick={() => setReveal(null)} className="ml-2 text-xs font-semibold text-common hover:text-white">
              {t("dismiss")}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {TIERS.map(({ id, dot }) => {
        const items = prizes.filter((p) => p.tier === id);
        if (items.length === 0) return null;
        // titles and name styles share a card each when a tier has several
        const lists = LISTED.map((k) => items.filter((p) => p.kind === k)).filter((l) => l.length > 1);
        const cards = items.filter((p) => !lists.some((l) => l.includes(p)));
        return (
          <section key={id} className="flex flex-col gap-3">
            <div className="flex items-baseline gap-2">
              <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${dot}`} />
              <h2 className="font-display text-2xl font-bold">{t(`tiers.${id}`)}</h2>
              <span className="text-xs text-common">{t(`tiers.${id}Note`)}</span>
            </div>
            <div className={`grid gap-3 ${id === "big" ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-[repeat(auto-fill,minmax(14rem,1fr))]"}`}>
              {cards.map((p) => (
                <PrizeCard key={p.id} p={p} {...actions} />
              ))}
              {lists.map((l) => (
                <ListCard key={l[0].kind} items={l} {...actions} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

type Actions = {
  buy: (p: PrizeItem) => void;
  equip: (p: PrizeItem, on: boolean) => void;
  tickets: number;
  pending: boolean;
  me: Me;
  burst: { id: string; n: number } | null;
};

function useNames() {
  const t = useTranslations("games.prizes");
  const tc = useTranslations("cosmetics");
  return (p: PrizeItem) =>
    p.kind === "title"
      ? tc(`titles.${p.id}`)
      : p.kind === "frame"
        ? tc(`frames.${p.id}`)
        : p.kind === "banner"
          ? tc(`banners.${p.id}`)
          : p.kind === "name"
            ? tc(`names.${p.id}`)
            : t(`items.${p.id}.name`);
}

// A short burst of confetti where a prize was just redeemed (nothing for reduced motion).
const CONFETTI = ["bg-legendary", "bg-epic", "bg-rare", "bg-accent", "bg-uncommon"];
function Burst() {
  const reduce = useReducedMotion();
  if (reduce) return null;
  return (
    <span aria-hidden data-testid="burst" className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
      <motion.span
        className="absolute h-20 w-20 rounded-full border-2 border-white/70"
        initial={{ scale: 0.4, opacity: 0.9 }}
        animate={{ scale: 2.4, opacity: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
      />
      {Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2;
        const d = 54 + (i % 3) * 22;
        return (
          <motion.span
            key={i}
            className={`absolute h-2 w-2 rounded-sm ${CONFETTI[i % CONFETTI.length]}`}
            initial={{ x: 0, y: 0, scale: 1, opacity: 1, rotate: 0 }}
            animate={{ x: Math.cos(a) * d, y: Math.sin(a) * d + 18, scale: 0.3, opacity: 0, rotate: 200 + i * 20 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          />
        );
      })}
    </span>
  );
}

function LimitLine({ p }: { p: PrizeItem }) {
  const t = useTranslations("games.prizes");
  return (
    <p className="text-xs font-semibold">
      {p.period === "once" ? t("once") : t(p.period === "day" ? "limitDay" : p.period === "week" ? "limitWeek" : "limitMonth", { limit: p.limit, left: p.left })}
    </p>
  );
}

function Price({ p, buy, tickets, pending, full = true }: Pick<Actions, "buy" | "tickets" | "pending"> & { p: PrizeItem; full?: boolean }) {
  const format = useFormatter();
  // the look follows what you can afford; a purchase in flight only blocks the click
  const can = p.left > 0 && tickets >= p.cost;
  return (
    <button
      type="button"
      disabled={!can || pending}
      onClick={() => buy(p)}
      className={`flex items-center justify-center gap-2 rounded-full font-mono font-bold transition ${full ? "h-10 w-full" : "h-8 px-3 text-sm"} ${
        can ? "bg-white/90 text-black hover:bg-white disabled:cursor-wait" : "bg-white/15 text-white/40"
      }`}
    >
      <Ticket className="h-4 w-4" aria-hidden />
      {format.number(p.cost)}
    </button>
  );
}

function Wear({ p, equip, pending }: Pick<Actions, "equip" | "pending"> & { p: PrizeItem }) {
  const t = useTranslations("games.prizes");
  if (p.equipped)
    return (
      <button type="button" disabled={pending} onClick={() => equip(p, false)} className="flex h-10 w-full items-center justify-center gap-2 rounded-full border border-uncommon/50 text-sm font-bold text-uncommon">
        <Check className="h-4 w-4" aria-hidden />
        {t("equipped")}
      </button>
    );
  return (
    <button type="button" disabled={pending} onClick={() => equip(p, true)} className="h-10 w-full rounded-full bg-accent text-sm font-extrabold text-white">
      {t("equip")}
    </button>
  );
}

// you, as the other players see you: a frame, a banner, a name style or a title on show
function Preview({ me, frame, banner, name, title, size = 36 }: { me: Me; frame?: string; banner?: string; name?: string; title?: string; size?: number }) {
  return (
    <span className="relative flex w-full max-w-60 items-center gap-3 overflow-hidden rounded-xl border border-white/10 bg-black/40 px-3 py-2 shadow-lg">
      <BannerBackdrop id={banner} />
      {banner && <span aria-hidden className="absolute inset-0 bg-black/25" />}
      <span className="relative shrink-0">
        <Avatar url={me.avatarUrl} username={me.username} size={size} frame={frame} />
      </span>
      <span className="relative min-w-0 text-left">
        <span className="block truncate font-display font-bold">
          <PlayerName name={me.username} styleId={name} />
        </span>
        <PlayerTitle id={title} />
      </span>
    </span>
  );
}

function PrizeArt({ p, me }: { p: PrizeItem; me: Me }) {
  if (p.kind === "frame") return <Avatar url={me.avatarUrl} username={me.username} size={88} frame={p.id} />;
  if (p.kind === "title") return <Preview me={me} title={p.id} />;
  if (p.kind === "banner") return <Preview me={me} banner={p.id} size={44} />;
  if (p.kind === "name") return <Preview me={me} name={p.id} />;
  if (p.kind === "wish")
    return (
      <span className="relative flex h-full w-40 items-center justify-center">
        {[-1, 0, 1].map((i) => (
          <span
            key={i}
            className="absolute flex h-28 w-[4.5rem] items-center justify-center rounded-lg border border-white/20 bg-gradient-to-br from-epic/60 to-panel shadow-lg"
            style={{ transform: `translateX(${i * 30}px) rotate(${i * 9}deg)`, zIndex: i === 0 ? 2 : 1 }}
          >
            {i === 0 && <Heart className="h-7 w-7 fill-accent text-accent" aria-hidden />}
          </span>
        ))}
      </span>
    );
  if (p.kind === "custom")
    return (
      <span className="w-24 drop-shadow-[0_10px_30px_rgb(255_90_140/0.3)]">
        <PackArt pack={{ id: "custom" }} cards={5} />
      </span>
    );
  const pack = p.kind === "booster" ? (p.payload.pack ?? "mix") : "mix";
  const cards = pack === "prize_mythic" ? 4 : 5;
  if (p.kind === "booster")
    return (
      <span className="w-24 drop-shadow-[0_10px_30px_rgb(255_200_60/0.25)]">
        <PackArt pack={{ id: pack }} cards={cards} />
      </span>
    );
  // golden and bonus: a fan of boosters
  const golden = p.kind === "golden";
  return (
    <span className="relative flex h-full w-40 items-center justify-center">
      {[-1, 0, 1].map((i) => (
        <span
          key={i}
          className={`absolute w-20 ${golden ? "sepia saturate-[3] hue-rotate-[5deg] brightness-110" : ""}`}
          style={{ transform: `translateX(${i * 34}px) rotate(${i * 8}deg)`, zIndex: i === 0 ? 2 : 1 }}
        >
          <PackArt pack={{ id: "mix" }} cards={5} />
        </span>
      ))}
    </span>
  );
}

const BADGE: Record<string, { text: string; cls: string }> = {
  legendary_booster: { text: "L", cls: "bg-legendary text-black" },
  mythic_booster: { text: "M", cls: "bg-mythic text-white" },
  golden3: { text: "×3", cls: "bg-epic text-white" },
  bonus5: { text: "×5", cls: "bg-rare text-black" },
};

function PrizeCard({ p, buy, equip, tickets, pending, me, burst }: Actions & { p: PrizeItem }) {
  const t = useTranslations("games.prizes");
  const name = useNames()(p);
  const glow = p.tier === "big" ? "from-legendary/20" : p.tier === "medium" ? "from-epic/20" : "from-rare/20";
  return (
    <article className={`flex flex-col overflow-hidden rounded-2xl border bg-panel ${p.tier === "big" ? "border-legendary/30" : "border-border"}`}>
      <div className={`relative flex h-40 items-center justify-center bg-gradient-to-b ${glow} to-transparent p-4`}>
        <PrizeArt p={p} me={me} />
        {BADGE[p.id] && (
          <span className={`absolute right-3 top-3 rounded-full px-2.5 py-1 font-display text-xs font-extrabold ${BADGE[p.id].cls}`}>{BADGE[p.id].text}</span>
        )}
        {burst?.id === p.id && <Burst key={burst.n} />}
      </div>
      <div className="flex flex-1 flex-col gap-1 border-t border-border p-4">
        <h3 className="font-display text-base font-bold">{name}</h3>
        <p className="text-sm text-common">{t(isWorn(p) ? `items.${p.kind}Text` : `items.${p.id}.text`)}</p>
        {p.owned ? <p className="text-xs font-semibold text-uncommon">{t("owned")}</p> : <LimitLine p={p} />}
        <div className="mt-auto pt-3">{p.owned ? <Wear p={p} equip={equip} pending={pending} /> : <Price p={p} buy={buy} tickets={tickets} pending={pending} />}</div>
      </div>
    </article>
  );
}

// Several titles (or name styles) on one card: hover or focus one to preview it on your name.
function ListCard({ items, buy, equip, tickets, pending, me, burst }: Actions & { items: PrizeItem[] }) {
  const t = useTranslations("games.prizes");
  const name = useNames();
  const kind = items[0].kind;
  const [hover, setHover] = useState<string | null>(null);
  const shown = hover ?? items.find((x) => x.equipped)?.id ?? items[0].id;
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-border bg-panel sm:col-span-2">
      <div className="relative flex h-40 items-center justify-center bg-[radial-gradient(60%_80%_at_50%_50%,color-mix(in_srgb,var(--color-rare)_18%,transparent),transparent)] p-4">
        <span data-testid={`${kind}-preview`} className="contents">
          <Preview me={me} {...(kind === "title" ? { title: shown } : { name: shown })} />
        </span>
        {burst && items.some((x) => x.id === burst.id) && <Burst key={burst.n} />}
      </div>
      <div className="flex flex-col gap-1 border-t border-border p-4">
        <h3 className="font-display text-base font-bold">{t(`items.${kind}s.name`)}</h3>
        <p className="text-sm text-common">{t(`items.${kind}Text`)}</p>
        <ul className="mt-2 flex flex-col gap-1" onMouseLeave={() => setHover(null)}>
          {items.map((p) => {
            // unaffordable ones stay focusable so their preview still shows
            const locked = !p.owned && (tickets < p.cost || p.left < 1);
            return (
              <li key={p.id} className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 ${shown === p.id ? "bg-white/5" : ""}`}>
                <button
                  type="button"
                  onMouseEnter={() => setHover(p.id)}
                  onFocus={() => setHover(p.id)}
                  onClick={() => {
                    if (locked || pending) return;
                    if (p.owned) equip(p, !p.equipped);
                    else buy(p);
                  }}
                  aria-disabled={locked || pending}
                  className={`flex min-w-0 flex-1 items-center justify-between gap-2 text-left text-sm font-semibold ${locked ? "cursor-not-allowed" : ""}`}
                >
                  <span className="truncate">{name(p)}</span>
                  {p.owned ? (
                    <span className={`shrink-0 text-xs font-bold ${p.equipped ? "text-uncommon" : "text-accent"}`}>{p.equipped ? t("equipped") : t("equip")}</span>
                  ) : (
                    <span className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-xs ${tickets >= p.cost ? "border-white/40" : "border-border text-white/40"}`}>
                      <Ticket className="h-3.5 w-3.5" aria-hidden />
                      {p.cost}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </article>
  );
}

"use client";

import { useState, useTransition } from "react";
import { Check, Ticket } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { PackArt } from "@/components/PackArt";
import { Avatar } from "@/components/social/Avatar";
import { PlayerTitle } from "@/components/social/PlayerTitle";
import { useRouter } from "@/i18n/navigation";
import { equipCosmetic, redeemPrize, type PrizeCounterData, type PrizeItem, type PrizeTier } from "@/lib/actions/games";

type Me = { username: string; avatarUrl: string | null };

const TIERS: { id: PrizeTier; dot: string }[] = [
  { id: "big", dot: "bg-legendary" },
  { id: "medium", dot: "bg-epic" },
  { id: "small", dot: "bg-rare" },
];

// The prize counter: tickets for boosters and cosmetics, in three tiers with limits.
export function PrizeCounter({ data, me }: { data: PrizeCounterData; me: Me }) {
  const t = useTranslations("games.prizes");
  const tg = useTranslations("games");
  const format = useFormatter();
  const router = useRouter();
  const [tickets, setTickets] = useState(data.tickets);
  const [prizes, setPrizes] = useState(data.prizes);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const capped = data.today >= data.dayCap;

  const err = (e: string) => setMsg({ ok: false, text: t.has(`errors.${e}`) ? t(`errors.${e}`) : t("errors.generic") });

  const buy = (p: PrizeItem) =>
    start(async () => {
      const r = await redeemPrize(p.id);
      if (!r.ok) return err(r.error.replace(/^.*?(\w+)$/, "$1"));
      setTickets(r.data);
      setPrizes((all) =>
        all.map((x) => (x.id === p.id ? { ...x, left: x.left - 1, owned: x.kind === "title" || x.kind === "frame" ? true : x.owned } : x)),
      );
      setMsg({ ok: true, text: t(p.kind === "title" || p.kind === "frame" ? "doneCosmetic" : p.kind === "golden" ? "doneGolden" : "doneBooster") });
      setTimeout(() => router.refresh(), 0);
    });

  const equip = (p: PrizeItem, on: boolean) =>
    start(async () => {
      const kind = p.kind === "frame" ? "frame" : "title";
      const r = await equipCosmetic(kind, on ? p.id : null);
      if (!r.ok) return err(r.error);
      setPrizes((all) => all.map((x) => (x.kind === p.kind ? { ...x, equipped: on && x.id === p.id } : x)));
      setTimeout(() => router.refresh(), 0);
    });

  const actions = { buy, equip, tickets, pending, me };

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

      {TIERS.map(({ id, dot }) => {
        const items = prizes.filter((p) => p.tier === id);
        if (items.length === 0) return null;
        const titles = id === "small" ? items.filter((p) => p.kind === "title") : [];
        const cards = items.filter((p) => !titles.includes(p));
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
              {titles.length > 0 && <TitlesCard titles={titles} {...actions} />}
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
};

function useNames() {
  const t = useTranslations("games.prizes");
  const tc = useTranslations("cosmetics");
  return (p: PrizeItem) =>
    p.kind === "title" ? tc(`titles.${p.id}`) : p.kind === "frame" ? tc(`frames.${p.id}`) : t(`items.${p.id}.name`);
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

function PrizeArt({ p, me }: { p: PrizeItem; me: Me }) {
  if (p.kind === "frame")
    return <Avatar url={me.avatarUrl} username={me.username} size={88} frame={p.id} />;
  if (p.kind === "title")
    return (
      <span className="flex items-center gap-3 rounded-xl border border-legendary/40 bg-black/40 px-3 py-2 shadow-lg">
        <Avatar url={me.avatarUrl} username={me.username} size={36} />
        <span className="min-w-0 text-left">
          <span className="block truncate font-display font-bold">{me.username}</span>
          <PlayerTitle id={p.id} />
        </span>
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

function PrizeCard({ p, buy, equip, tickets, pending, me }: Actions & { p: PrizeItem }) {
  const t = useTranslations("games.prizes");
  const name = useNames()(p);
  const cosmetic = p.kind === "title" || p.kind === "frame";
  const glow = p.tier === "big" ? "from-legendary/20" : p.tier === "medium" ? "from-epic/20" : "from-rare/20";
  return (
    <article className={`flex flex-col overflow-hidden rounded-2xl border bg-panel ${p.tier === "big" ? "border-legendary/30" : "border-border"}`}>
      <div className={`relative flex h-40 items-center justify-center bg-gradient-to-b ${glow} to-transparent p-4`}>
        <PrizeArt p={p} me={me} />
        {BADGE[p.id] && (
          <span className={`absolute right-3 top-3 rounded-full px-2.5 py-1 font-display text-xs font-extrabold ${BADGE[p.id].cls}`}>{BADGE[p.id].text}</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 border-t border-border p-4">
        <h3 className="font-display text-base font-bold">{name}</h3>
        <p className="text-sm text-common">{t(cosmetic ? `items.${p.kind}Text` : `items.${p.id}.text`)}</p>
        {p.owned ? <p className="text-xs font-semibold text-uncommon">{t("owned")}</p> : <LimitLine p={p} />}
        <div className="mt-auto pt-3">{p.owned ? <Wear p={p} equip={equip} pending={pending} /> : <Price p={p} buy={buy} tickets={tickets} pending={pending} />}</div>
      </div>
    </article>
  );
}

function TitlesCard({ titles, buy, equip, tickets, pending, me }: Actions & { titles: PrizeItem[] }) {
  const t = useTranslations("games.prizes");
  const name = useNames();
  const [hover, setHover] = useState<string | null>(null);
  const shown = hover ?? titles.find((x) => x.equipped)?.id ?? titles[0].id;
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-border bg-panel sm:col-span-2">
      <div className="flex h-40 items-center justify-center bg-[radial-gradient(60%_80%_at_50%_50%,color-mix(in_srgb,var(--color-rare)_18%,transparent),transparent)] p-4">
        <span data-testid="title-preview" className="flex items-center gap-3 rounded-xl border border-border bg-black/50 px-3 py-2 shadow-lg">
          <Avatar url={me.avatarUrl} username={me.username} size={36} />
          <span className="min-w-0 text-left">
            <span className="block truncate font-display font-bold">{me.username}</span>
            <PlayerTitle id={shown} />
          </span>
        </span>
      </div>
      <div className="flex flex-col gap-1 border-t border-border p-4">
        <h3 className="font-display text-base font-bold">{t("items.titles.name")}</h3>
        <p className="text-sm text-common">{t("items.titleText")}</p>
        <ul className="mt-2 flex flex-col gap-1" onMouseLeave={() => setHover(null)}>
          {titles.map((p) => (
            <li key={p.id} className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 ${shown === p.id ? "bg-white/5" : ""}`}>
              <button
                type="button"
                onMouseEnter={() => setHover(p.id)}
                onFocus={() => setHover(p.id)}
                onClick={() => (p.owned ? equip(p, !p.equipped) : buy(p))}
                disabled={pending || (!p.owned && (tickets < p.cost || p.left < 1))}
                className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left text-sm font-semibold disabled:cursor-not-allowed"
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
          ))}
        </ul>
      </div>
    </article>
  );
}

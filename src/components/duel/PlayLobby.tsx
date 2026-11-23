"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Copy, Pencil, Swords, Users } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { Link, useRouter, usePathname } from "@/i18n/navigation";
import type { CardData } from "@/components/card/CardView";
import { COLOR } from "@/components/card/rarityColor";
import { MIN_DECK, type DeckCard, type UnitCard } from "@/lib/duel/cards";
import { autoList, CAPPED, deckIssues, RARITY_CAP, sanitize, toDeck, type DeckList } from "@/lib/duel/deck";
import { loadDeck, saveDeck } from "@/lib/duel/deckStore";
import { DeckBuilder } from "./DeckBuilder";
import { DuelBoard } from "./DuelBoard";
import { DuelCardChip } from "./DuelCardChip";
import { HowToPlay } from "./HowToPlay";
import { useLocalDuel, useRoomDuel } from "./useDuel";

type Me = { id: string; name: string; avatarUrl?: string | null };
type Mode = { kind: "ai" } | { kind: "room"; code: string; host: boolean };
type Unit = Omit<UnitCard, "uid">;

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
const cleanCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
const unitsOf = (deck: DeckCard[] | null) => (deck ?? []).filter((c): c is Unit => c.kind === "unit");
const rise = { hidden: { opacity: 0, y: 18 }, shown: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" as const } } };

export function PlayLobby({ me, owned, starterDeck }: { me: Me; owned: CardData[]; starterDeck: DeckCard[] }) {
  const t = useTranslations("duel");
  const router = useRouter();
  const pathname = usePathname();
  const byId = useMemo(() => new Map(owned.map((c) => [c.id, c])), [owned]);
  const canBuild = owned.length >= MIN_DECK;
  // your saved deck (this browser), else the strongest legal one
  const [list, setList] = useState<DeckList>(() => autoList(owned));
  const [building, setBuilding] = useState(false);
  useEffect(() => {
    const saved = loadDeck(me.id);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read storage after hydration
    if (saved) setList(sanitize(saved, byId));
  }, [me.id, byId]);
  const units = list.cards.map((id) => byId.get(id)!).filter(Boolean);
  const listOk = canBuild && deckIssues(units, list.tactics).length === 0;
  const collectionDeck = useMemo(() => (listOk ? toDeck(list, byId) : null), [listOk, list, byId]);
  const [deckKind, setDeckKind] = useState<"collection" | "starter">(canBuild ? "collection" : "starter");
  const [mode, setMode] = useState<Mode | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const deck = deckKind === "collection" && collectionDeck ? collectionDeck : starterDeck;

  // a shared link (?room=CODE) joins that room straight away
  useEffect(() => {
    const room = cleanCode(new URLSearchParams(window.location.search).get("room") ?? "");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (room.length === 6) setMode({ kind: "room", code: room, host: false });
  }, []);

  const exit = () => {
    setMode(null);
    router.replace(pathname);
  };

  if (building) {
    return (
      <DeckBuilder
        owned={owned}
        initial={list}
        onCancel={() => setBuilding(false)}
        onSave={(next) => {
          setList(next);
          saveDeck(me.id, next);
          setDeckKind("collection");
          setBuilding(false);
        }}
      />
    );
  }
  if (mode?.kind === "ai") return <AiMatch me={me} deck={deck} aiDeck={starterDeck} onExit={exit} />;
  if (mode?.kind === "room") return <RoomMatch me={me} deck={deck} code={mode.code} host={mode.host} onExit={exit} />;

  return (
    <motion.div className="flex flex-col gap-8" initial="hidden" animate="shown" variants={{ shown: { transition: { staggerChildren: 0.08 } } }}>
      {/* hero: the duel table, the deck's best cards fanned out */}
      <motion.header variants={rise} className="duel-table relative overflow-hidden rounded-[28px] border border-white/10 p-6 sm:p-10">
        <span aria-hidden className="pointer-events-none absolute -right-6 -top-10 select-none font-display text-[11rem] font-extrabold leading-none text-white/[0.04] sm:text-[16rem]">
          決闘
        </span>
        <div className="relative grid items-center gap-6 md:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-3">
            <Link href="/play" className="inline-flex w-fit items-center gap-1.5 text-sm text-common hover:text-white">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              {t("backToRoom")}
            </Link>
            <p className="text-xs font-bold tracking-[0.3em] text-accent">{t("eyebrow")}</p>
            <h1 className="font-display text-5xl font-extrabold tracking-tight sm:text-7xl">{t("title")}</h1>
            <p className="max-w-xl text-sm text-white/70 sm:text-base">{t("subtitle")}</p>
            <ul className="mt-1 flex flex-wrap gap-2">
              {(["rows", "rounds", "cards"] as const).map((k) => (
                <li key={k} className="rounded-full border border-white/15 bg-black/30 px-3 py-1 text-xs font-semibold backdrop-blur">
                  {t(`lobby.facts.${k}`)}
                </li>
              ))}
            </ul>
          </div>
          <Fan cards={unitsOf(deck)} />
        </div>
      </motion.header>

      {/* 1. your deck */}
      <motion.section variants={rise} className="flex flex-col gap-3">
        <Step n={1} title={t("deck.title")} />
        <div className="grid gap-4 md:grid-cols-2">
          <DeckTile
            title={t("deck.collection")}
            text={!canBuild ? t("deck.tooFew", { n: owned.length, min: MIN_DECK }) : collectionDeck ? t("deck.collectionText") : t("deck.invalid")}
            deck={collectionDeck}
            active={deckKind === "collection" && !!collectionDeck}
            onPick={collectionDeck ? () => setDeckKind("collection") : undefined}
            onEdit={canBuild ? () => setBuilding(true) : undefined}
          />
          <DeckTile
            title={t("deck.starter")}
            text={t("deck.starterText")}
            deck={starterDeck}
            active={deckKind === "starter"}
            onPick={() => setDeckKind("starter")}
          />
        </div>
      </motion.section>

      {/* 2. your opponent */}
      <motion.section variants={rise} className="flex flex-col gap-3">
        <Step n={2} title={t("lobby.opponent")} />
        <div className="grid gap-4 md:grid-cols-2">
          <ModeCard tone="var(--color-cta)" glyph="師" title={t("ai.title")} text={t("ai.text")} chips={[t("lobby.solo"), t("lobby.ticketsAi")]}>
            <motion.button
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setMode({ kind: "ai" })}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-cta py-3.5 font-display text-lg font-extrabold text-black shadow-[0_0_30px_rgb(255_210_63/0.35)]"
            >
              <Swords className="h-5 w-5" aria-hidden />
              {t("ai.start")}
            </motion.button>
          </ModeCard>
          <ModeCard tone="var(--color-accent)" glyph="対" title={t("friend.title")} text={t("friend.text")} chips={[t("lobby.multi"), t("lobby.ticketsFriend")]}>
            <div className="flex flex-col gap-2">
              <motion.button
                type="button"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setMode({ kind: "room", code: newCode(), host: true })}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-accent py-3.5 font-display text-lg font-extrabold text-white shadow-[0_0_30px_rgb(255_61_127/0.35)]"
              >
                <Users className="h-5 w-5" aria-hidden />
                {t("friend.create")}
              </motion.button>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (joinCode.length === 6) setMode({ kind: "room", code: joinCode, host: false });
                }}
              >
                <input
                  value={joinCode}
                  onChange={(e) => setJoinCode(cleanCode(e.target.value))}
                  placeholder={t("friend.codePlaceholder")}
                  aria-label={t("friend.code")}
                  className="min-w-0 flex-1 rounded-full border border-white/15 bg-black/40 px-4 py-2.5 text-center font-mono text-lg uppercase tracking-[0.5em] placeholder:tracking-[0.3em]"
                />
                <button type="submit" disabled={joinCode.length !== 6} className="rounded-full border border-white/20 px-5 font-bold disabled:opacity-40">
                  {t("friend.join")}
                </button>
              </form>
            </div>
          </ModeCard>
        </div>
      </motion.section>

      <motion.div variants={rise}>
        <HowToPlay />
      </motion.div>
    </motion.div>
  );
}

function Step({ n, title }: { n: number; title: string }) {
  return (
    <h2 className="flex items-center gap-3 font-display text-2xl font-bold">
      <span aria-hidden className="duel-hex flex h-9 w-10 items-center justify-center bg-accent text-base font-extrabold text-white">
        {n}
      </span>
      {title}
    </h2>
  );
}

// the deck's strongest cards fanned out, gently floating
function Fan({ cards }: { cards: Unit[] }) {
  const top = [...cards].sort((a, b) => b.base - a.base || Number(b.hero) - Number(a.hero)).slice(0, 5);
  const mid = (top.length - 1) / 2;
  return (
    <div aria-hidden className="relative hidden h-56 w-[22rem] md:block">
      {top.map((c, i) => (
        <motion.div
          key={c.cardId}
          className="absolute left-1/2 top-6 origin-bottom"
          style={{ zIndex: 10 - Math.round(Math.abs(i - mid) * 2), marginLeft: -42 + (i - mid) * 52 }}
          initial={{ opacity: 0, y: 40, rotate: 0 }}
          animate={{ opacity: 1, y: [0, -6, 0], rotate: (i - mid) * 9 }}
          transition={{
            opacity: { delay: 0.2 + i * 0.08 },
            rotate: { delay: 0.2 + i * 0.08, type: "spring", stiffness: 120 },
            y: { duration: 4, repeat: Infinity, delay: i * 0.4, ease: "easeInOut" },
          }}
        >
          <DuelCardChip card={{ ...c, uid: `fan${i}` }} size="hand" />
        </motion.div>
      ))}
    </div>
  );
}

function ModeCard({
  tone,
  glyph,
  title,
  text,
  chips,
  children,
}: {
  tone: string;
  glyph: string;
  title: string;
  text: string;
  chips: string[];
  children: React.ReactNode;
}) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      className="relative flex flex-col gap-4 overflow-hidden rounded-3xl border border-white/10 bg-panel p-5 sm:p-6"
      style={{ boxShadow: `0 30px 60px -40px ${tone}` }}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(80% 80% at 100% 0%, color-mix(in srgb, ${tone} 18%, transparent), transparent 60%)` }} />
      <div className="relative flex items-center gap-4">
        <span
          aria-hidden
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border-2 font-display text-3xl font-extrabold"
          style={{ borderColor: tone, color: tone, boxShadow: `0 0 30px color-mix(in srgb, ${tone} 40%, transparent), inset 0 0 20px color-mix(in srgb, ${tone} 20%, transparent)` }}
        >
          {glyph}
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-2xl font-extrabold leading-tight">{title}</h3>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <span key={c} className="rounded-full border px-2 py-0.5 text-[11px] font-bold" style={{ borderColor: `color-mix(in srgb, ${tone} 50%, transparent)`, color: tone }}>
                {c}
              </span>
            ))}
          </div>
        </div>
      </div>
      <p className="relative flex-1 text-sm text-white/70">{text}</p>
      <div className="relative">{children}</div>
    </motion.div>
  );
}

function DeckTile({
  title,
  text,
  deck,
  active,
  onPick,
  onEdit,
}: {
  title: string;
  text: string;
  deck: DeckCard[] | null;
  active: boolean;
  onPick?: () => void;
  onEdit?: () => void;
}) {
  const t = useTranslations("duel");
  const tr = useTranslations("rarity");
  const units = useMemo(() => unitsOf(deck), [deck]);
  const power = units.reduce((s, u) => s + u.base, 0);
  const shown = [...units].sort((a, b) => b.base - a.base).slice(0, 7);
  return (
    <motion.div
      whileHover={onPick ? { y: -3 } : undefined}
      className={`relative flex flex-col overflow-hidden rounded-3xl border-2 bg-panel transition-colors ${
        active ? "border-cta shadow-[0_0_40px_-12px_rgb(255_210_63/0.6)]" : "border-white/10 hover:border-white/25"
      }`}
    >
      <button type="button" disabled={!onPick} onClick={onPick} aria-pressed={active} className="flex flex-1 flex-col gap-3 p-5 text-left disabled:cursor-default">
        <span className="flex items-center justify-between gap-2">
          <span className="font-display text-xl font-extrabold">{title}</span>
          <span className={`flex h-7 w-7 items-center justify-center rounded-full border-2 ${active ? "border-cta bg-cta text-black" : "border-white/20"}`}>
            {active && <Check className="h-4 w-4" aria-hidden />}
          </span>
        </span>
        <span className="text-sm text-common">{text}</span>
        {units.length > 0 && (
          <>
            {/* a hand of the deck's best cards */}
            <span className="flex h-28 items-end pl-2">
              {shown.map((u, i) => (
                <span
                  key={i}
                  className="-ml-4 transition-transform first:ml-0 hover:-translate-y-2"
                  style={{ transform: `rotate(${(i - (shown.length - 1) / 2) * 4}deg)`, zIndex: i }}
                >
                  <DuelCardChip card={{ ...u, uid: `p${i}` }} size="hand" />
                </span>
              ))}
            </span>
            <span className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="rounded-full bg-white/[0.06] px-2.5 py-1 font-semibold">{t("deck.stats", { n: units.length, power })}</span>
              {CAPPED.map((r) => (
                <span key={r} className="rounded-full border px-2 py-0.5 font-bold" style={{ borderColor: COLOR[r], color: COLOR[r] }}>
                  {tr(r)} {units.filter((u) => u.rarity === r).length}/{RARITY_CAP[r]}
                </span>
              ))}
            </span>
          </>
        )}
      </button>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="mx-5 mb-5 flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.03] py-2.5 text-sm font-bold hover:border-white/40"
        >
          <Pencil className="h-4 w-4" aria-hidden />
          {t("deck.edit")}
        </button>
      )}
    </motion.div>
  );
}

function AiMatch({ me, deck, aiDeck, onExit }: { me: Me; deck: DeckCard[]; aiDeck: DeckCard[]; onExit: () => void }) {
  const t = useTranslations("duel");
  const names = useMemo<[string, string]>(() => [me.name, t("ai.name")], [me.name, t]);
  const session = useLocalDuel(deck, aiDeck, names);
  return <DuelBoard session={session} onExit={onExit} />;
}

function RoomMatch({ me, deck, code, host, onExit }: { me: Me; deck: DeckCard[]; code: string; host: boolean; onExit: () => void }) {
  const t = useTranslations("duel");
  const session = useRoomDuel({ code, host, me, deck });
  const [copied, setCopied] = useState(false);

  if (session.view && session.status !== "left") return <DuelBoard session={session} onExit={onExit} />;

  const link = typeof window === "undefined" ? "" : `${window.location.origin}${window.location.pathname}?room=${code}`;
  const message =
    session.status === "left"
      ? t("room.left")
      : session.status === "full"
        ? t("room.full")
        : session.status === "notFound"
          ? t("room.notFound")
          : host
            ? t("room.waiting")
            : t("room.joining");
  const waiting = session.status === "waiting" || session.status === "connecting";

  return (
    <div className="duel-table mx-auto flex w-full max-w-lg flex-col items-center gap-5 rounded-[28px] border border-white/10 p-8 text-center">
      <p className="text-xs font-bold tracking-[0.3em] text-accent">{t("room.title")}</p>
      <div className="relative flex items-center justify-center">
        {waiting && (
          <motion.span
            aria-hidden
            className="absolute h-24 w-24 rounded-full border-2 border-accent/60"
            animate={{ scale: [1, 1.7], opacity: [0.7, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
          />
        )}
        <span
          aria-hidden
          className="relative flex h-24 w-24 items-center justify-center rounded-full border-2 border-accent bg-black/40 font-display text-4xl font-extrabold text-accent shadow-[0_0_40px_rgb(255_61_127/0.4)]"
        >
          対
        </span>
      </div>
      <p className="flex gap-1.5" aria-label={code}>
        {[...code].map((ch, i) => (
          <motion.span
            key={i}
            aria-hidden
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className="flex h-14 w-11 items-center justify-center rounded-xl border border-white/15 bg-black/40 font-mono text-3xl font-extrabold"
          >
            {ch}
          </motion.span>
        ))}
      </p>
      <p className="text-sm text-white/75" role="status">
        {message}
      </p>
      {session.error && (
        <p role="alert" className="text-sm text-accent">
          {t.has(`errors.${session.error}`) ? t(`errors.${session.error}`) : t("errors.unknown")}
        </p>
      )}
      {host && session.status !== "left" && (
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              setCopied(true);
            } catch {
              // no clipboard: the code is on screen
            }
          }}
          className="flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-extrabold text-white"
        >
          {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          {copied ? t("room.copied") : t("room.copy")}
        </button>
      )}
      <button type="button" onClick={onExit} className="text-sm text-common hover:text-white">
        {t("leave")}
      </button>
    </div>
  );
}

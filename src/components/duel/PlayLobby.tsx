"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Bot, Check, Copy, Pencil, Swords, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, useRouter, usePathname } from "@/i18n/navigation";
import type { CardData } from "@/components/card/CardView";
import { MIN_DECK, type DeckCard, type UnitCard } from "@/lib/duel/cards";
import { autoList, deckIssues, sanitize, toDeck, type DeckList } from "@/lib/duel/deck";
import { loadDeck, saveDeck } from "@/lib/duel/deckStore";
import { DeckBuilder } from "./DeckBuilder";
import { DuelBoard } from "./DuelBoard";
import { DuelCardChip } from "./DuelCardChip";
import { HowToPlay } from "./HowToPlay";
import { useLocalDuel, useRoomDuel } from "./useDuel";

type Me = { id: string; name: string; avatarUrl?: string | null };
type Mode = { kind: "ai" } | { kind: "room"; code: string; host: boolean };

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
const cleanCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

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
    <div className="flex flex-col gap-6">
      <header>
        <Link href="/play" className="mb-3 inline-flex items-center gap-1.5 text-sm text-common hover:text-white">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t("backToRoom")}
        </Link>
        <p className="text-xs font-bold tracking-[0.25em] text-accent">{t("eyebrow")}</p>
        <h1 className="font-display text-3xl font-extrabold sm:text-5xl">{t("title")}</h1>
        <p className="mt-2 max-w-2xl text-sm text-common">{t("subtitle")}</p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-bold">{t("deck.title")}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <DeckTile
            title={t("deck.collection")}
            text={
              !canBuild
                ? t("deck.tooFew", { n: owned.length, min: MIN_DECK })
                : collectionDeck
                  ? t("deck.collectionText")
                  : t("deck.invalid")
            }
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
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-panel p-4 sm:p-5">
          <Bot className="h-8 w-8 text-cta" aria-hidden />
          <h2 className="font-display text-xl font-bold">{t("ai.title")}</h2>
          <p className="flex-1 text-sm text-common">{t("ai.text")}</p>
          <button
            type="button"
            onClick={() => setMode({ kind: "ai" })}
            className="flex items-center justify-center gap-2 rounded-full bg-cta py-3 font-extrabold text-black"
          >
            <Swords className="h-4 w-4" aria-hidden />
            {t("ai.start")}
          </button>
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-panel p-4 sm:p-5">
          <Users className="h-8 w-8 text-accent" aria-hidden />
          <h2 className="font-display text-xl font-bold">{t("friend.title")}</h2>
          <p className="text-sm text-common">{t("friend.text")}</p>
          <button
            type="button"
            onClick={() => setMode({ kind: "room", code: newCode(), host: true })}
            className="rounded-full bg-accent py-3 font-extrabold text-white"
          >
            {t("friend.create")}
          </button>
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
              className="min-w-0 flex-1 rounded-full border border-border bg-bg px-4 py-2.5 font-mono tracking-[0.3em] uppercase"
            />
            <button
              type="submit"
              disabled={joinCode.length !== 6}
              className="rounded-full border border-border px-5 font-bold disabled:opacity-40"
            >
              {t("friend.join")}
            </button>
          </form>
        </div>
      </section>

      <HowToPlay />
    </div>
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
  const units = useMemo(() => (deck ?? []).filter((c): c is Omit<UnitCard, "uid"> => c.kind === "unit"), [deck]);
  const power = units.reduce((s, u) => s + u.base, 0);
  return (
    <div className={`flex flex-col rounded-2xl border-2 bg-panel transition-colors ${active ? "border-cta" : "border-border hover:border-white/30"}`}>
      <button
        type="button"
        disabled={!onPick}
        onClick={onPick}
        aria-pressed={active}
        className="flex flex-1 flex-col gap-3 p-4 text-left disabled:cursor-default"
      >
        <span className="flex items-center justify-between gap-2">
          <span className="font-display text-lg font-bold">{title}</span>
          {active && <Check className="h-5 w-5 text-cta" aria-hidden />}
        </span>
        <span className="text-sm text-common">{text}</span>
        {units.length > 0 && (
          <>
            <span className="flex gap-1.5 overflow-hidden">
              {units.slice(0, 6).map((u, i) => (
                <DuelCardChip key={i} card={{ ...u, uid: `p${i}` }} size="hand" />
              ))}
            </span>
            <span className="text-xs text-common">{t("deck.stats", { n: units.length, power })}</span>
          </>
        )}
      </button>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="mx-4 mb-4 flex items-center justify-center gap-2 rounded-full border border-border py-2 text-sm font-bold hover:border-white/40"
        >
          <Pencil className="h-4 w-4" aria-hidden />
          {t("deck.edit")}
        </button>
      )}
    </div>
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

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-panel p-6 text-center">
      <p className="text-xs font-bold tracking-[0.25em] text-accent">{t("room.title")}</p>
      <p className="font-mono text-4xl font-extrabold tracking-[0.3em]">{code}</p>
      <p className="text-sm text-common" role="status">
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
          className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-bold"
        >
          {copied ? <Check className="h-4 w-4 text-uncommon" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          {copied ? t("room.copied") : t("room.copy")}
        </button>
      )}
      <button type="button" onClick={onExit} className="text-sm text-common hover:text-white">
        {t("leave")}
      </button>
    </div>
  );
}

"use client";

import { useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  Crown,
  LogOut,
  Search,
  Shuffle,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { MAX_PLAYERS, type Seat, type TableState } from "./useTable";

const Avatar = ({ seat, size = "h-9 w-9" }: { seat: Seat; size?: string }) =>
  seat.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={seat.avatarUrl}
      alt=""
      className={`${size} shrink-0 rounded-full object-cover`}
    />
  ) : (
    <span
      className={`${size} flex shrink-0 items-center justify-center rounded-full bg-white/10 font-display font-bold`}
    >
      {seat.name.slice(0, 1).toUpperCase()}
    </span>
  );

// Before the game: find or open a table, share its code, wait for players, start.
export function TableLobby({
  table,
  color,
  meId,
}: {
  table: TableState;
  color: string;
  meId: string;
}) {
  const t = useTranslations("arcade.table");
  const te = useTranslations("arcade.errors");
  const [input, setInput] = useState("");
  const [copied, setCopied] = useState(false);
  const err = table.error
    ? te.has(table.error)
      ? te(table.error)
      : te("generic")
    : null;

  if (!table.code)
    return (
      <div className="flex min-h-[34rem] flex-col items-center justify-center gap-4 p-6 text-center">
        <span
          className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/15"
          style={{ color }}
        >
          <Users className="h-7 w-7" aria-hidden />
        </span>
        <h2 className="font-display text-3xl font-extrabold">{t("title")}</h2>
        <p className="max-w-sm text-sm text-common">
          {t("pitch", { n: MAX_PLAYERS })}
        </p>
        {err && (
          <p
            role="alert"
            className="rounded-full bg-accent/20 px-4 py-1.5 text-sm text-accent"
          >
            {err}
          </p>
        )}
        <div className="flex w-full max-w-sm flex-col gap-2">
          <Option
            icon={Shuffle}
            color={color}
            title={t("match")}
            text={t("matchText")}
            disabled={table.pending}
            onClick={table.match}
          />
          <Option
            icon={Users}
            color={color}
            title={t("open")}
            text={t("openText")}
            disabled={table.pending}
            onClick={table.open}
          />
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (input.trim()) table.join(input);
            }}
          >
            <label className="flex h-12 flex-1 items-center gap-2 rounded-2xl border border-white/15 px-3">
              <Search className="h-4 w-4 text-common" aria-hidden />
              <input
                value={input}
                onChange={(e) =>
                  setInput(e.target.value.toUpperCase().slice(0, 5))
                }
                placeholder={t("codeHint")}
                aria-label={t("code")}
                autoCapitalize="characters"
                className="w-full bg-transparent font-mono text-sm tracking-widest uppercase outline-none"
              />
            </label>
            <button
              type="submit"
              disabled={table.pending || input.trim().length !== 5}
              className="h-12 rounded-2xl px-5 font-bold text-black disabled:opacity-40"
              style={{ background: color }}
            >
              {t("join")}
            </button>
          </form>
        </div>
        <button
          type="button"
          onClick={() => table.setLobby(false)}
          className="flex items-center gap-1 text-sm text-common underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> {t("backSolo")}
        </button>
      </div>
    );

  const seats = table.seats;
  return (
    <div className="flex min-h-[34rem] flex-col items-center justify-center gap-5 p-6 text-center">
      <p className="text-xs font-bold tracking-widest text-common uppercase">
        {t("code")}
      </p>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard
            ?.writeText(table.code!)
            .then(() => setCopied(true));
        }}
        className="flex items-center gap-3 rounded-2xl border border-white/15 px-5 py-3 font-mono text-4xl font-extrabold tracking-[0.3em]"
        aria-label={t("copy")}
      >
        {table.code}
        {copied ? (
          <Check className="h-5 w-5 text-uncommon" aria-hidden />
        ) : (
          <Copy className="h-5 w-5 text-common" aria-hidden />
        )}
      </button>
      <p className="text-xs text-common">{t("share")}</p>
      {err && (
        <p
          role="alert"
          className="rounded-full bg-accent/20 px-4 py-1.5 text-sm text-accent"
        >
          {err}
        </p>
      )}
      <ul className="grid w-full max-w-md grid-cols-2 gap-2">
        {Array.from({ length: MAX_PLAYERS }, (_, i) => seats[i]).map((s, i) =>
          s ? (
            <li
              key={s.id}
              className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-2 text-left"
            >
              <Avatar seat={s} />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                {s.name}
                {s.id === meId && (
                  <span className="text-common"> · {t("you")}</span>
                )}
              </span>
              {s.id === table.host && (
                <Crown
                  className="h-4 w-4 text-legendary"
                  aria-label={t("host")}
                />
              )}
            </li>
          ) : (
            <li
              key={`e${i}`}
              className="flex h-[3.25rem] items-center justify-center rounded-2xl border border-dashed border-white/10 text-xs text-common"
            >
              {t("free")}
            </li>
          ),
        )}
      </ul>
      {table.isHost ? (
        <button
          type="button"
          disabled={table.pending || seats.length < 2}
          onClick={table.begin}
          className="h-12 w-64 rounded-full font-extrabold text-black disabled:opacity-40"
          style={{ background: color }}
        >
          {seats.length < 2 ? t("needTwo") : t("start", { n: seats.length })}
        </button>
      ) : (
        <p className="flex items-center gap-2 text-sm text-common">
          <span
            className="h-3 w-3 animate-ping rounded-full"
            style={{ background: color }}
            aria-hidden
          />{" "}
          {t("waitHost")}
        </p>
      )}
      <button
        type="button"
        onClick={table.leave}
        className="flex items-center gap-1 text-sm text-common underline"
      >
        <LogOut className="h-3.5 w-3.5" aria-hidden /> {t("leave")}
      </button>
    </div>
  );
}

function Option({
  icon: Icon,
  color,
  title,
  text,
  disabled,
  onClick,
}: {
  icon: typeof Users;
  color: string;
  title: string;
  text: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/[0.03] p-3 text-left transition hover:border-white/40 disabled:opacity-50"
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/30"
        style={{ color }}
      >
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block font-display font-bold">{title}</span>
        <span className="block text-xs text-common">{text}</span>
      </span>
    </button>
  );
}

// During and after the game: everyone at the table with their score, the leader crowned;
// a tick for those who have answered the question I'm on.
export function TableScores({
  table,
  meId,
  index,
  final = false,
}: {
  table: TableState;
  meId: string;
  index: number | null;
  final?: boolean;
}) {
  const t = useTranslations("arcade.table");
  const seats = [...table.seats].sort((a, b) => b.score - a.score);
  const top = seats[0]?.score ?? 0;
  return (
    <div
      className={`flex flex-wrap justify-center gap-2 ${final ? "" : "px-3 pt-3"}`}
      aria-label={t("players")}
    >
      {seats.map((s, rank) => {
        const done =
          index !== null &&
          (s.over || s.index > index || (s.index === index && s.answered));
        return (
          <div
            key={s.id}
            className={`flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-xs ${s.id === meId ? "border-white/40 bg-white/10" : "border-white/10 bg-white/[0.03]"}`}
          >
            <Avatar seat={s} size="h-6 w-6" />
            {final && (
              <span className="font-mono font-bold text-common">
                #{rank + 1}
              </span>
            )}
            <span className="max-w-24 truncate font-semibold">{s.name}</span>
            <span className="font-mono font-bold text-legendary">
              {s.score}
            </span>
            {s.score === top && top > 0 && (
              <Crown className="h-3.5 w-3.5 text-legendary" aria-hidden />
            )}
            {!final && done && (
              <Check
                className="h-3.5 w-3.5 text-uncommon"
                aria-label={t("answered")}
              />
            )}
            {final && !s.over && (
              <span className="text-[10px] text-common">
                {t("stillPlaying")}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// At a table, "Next" is not a button: the next question comes once everyone has answered.
export function TableWait({ table }: { table: TableState }) {
  const t = useTranslations("arcade.table");
  return (
    <p
      className="flex h-12 items-center justify-center gap-2 rounded-full border border-white/10 text-sm text-common"
      role="status"
    >
      <span
        className={`h-2.5 w-2.5 rounded-full ${table.ready ? "bg-uncommon" : "animate-pulse bg-white/40"}`}
        aria-hidden
      />
      {table.ready ? t("nextComing") : t("waitOthers")}
    </p>
  );
}

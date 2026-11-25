"use client";

import { useState } from "react";
import { ScanFace } from "lucide-react";
import { useTranslations } from "next-intl";
import type { TablePlayer } from "@/lib/arcade/page";
import { GameShell } from "../GameShell";
import { ResultScreen } from "../ResultScreen";
import { StartScreen } from "../StartScreen";
import { TableLobby, TableScores, TableWait } from "../table/TableParts";
import { useTable } from "../table/useTable";
import { Options, TimerBar } from "./QuizParts";
import { useQuiz } from "./useQuiz";
import { useQuizImages } from "./useQuizImages";

const COLOR = "var(--color-epic)";
const WINDOW = 10_000;

// Who's that?: a character comes into view, zoomed and blurred, over 10 seconds.
export function WhosThat({ best, tickets, me = null }: { best: number | null; tickets: number | null; me?: TablePlayer | null }) {
  const t = useTranslations("arcade");
  const tg = useTranslations("arcade.whosThat");
  const q = useQuiz("whos-that", best, tickets, true);
  const v = q.view;
  const img = useQuizImages(q.run, v, q.askNow);
  const table = useTable("whos-that", me, q);
  const atTable = table.started && v !== null && me !== null;

  const stats = [
    { label: tg("character"), value: v ? `${v.index + 1}/${v.total ?? 10}` : "—" },
    { label: t("score"), value: v?.score ?? 0 },
    { label: t("best"), value: q.best ?? "—" },
  ];

  return (
    <GameShell game="whos-that" icon={ScanFace} color={COLOR} title={tg("name")} tickets={q.tickets} stats={stats} rules={<p>{tg("rules")}</p>}>
      {q.error && (
        <p role="alert" className="absolute inset-x-0 top-3 z-20 mx-auto w-fit rounded-full bg-accent/20 px-4 py-1.5 text-sm text-accent">
          {q.error}
        </p>
      )}
      {!v && !table.lobby && (
        <StartScreen icon={ScanFace} color={COLOR} title={tg("name")} pitch={tg("pitch")} chips={[tg("chip")]} busy={q.pending} onPlay={q.play} onMulti={me ? () => table.setLobby(true) : undefined} />
      )}
      {!v && table.lobby && me && <TableLobby table={table} color={COLOR} meId={me.id} />}
      {v && q.showResult && q.result && (
        <ResultScreen
          icon={ScanFace}
          color={COLOR}
          score={v.score}
          result={q.result}
          share={tg("share", { score: v.score })}
          onAgain={() => {
            table.leave();
            q.play();
          }}
          extra={atTable ? <TableScores table={table} meId={me.id} index={null} final /> : undefined}
        />
      )}
      {v && !q.showResult && atTable && <TableScores table={table} meId={me.id} index={v.index} />}
      {v && !q.showResult && (
        <div className="flex min-h-[34rem] flex-col items-center justify-center gap-6 p-4 sm:flex-row sm:p-8">
          <div className="w-full max-w-sm">
            <Picture key={`${v.index}-${v.askedMsAgo === null}`} src={v.askedMsAgo !== null || v.answered ? img(v.index, 0) : null} leftMs={Math.max(0, WINDOW - (v.askedMsAgo ?? 0))} revealed={v.answered?.cards[0] ?? null} />
            <div className="mt-2">
              <TimerBar view={v} windowMs={WINDOW} color={COLOR} />
            </div>
          </div>
          <div className="flex w-full max-w-xs flex-col gap-3">
            <Options view={v} onPick={q.choose} disabled={q.pending} />
            {v.answered && (
              <p className={`text-sm font-bold ${v.answered.right ? "text-uncommon" : "text-accent"}`}>
                {v.answered.right ? tg("right", { n: v.answered.points }) : tg("wrong")}
              </p>
            )}
            {v.answered && atTable && !v.over && <TableWait table={table} />}
            {v.answered && !(atTable && !v.over) && (
              <button
                type="button"
                disabled={q.pending}
                onClick={() => (v.over ? q.setShowResult(true) : q.next())}
                className="h-12 rounded-full font-extrabold text-white disabled:opacity-50"
                style={{ background: COLOR }}
              >
                {v.over ? tg("seeResult") : tg("next")}
              </button>
            )}
          </div>
        </div>
      )}
    </GameShell>
  );
}

// The character, fetched ahead through the opaque route: blurred and zoomed, clearing
// over what is left of the answer window, then the same picture sharp with its series.
function Picture({ src, leftMs, revealed }: { src: string | null; leftMs: number; revealed: { imageUrl: string; series: string } | null }) {
  const [mounted] = useState(() => Date.now());
  const [left, setLeft] = useState<number | null>(null);
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-white/10 bg-black">
      {revealed ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src ?? revealed.imageUrl} alt="" className="h-full w-full object-cover object-top" />
          <span className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2.5 py-1 text-xs font-semibold text-white">{revealed.series}</span>
        </>
      ) : src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          data-testid="quiz-image"
          src={src}
          alt=""
          onLoad={() => setLeft(Math.max(0, leftMs - (Date.now() - mounted)))}
          className="h-full w-full object-cover object-top"
          style={{
            filter: left !== null ? "blur(0px)" : "blur(22px)",
            transform: left !== null ? "scale(1)" : "scale(2.8)",
            transition: left !== null ? `filter ${left}ms cubic-bezier(.4,0,.2,1), transform ${left}ms cubic-bezier(.3,0,.2,1)` : "none",
          }}
        />
      ) : (
        <span className="absolute inset-0 m-auto h-10 w-10 animate-spin rounded-full border-4 border-white/15 border-t-white/60" aria-hidden />
      )}
    </div>
  );
}

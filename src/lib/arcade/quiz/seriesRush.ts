// Series rush: three characters of one series come into view 4 s apart; name the
// series among four. Only series with at least 3 imaged cards in the pool qualify.
import { shuffle } from "../rng";
import type { ArcadeCard } from "../server";
import type { QuizQuestion } from "./engine";
import { toQuizCard } from "./whosThat";

export function buildSeriesRush(pool: ArcadeCard[], r: () => number, count = 10): QuizQuestion[] {
  const bySeries = new Map<number, ArcadeCard[]>();
  for (const c of pool) bySeries.set(c.seriesId, [...(bySeries.get(c.seriesId) ?? []), c]);
  const titles = [...new Set(pool.map((c) => c.series))];
  const eligible = shuffle(
    [...bySeries.values()].filter((cs) => cs.length >= 3),
    r,
  ).slice(0, count);
  return eligible.map((cs) => {
    // the best-known card last: the hardest clue comes first
    const three = shuffle(cs, r)
      .slice(0, 3)
      .sort((a, b) => b.rank - a.rank);
    const title = cs[0].series;
    const decoys = shuffle(
      titles.filter((t) => t !== title),
      r,
    ).slice(0, 3);
    const options = shuffle([title, ...decoys], r);
    return { cards: three.map(toQuizCard), options, answer: options.indexOf(title), reveal: [0, 4000, 8000] };
  });
}

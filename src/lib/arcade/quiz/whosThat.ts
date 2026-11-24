// Who's that?: 10 well-known characters, each with three decoy names (same gender
// when the pool allows), the answer at a random place.
import { shuffle } from "../rng";
import type { ArcadeCard } from "../server";
import type { QuizCard, QuizQuestion } from "./engine";

export const toQuizCard = (c: ArcadeCard): QuizCard => ({
  id: c.id,
  name: c.name,
  rarity: c.rarity,
  imageUrl: c.imageUrl,
  series: c.series,
  fans: c.fans ?? undefined,
});

export function buildWhosThat(pool: ArcadeCard[], r: () => number, count = 10): QuizQuestion[] {
  // one name per character (two cards can share a name across series)
  const byName = new Map<string, ArcadeCard>();
  for (const c of shuffle(pool, r)) if (!byName.has(c.name)) byName.set(c.name, c);
  const cards = [...byName.values()];
  const picked = cards.slice(0, count);
  return picked.map((c) => {
    const same = cards.filter((d) => d.id !== c.id && d.gender === c.gender);
    const rest = cards.filter((d) => d.id !== c.id && d.gender !== c.gender);
    const decoys = [...shuffle(same, r), ...shuffle(rest, r)].slice(0, 3).map((d) => d.name);
    const options = shuffle([c.name, ...decoys], r);
    return { cards: [toQuizCard(c)], options, answer: options.indexOf(c.name) };
  });
}

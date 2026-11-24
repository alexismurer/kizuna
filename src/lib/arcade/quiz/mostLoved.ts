// Most loved?: two characters of the same rarity, which one has more fans?
// Fans are MyAnimeList favourites; a card without them ranks by popularity.
import { shuffle } from "../rng";
import type { ArcadeCard } from "../server";
import type { QuizQuestion } from "./engine";
import { toQuizCard } from "./whosThat";

const fansOf = (c: ArcadeCard) => c.fans ?? Math.max(0, 100000 - c.rank);

export function buildMostLoved(all: ArcadeCard[], r: () => number, count = 50): QuizQuestion[] {
  // real fan counts only, unless too few cards have one
  const known = all.filter((c) => c.fans !== null);
  const pool = known.length >= 20 ? known : all;
  const byRarity = new Map<string, ArcadeCard[]>();
  for (const c of pool) byRarity.set(c.rarity, [...(byRarity.get(c.rarity) ?? []), c]);
  const groups = [...byRarity.values()].filter((g) => new Set(g.map(fansOf)).size >= 2);
  const out: QuizQuestion[] = [];
  for (let tries = 0; out.length < count && groups.length > 0 && tries < count * 20; tries++) {
    const g = groups[Math.floor(r() * groups.length)];
    const [a, b] = shuffle(g, r);
    if (fansOf(a) === fansOf(b)) continue;
    const cards = [a, b].map((c) => ({ ...toQuizCard(c), fans: fansOf(c) }));
    out.push({ cards, options: cards.map((c) => c.name), answer: cards[0].fans > cards[1].fans ? 0 : 1 });
  }
  return out;
}

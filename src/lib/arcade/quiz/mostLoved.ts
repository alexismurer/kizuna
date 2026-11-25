// Most loved?: two characters of the same rarity, which one has more fans?
// Fans are MyAnimeList favourites; a card without them ranks by popularity.
import { shuffle } from "../rng";
import type { ArcadeCard } from "../server";
import type { QuizQuestion } from "./engine";
import { toQuizCard } from "./whosThat";

// The favourite must clearly win: at least MIN_RATIO times the fans of the other
// (for popularity, a rank that many times better), and a minimum absolute gap.
// If a pool cannot give enough such pairs, a second pass accepts FLOOR_RATIO.
const MIN_RATIO = 2;
const FLOOR_RATIO = 1.6;
const MIN_GAP = 10;

export function buildMostLoved(all: ArcadeCard[], r: () => number, count = 50): QuizQuestion[] {
  // real fan counts only; when too few cards have one, popularity for every card
  // (never a real count against a made-up one)
  const known = all.filter((c) => c.fans !== null);
  const real = known.length >= 20;
  const pool = real ? known : all;
  const fansOf = (c: ArcadeCard) => (real ? c.fans! : Math.max(0, 100000 - c.rank));
  // strength: fans, or the inverse of the popularity rank (rank 1 is the most loved)
  const strength = (c: ArcadeCard) => (real ? c.fans! : 1 / Math.max(1, c.rank));
  const gapOk = (a: ArcadeCard, b: ArcadeCard) =>
    real ? Math.abs(a.fans! - b.fans!) >= MIN_GAP : Math.abs(a.rank - b.rank) >= MIN_GAP;
  const clear = (a: ArcadeCard, b: ArcadeCard, ratio: number) => {
    const hi = Math.max(strength(a), strength(b));
    const lo = Math.min(strength(a), strength(b));
    return gapOk(a, b) && hi > 0 && (lo <= 0 || hi / lo >= ratio);
  };
  const byRarity = new Map<string, ArcadeCard[]>();
  for (const c of pool) byRarity.set(c.rarity, [...(byRarity.get(c.rarity) ?? []), c]);
  const groups = [...byRarity.values()].filter((g) => g.length >= 2);
  const out: QuizQuestion[] = [];
  const used = new Set<number>();
  // pass 1: the full ratio and no card twice; pass 2: the floor ratio, cards may repeat
  for (const [ratio, fresh] of [[MIN_RATIO, true], [FLOOR_RATIO, false]] as const) {
    for (let tries = 0; out.length < count && groups.length > 0 && tries < count * 30; tries++) {
      const g = groups[Math.floor(r() * groups.length)].filter((c) => !fresh || !used.has(c.id));
      if (g.length < 2) continue;
      const a = g[Math.floor(r() * g.length)];
      const partners = g.filter((b) => b.id !== a.id && clear(a, b, ratio));
      if (partners.length === 0) continue;
      const b = partners[Math.floor(r() * partners.length)];
      used.add(a.id).add(b.id);
      const cards = shuffle([a, b], r).map((c) => ({ ...toQuizCard(c), fans: fansOf(c) }));
      out.push({ cards, options: cards.map((c) => c.name), answer: cards[0].fans > cards[1].fans ? 0 : 1 });
    }
  }
  return out;
}

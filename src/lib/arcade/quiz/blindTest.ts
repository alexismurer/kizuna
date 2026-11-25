// Blind test: 10 theme clips of different series; guess the series among 4. The clip
// is played through the game's own route; song and card show once answered.
import type { Rarity } from "@/lib/game/types";
import { shuffle } from "../rng";
import type { Genre } from "../server";
import type { QuizQuestion } from "./engine";

export type BlindClip = {
  path: string;
  kind: "OP" | "ED";
  seq: number;
  song: string;
  artist: string | null;
  year: number | null;
  seriesId: number;
  series: string;
  genre: Genre;
  card: { id: number; name: string; rarity: Rarity; imageUrl: string | null; series: string } | null;
};

export function buildBlind(bank: BlindClip[], r: () => number, count = 10): QuizQuestion[] {
  const titles = [...new Set(bank.map((c) => c.series))];
  const seen = new Set<number>();
  const picked: BlindClip[] = [];
  for (const c of shuffle(bank, r)) {
    if (picked.length === count) break;
    if (seen.has(c.seriesId)) continue;
    seen.add(c.seriesId);
    picked.push(c);
  }
  if (titles.length < 4) return [];
  return picked.map((c) => {
    const decoys = shuffle(titles.filter((t) => t !== c.series), r).slice(0, 3);
    const options = shuffle([c.series, ...decoys], r);
    const card = c.card?.imageUrl ? [{ id: c.card.id, name: c.card.name, rarity: c.card.rarity, imageUrl: c.card.imageUrl, series: c.card.series }] : [];
    return {
      cards: card,
      // the card only shows with the answer
      reveal: card.map(() => Number.MAX_SAFE_INTEGER),
      options,
      answer: options.indexOf(c.series),
      clip: c.path,
      meta: { kind: c.kind, seq: c.seq, song: c.song, artist: c.artist, year: c.year },
    };
  });
}

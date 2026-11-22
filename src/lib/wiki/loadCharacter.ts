import { cache } from "react";
import type { Rarity } from "@/lib/game/types";
import { loadStatus } from "@/lib/supabase/boosters";
import { catalogTotal } from "@/lib/supabase/catalogTotal";
import { createServerClient } from "@/lib/supabase/server";
import { loadCardOdds, type PackOdds } from "./odds";

export type MarketStats = {
  median7: number | null;
  median30: number | null;
  sales30: number;
  listings: number;
  cheapest: number | null;
  auctions: number;
};

export type Point = { day: string; median: number; sales: number };

export type Character = {
  card: {
    id: number;
    sourceId: number;
    number: number;
    name: string;
    nativeName: string | null;
    imageUrl: string | null;
    seriesId: number;
    seriesTitle: string;
    rarity: Rarity;
    pow: number;
    aura: number;
    favourites: number | null;
    popularityRank: number;
    gender: string | null;
    age: string | null;
    voiceActor: string | null;
  };
  total: number;
  owned: { count: number; locked: number; protected: boolean; firstAt: string | null } | null;
  wished: boolean;
  appearances: { mediaType: "ANIME" | "MANGA"; title: string }[];
  stats: MarketStats;
  value: number | null;
  history30: Point[];
  history7: Point[];
  latest: { price: number; sold_at: string }[];
  cheapestListingId: number | null;
  odds: PackOdds[];
  sameUniverse: { sourceId: number; name: string; imageUrl: string | null; rarity: Rarity; owned: boolean }[];
  currency: number;
};

type CardRow = {
  id: number;
  source_id: number;
  number: number;
  name: string;
  native_name: string | null;
  image_url: string | null;
  series_id: number;
  rarity: Rarity;
  pow: number;
  aura: number;
  favourites: number | null;
  popularity_rank: number;
  gender: string | null;
  age: string | null;
  voice_actor: string | null;
  series: { title: string } | null;
};
type InvRow = { count: number; locked: number; protected: boolean; first_at: string | null };
type SameRow = { id: number; source_id: number; name: string; image_url: string | null; rarity: Rarity };

const EMPTY_STATS: MarketStats = {
  median7: null,
  median30: null,
  sales30: 0,
  listings: 0,
  cheapest: null,
  auctions: 0,
};

// The card behind a wiki id; cached so the page and its metadata share one query per request.
export const findCard = cache(async (sourceId: number): Promise<CardRow | null> => {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("cards")
    .select(
      "id, source_id, number, name, native_name, image_url, series_id, rarity, pow, aura, favourites, popularity_rank, gender, age, voice_actor, series(title)",
    )
    .eq("source_id", sourceId)
    .order("source")
    .limit(1)
    .maybeSingle();
  return (data as unknown as CardRow | null) ?? null;
});

// Everything the wiki page shows for one character (by AniList id), as the signed-in player sees it.
export async function loadCharacter(sourceId: number): Promise<Character | null> {
  const c = await findCard(sourceId);
  if (!c) return null;
  const supabase = await createServerClient();

  const ownedPart = supabase
    .from("inventory")
    .select("count, locked, protected, first_at")
    .eq("card_id", c.id)
    .maybeSingle()
    .then(async ({ data: inv }) => {
      if (!inv) return { owned: null, appearances: [] };
      const row = inv as InvRow;
      // appearances are part of the unlocked page only
      const { data: apps } = await supabase
        .from("card_appearances")
        .select("media_type, title")
        .eq("card_id", c.id)
        .order("position");
      return {
        owned: { count: row.count, locked: row.locked, protected: row.protected, firstAt: row.first_at },
        appearances: ((apps ?? []) as { media_type: "ANIME" | "MANGA"; title: string }[]).map((a) => ({
          mediaType: a.media_type,
          title: a.title,
        })),
      };
    });

  const samePart = supabase
    .from("cards")
    .select("id, source_id, name, image_url, rarity")
    .eq("series_id", c.series_id)
    .neq("id", c.id)
    .order("rarity", { ascending: false })
    .order("number")
    .limit(6)
    .then(async ({ data: rows }) => {
      const list = (rows ?? []) as SameRow[];
      if (!list.length) return [];
      const { data: mine } = await supabase
        .from("inventory")
        .select("card_id")
        .in(
          "card_id",
          list.map((r) => r.id),
        );
      const have = new Set(((mine ?? []) as { card_id: number }[]).map((r) => r.card_id));
      return list.map((r) => ({
        sourceId: r.source_id,
        name: r.name,
        imageUrl: r.image_url,
        rarity: r.rarity,
        owned: have.has(r.id),
      }));
    });

  const [mine, sameUniverse, wish, total, status, stats, value, h30, h7, latest, cheapest, odds] =
    await Promise.all([
      ownedPart,
      samePart,
      supabase.from("wishlist").select("card_id").eq("card_id", c.id).maybeSingle(),
      catalogTotal(supabase),
      loadStatus(),
      supabase.rpc("card_market_stats", { p_card_id: c.id }),
      supabase.rpc("card_value", { p_card_id: c.id }),
      supabase.rpc("card_sales_history", { p_card_id: c.id, p_days: 30 }),
      supabase.rpc("card_sales_history", { p_card_id: c.id, p_days: 7 }),
      supabase
        .from("market_sales")
        .select("price, sold_at")
        .eq("card_id", c.id)
        .order("sold_at", { ascending: false })
        .limit(10),
      supabase
        .from("listings")
        .select("id")
        .eq("card_id", c.id)
        .eq("status", "open")
        .order("price")
        .order("id")
        .limit(1)
        .maybeSingle(),
      loadCardOdds(supabase, { id: c.id, rarity: c.rarity }),
    ]);

  return {
    card: {
      id: c.id,
      sourceId: c.source_id,
      number: c.number,
      name: c.name,
      nativeName: c.native_name,
      imageUrl: c.image_url,
      seriesId: c.series_id,
      seriesTitle: c.series?.title ?? "",
      rarity: c.rarity,
      pow: c.pow,
      aura: c.aura,
      favourites: c.favourites,
      popularityRank: c.popularity_rank,
      // private fields stay off the locked page
      gender: mine.owned ? c.gender : null,
      age: mine.owned ? c.age : null,
      voiceActor: mine.owned ? c.voice_actor : null,
    },
    total,
    owned: mine.owned,
    wished: wish.data !== null,
    appearances: mine.appearances,
    stats: (stats.data as MarketStats | null) ?? EMPTY_STATS,
    value: (value.data as number | null) ?? null,
    history30: (h30.data ?? []) as Point[],
    history7: (h7.data ?? []) as Point[],
    latest: (latest.data ?? []) as { price: number; sold_at: string }[],
    cheapestListingId: (cheapest.data as { id: number } | null)?.id ?? null,
    odds,
    sameUniverse,
    currency: status?.currency ?? 0,
  };
}

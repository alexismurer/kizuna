"use server";

import {
  currentSeason,
  matchSuggestions,
  seasonSlug,
  type AnimeSeason,
  type CatalogSeries,
  type Suggestion,
} from "@/lib/game/seasonSuggest";
import type { Rarity } from "@/lib/game/types";
import type { AwakeningEffect } from "@/lib/rebirth/types";
import { fetchAll } from "@/lib/supabase/fetchAll";
import { createServerClient } from "@/lib/supabase/server";

export type AdminResult<T> = { ok: true; data: T } | { ok: false; error: string };

export type AdminInvite = { code: string; createdAt: string; usedBy: string | null; usedAt: string | null };
export type AdminChatMessage = { id: number; room: string; author: string; body: string; createdAt: string };
export type StaffRole = "player" | "moderator" | "admin";
export type AdminPlayer = {
  id: string;
  username: string;
  avatarUrl: string | null;
  role: StaffRole;
  bannedAt: string | null;
  joinedAt: string;
  lastSeenAt: string | null;
  currency: number;
  uniqueCards: number;
  totalCards: number;
  boostersOpened: number;
  streak: number;
  logins: number;
  invited: number;
  invitedRewarded: number;
  referredBy: string | null;
  // from migration 0069; absent until it is applied
  bonusBoosters?: number;
  tickets?: number;
  ticketsToday?: number;
  ticketsWeek?: number;
  ticketsEarned?: number;
  goldenNext?: boolean;
  goldenLeft?: number;
  titleId?: string | null;
  frameId?: string | null;
  // from migration 0080
  rebirthTier?: number;
  cycleOpened?: number;
  renownBanked?: number;
  cardPoints?: number;
  renown?: number;
  uniqueMythics?: number;
  awakeningCopies?: number;
  rebirthAt?: string | null;
};
export type AdminPlayers = {
  catalogSize: number;
  totals: { players: number; active24h: number; active7d: number; new7d: number; referred: number; boostersOpened: number };
  players: AdminPlayer[];
};

// Every staff RPC checks is_admin() / is_staff() itself; the RPC's exception message is the error code.
async function call<T>(fn: string, args?: Record<string, unknown>): Promise<AdminResult<T>> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as T };
}

export async function adminCreateInvites(count: number) {
  return call<string[]>("admin_create_invites", { p_count: count });
}
export async function adminInvites() {
  return call<AdminInvite[]>("admin_invites");
}
export async function adminRevokeInvite(code: string) {
  return call<null>("admin_revoke_invite", { p_code: code });
}
// admins only (the RPCs check): edit a player, change their role, ban or unban
export async function adminUpdatePlayer(id: string, username: string, currency: number, streak: number) {
  return call<null>("admin_update_player", { p_id: id, p_username: username, p_currency: currency, p_streak: streak });
}
export type CosmeticKind = "title" | "frame" | "banner" | "name";
export type AdminPlayerExtras = {
  packs: Record<string, number>;
  cosmetics: string[];
  bannerId: string | null;
  nameId: string | null;
  packTypes: { id: string; kind: string; title: string | null }[];
  allCosmetics: { id: string; kind: CosmeticKind }[];
};
export type AdminPlayerMore = {
  logins: number;
  tickets: number;
  goldenNext: boolean;
  goldenLeft: number;
  packs: Record<string, number>;
  cosmetics: string[];
  equipped: Record<CosmeticKind, string | null>;
  rebirthTier: number;
  cycleOpened: number;
  renownBanked: number;
};
export async function adminPlayerExtras(id: string) {
  return call<AdminPlayerExtras>("admin_player_extras", { p_id: id });
}
export async function adminUpdatePlayerMore(id: string, v: AdminPlayerMore) {
  return call<null>("admin_update_player_more", {
    p_id: id,
    p_logins: v.logins,
    p_tickets: v.tickets,
    p_golden_next: v.goldenNext,
    p_golden_left: v.goldenLeft,
    p_packs: v.packs,
    p_cosmetics: v.cosmetics,
    p_title: v.equipped.title,
    p_frame: v.equipped.frame,
    p_banner: v.equipped.banner,
    p_name: v.equipped.name,
    p_rebirth_tier: v.rebirthTier,
    p_cycle_opened: v.cycleOpened,
    p_renown_banked: v.renownBanked,
  });
}
export async function adminSetRole(id: string, role: StaffRole) {
  return call<null>("admin_set_role", { p_id: id, p_role: role });
}
export async function adminSetBan(id: string, banned: boolean) {
  return call<null>("admin_set_ban", { p_id: id, p_banned: banned });
}
export async function adminGrantCurrency(username: string, amount: number, note: string | null) {
  return call<number>("admin_grant_currency", { p_username: username, p_amount: amount, p_note: note });
}
export type AdminPlayerHit = { username: string; avatarUrl: string | null };
export type AdminCardHit = {
  id: number;
  number: number;
  name: string;
  imageUrl: string | null;
  rarity: Rarity;
  seriesTitle: string;
};

export async function adminPlayerSearch(query: string) {
  return call<AdminPlayerHit[]>("admin_player_search", { p_query: query });
}
export async function adminCardSearch(query: string) {
  return call<AdminCardHit[]>("admin_card_search", { p_query: query });
}
export async function adminGrantCard(username: string, cardId: number, count: number, note: string | null) {
  return call<number>("admin_grant_card", { p_username: username, p_card_id: cardId, p_count: count, p_note: note });
}
export async function adminChatRecent() {
  return call<AdminChatMessage[]>("admin_chat_recent");
}
export async function adminDeleteChat(id: number) {
  return call<null>("admin_delete_chat", { p_id: id });
}

export type AdminSeries = { id: number; title: string };
export type AdminPool = { id: number; name: string; seriesIds: number[]; series: AdminSeries[] };
export type AdminSeriesHit = AdminSeries & { cards: number };
export type AdminSeasonal = { id: string; title: string; seriesIds: number[]; startsAt: string; endsAt: string };

export async function adminPools() {
  return call<AdminPool[]>("admin_pools");
}
export async function adminSavePool(id: number | null, name: string, seriesIds: number[]) {
  return call<number>("admin_save_pool", { p_id: id, p_name: name, p_series_ids: seriesIds });
}
export async function adminDeletePool(id: number) {
  return call<null>("admin_delete_pool", { p_id: id });
}
export async function adminSeriesSearch(query: string) {
  return call<AdminSeriesHit[]>("admin_series_search", { p_query: query });
}
export async function adminSeasonals() {
  return call<AdminSeasonal[]>("admin_seasonals");
}
export async function adminSaveSeasonal(slug: string, title: string, seriesIds: number[], startsAt: string, endsAt: string) {
  return call<string>("admin_save_seasonal", {
    p_slug: slug,
    p_title: title,
    p_series_ids: seriesIds,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
  });
}
export async function adminEndSeasonal(id: string) {
  return call<null>("admin_end_seasonal", { p_id: id });
}

// Seasonal suggestions: this season's most popular anime on AniList (the catalog's source),
// matched to our series through their franchise root.
const ANILIST = "https://graphql.anilist.co";
type AniMedia = {
  id: number;
  title: { romaji: string | null; english: string | null };
  coverImage: { medium: string | null } | null;
  popularity: number | null;
  relations: { edges: { relationType: string; node: { id: number } }[] };
};
const UP = new Set(["PREQUEL", "PARENT"]);
const MEDIA_FIELDS = "id title { romaji english } coverImage { medium } popularity relations { edges { relationType node { id } } }";

async function anilist<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(ANILIST, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`anilist ${res.status}`);
  const json = (await res.json()) as { data: T };
  return json.data;
}

export type SeasonalSuggestions = {
  season: AnimeSeason;
  year: number;
  slug: string;
  startsAt: string;
  endsAt: string;
  items: Suggestion[];
};

export async function adminSeasonalSuggestions(): Promise<AdminResult<SeasonalSuggestions>> {
  const supabase = await createServerClient();
  const { data: admin } = await supabase.rpc("is_admin");
  if (admin !== true) return { ok: false, error: "not_admin" };

  const { season, year, startsAt, endsAt } = currentSeason(new Date());
  let airing: AniMedia[];
  const ups = new Map<number, number[]>();
  try {
    const page = await anilist<{ Page: { media: AniMedia[] } }>(
      `query ($season: MediaSeason, $year: Int) { Page(perPage: 30) { media(type: ANIME, season: $season, seasonYear: $year, isAdult: false, sort: POPULARITY_DESC) { ${MEDIA_FIELDS} } } }`,
      { season, year },
    );
    airing = page.Page.media;
    // walk prequels/parents up to each franchise root, one batched request per level
    let level = airing;
    for (let round = 0; round < 8 && level.length > 0; round++) {
      const next = new Set<number>();
      for (const m of level) {
        const u = m.relations.edges.filter((e) => UP.has(e.relationType)).map((e) => e.node.id);
        ups.set(m.id, u);
        if (u.length > 0) {
          const pick = Math.min(...u);
          if (!ups.has(pick)) next.add(pick);
        }
      }
      if (next.size === 0) break;
      const r = await anilist<{ Page: { media: AniMedia[] } }>(
        `query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids) { ${MEDIA_FIELDS} } } }`,
        { ids: [...next].slice(0, 50) },
      );
      level = r.Page.media;
    }
  } catch {
    return { ok: false, error: "suggest_failed" };
  }

  const ids = [...new Set([...ups.values()].flat().concat([...ups.keys()]))];
  const { data: rows } = await supabase
    .from("series")
    .select("id, title, source_id")
    .eq("source", "anilist")
    .in("source_id", ids);
  const seriesIds = (rows ?? []).map((r) => r.id as number);
  const counts = new Map<number, number>();
  if (seriesIds.length > 0) {
    const cards = await fetchAll<{ series_id: number }>((from, to) =>
      supabase.from("cards").select("series_id").in("series_id", seriesIds).order("id").range(from, to),
    );
    for (const c of cards) counts.set(c.series_id, (counts.get(c.series_id) ?? 0) + 1);
  }
  const series: CatalogSeries[] = (rows ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    sourceId: r.source_id,
    cards: counts.get(r.id) ?? 0,
  }));
  const items = matchSuggestions(
    airing.map((m) => ({
      id: m.id,
      title: m.title.english ?? m.title.romaji ?? `#${m.id}`,
      cover: m.coverImage?.medium ?? null,
      popularity: m.popularity ?? 0,
    })),
    ups,
    series,
  );
  return {
    ok: true,
    data: { season, year, slug: seasonSlug(season, year), startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), items },
  };
}

export type AdminAwakening = {
  id: string;
  baseCardId: number;
  baseName: string;
  baseImage: string | null;
  title: string;
  form: string;
  effect: AwakeningEffect;
  accent: string;
  total: number;
  sort: number;
  active: boolean;
  issued: number;
  loopUrl: string | null;
  posterUrl: string | null;
  revealUrl: string | null;
};
export type AdminAwakeningInput = Omit<AdminAwakening, "baseName" | "baseImage" | "issued">;

export async function adminAwakenings() {
  return call<AdminAwakening[]>("admin_awakenings");
}
export async function adminSaveAwakening(v: AdminAwakeningInput) {
  return call<string>("admin_save_awakening", {
    p_id: v.id,
    p_base_card_id: v.baseCardId,
    p_title: v.title,
    p_form: v.form,
    p_effect: v.effect,
    p_accent: v.accent,
    p_total: v.total,
    p_sort: v.sort,
    p_active: v.active,
    p_loop_url: v.loopUrl ?? "",
    p_poster_url: v.posterUrl ?? "",
    p_reveal_url: v.revealUrl ?? "",
  });
}
export async function adminDeleteAwakening(id: string) {
  return call<null>("admin_delete_awakening", { p_id: id });
}

// This week's weekly and secret boss. A null secret card / health means "automatic"
// (a random Mythic with 3x the weekly health when it appears).
export type AdminBossSide = { card: AdminCardHit | null; hp: number | null; damage: number; defeatedAt: string | null; claims: number };
export type AdminBoss = {
  weekStart: string;
  autoHp: number;
  weekly: AdminBossSide & { card: AdminCardHit; hp: number };
  secret: AdminBossSide & { appearedAt: string | null };
};

export async function adminBoss() {
  return call<AdminBoss>("admin_boss");
}
export async function adminSaveBoss(kind: "weekly" | "secret", cardId: number | null, hp: number | null, damage: number) {
  return call<AdminBoss>("admin_save_boss", { p_kind: kind, p_card_id: cardId, p_hp: hp, p_damage: damage });
}

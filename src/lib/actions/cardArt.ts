"use server";

import type { Rarity } from "@/lib/game/types";
import { fetchPictures, searchCharacters, type MalMatch } from "@/lib/mal/pictures";
import { createServerClient } from "@/lib/supabase/server";
import type { AdminResult } from "./admin";

export type ArtCardFilter = "todo" | "unlinked" | "reviewed" | "all";
export type ArtCandidateFilter = "new" | "proposed" | "accepted" | "rejected";

export type ArtCard = {
  id: number;
  number: number;
  name: string;
  rarity: Rarity;
  imageUrl: string | null;
  seriesTitle: string;
  malId: number | null;
  pictures: string[] | null;
  originalUrl: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
};

export type ArtCandidate = {
  malId: number;
  name: string;
  nativeName: string | null;
  gender: string | null;
  favorites: number;
  seriesTitle: string;
  newSeries: boolean;
  rarity: Rarity;
  defaultUrl: string | null;
  pictures: string[] | null;
  status: ArtCandidateFilter;
  imageUrl: string | null;
  proposedBy: string | null;
  decidedBy: string | null;
  cardNumber: number | null;
};

export type ArtPage<T> = { total: number; rows: T[] };

// every RPC checks the staff role itself; its exception message is the error code
async function call<T>(fn: string, args?: Record<string, unknown>): Promise<AdminResult<T>> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as T };
}

export async function artCards(filter: ArtCardFilter, query: string, offset: number) {
  return call<ArtPage<ArtCard>>("art_cards", { p_filter: filter, p_query: query, p_offset: offset });
}
export async function artCandidates(filter: ArtCandidateFilter, query: string, offset: number) {
  return call<ArtPage<ArtCandidate>>("art_candidates", { p_filter: filter, p_query: query, p_offset: offset });
}
export async function artSetImage(cardId: number, url: string | null) {
  return call<null>("art_set_image", { p_card: cardId, p_url: url });
}
export async function artPropose(malId: number, url: string) {
  return call<null>("art_propose", { p_mal_id: malId, p_url: url });
}
export async function artReject(malId: number) {
  return call<null>("art_reject", { p_mal_id: malId });
}
export async function artAccept(malId: number, url: string) {
  return call<number>("art_accept", { p_mal_id: malId, p_url: url });
}

async function isStaff() {
  const supabase = await createServerClient();
  const { data } = await supabase.rpc("my_role");
  return data === "admin" || data === "moderator";
}

async function gallery(malId: number): Promise<string[] | null> {
  try {
    return await fetchPictures(malId);
  } catch {
    return null;
  }
}

// fetches a gallery the sync has not reached yet and stores it
export async function artLoadGallery(malId: number): Promise<AdminResult<string[]>> {
  if (!(await isStaff())) return { ok: false, error: "not_admin" };
  const pictures = await gallery(malId);
  if (!pictures) return { ok: false, error: "gallery_failed" };
  const r = await call<null>("art_save_pictures", { p_mal_id: malId, p_pictures: pictures });
  return r.ok ? { ok: true, data: pictures } : r;
}

// MAL characters matching a name, for cards the sync could not match
export async function artSearchMal(query: string): Promise<AdminResult<MalMatch[]>> {
  if (!(await isStaff())) return { ok: false, error: "not_admin" };
  const q = query.trim();
  if (q.length < 2) return { ok: true, data: [] };
  try {
    return { ok: true, data: await searchCharacters(q.slice(0, 100)) };
  } catch {
    return { ok: false, error: "mal_search_failed" };
  }
}

// "https://myanimelist.net/character/40/Luffy_Monkey_D" or "40"
export async function artLinkCard(cardId: number, malRef: string): Promise<AdminResult<{ malId: number; pictures: string[] }>> {
  if (!(await isStaff())) return { ok: false, error: "not_admin" };
  const m = malRef.trim().match(/^(?:https?:\/\/(?:www\.)?myanimelist\.net\/character\/)?(\d+)(?:[/?#].*)?$/);
  if (!m) return { ok: false, error: "invalid_value" };
  const malId = Number(m[1]);
  const pictures = await gallery(malId);
  if (!pictures) return { ok: false, error: "gallery_failed" };
  const r = await call<null>("art_link", { p_card: cardId, p_mal_id: malId, p_pictures: pictures });
  return r.ok ? { ok: true, data: { malId, pictures } } : r;
}

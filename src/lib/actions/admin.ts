"use server";

import { createServerClient } from "@/lib/supabase/server";

export type AdminResult<T> = { ok: true; data: T } | { ok: false; error: string };

export type AdminInvite = { code: string; createdAt: string; usedBy: string | null; usedAt: string | null };
export type AdminChatMessage = { id: number; room: string; author: string; body: string; createdAt: string };

// Every admin RPC checks is_admin() itself; the RPC's exception message is the error code.
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
export async function adminGrantCurrency(username: string, amount: number, note: string | null) {
  return call<number>("admin_grant_currency", { p_username: username, p_amount: amount, p_note: note });
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

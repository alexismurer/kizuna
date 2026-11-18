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

export const adminCreateInvites = (count: number) => call<string[]>("admin_create_invites", { p_count: count });
export const adminInvites = () => call<AdminInvite[]>("admin_invites");
export const adminRevokeInvite = (code: string) => call<null>("admin_revoke_invite", { p_code: code });
export const adminGrantCurrency = (username: string, amount: number, note: string | null) =>
  call<number>("admin_grant_currency", { p_username: username, p_amount: amount, p_note: note });
export const adminChatRecent = () => call<AdminChatMessage[]>("admin_chat_recent");
export const adminDeleteChat = (id: number) => call<null>("admin_delete_chat", { p_id: id });

export type AdminSeries = { id: number; title: string };
export type AdminPool = { id: number; name: string; seriesIds: number[]; series: AdminSeries[] };
export type AdminSeriesHit = AdminSeries & { cards: number };
export type AdminSeasonal = { id: string; title: string; seriesIds: number[]; startsAt: string; endsAt: string };

export const adminPools = () => call<AdminPool[]>("admin_pools");
export const adminSavePool = (id: number | null, name: string, seriesIds: number[]) =>
  call<number>("admin_save_pool", { p_id: id, p_name: name, p_series_ids: seriesIds });
export const adminDeletePool = (id: number) => call<null>("admin_delete_pool", { p_id: id });
export const adminSeriesSearch = (query: string) => call<AdminSeriesHit[]>("admin_series_search", { p_query: query });
export const adminSeasonals = () => call<AdminSeasonal[]>("admin_seasonals");
export const adminSaveSeasonal = (slug: string, title: string, seriesIds: number[], startsAt: string, endsAt: string) =>
  call<string>("admin_save_seasonal", {
    p_slug: slug,
    p_title: title,
    p_series_ids: seriesIds,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
  });
export const adminEndSeasonal = (id: string) => call<null>("admin_end_seasonal", { p_id: id });

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

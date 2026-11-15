import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
export const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

export type TestClient = SupabaseClient

export function randomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export async function newInvite(): Promise<string> {
  const code = randomCode()
  const { error } = await admin.from('invite_codes').insert({ code })
  if (error) throw error
  return code
}

export async function signedInClient(): Promise<{ userId: string; client: SupabaseClient }> {
  const rand = Math.random().toString(36).slice(2, 10)
  const email = `p-${Date.now()}-${rand}@test.local`
  const password = 'test-password-123'
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (created.error) throw created.error
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const signIn = await client.auth.signInWithPassword({ email, password })
  if (signIn.error) throw signIn.error
  return { userId: created.data.user.id, client }
}

export async function setPlayer(userId: string, patch: Record<string, unknown>) {
  const { error } = await admin.from('players').update(patch).eq('id', userId)
  if (error) throw error
}

export async function newPlayer(
  opts: { freeStock?: number; currency?: number; pity?: number; standardOpened?: number } = {},
): Promise<{ userId: string; client: SupabaseClient }> {
  const { userId, client } = await signedInClient()
  const code = await newInvite()
  const username = `u${Math.random().toString(36).slice(2, 12)}`
  const { error } = await client.rpc('redeem_invite', { p_code: code, p_username: username })
  if (error) throw error
  const patch: Record<string, unknown> = {}
  if (opts.freeStock !== undefined) patch.free_stock = opts.freeStock
  if (opts.currency !== undefined) patch.currency = opts.currency
  if (opts.pity !== undefined) patch.pity = opts.pity
  if (opts.standardOpened !== undefined) patch.standard_opened = opts.standardOpened
  if (Object.keys(patch).length) await setPlayer(userId, patch)
  return { userId, client }
}

export async function inventoryOf(userId: string): Promise<Map<number, { count: number; locked: number }>> {
  const { data, error } = await admin.from('inventory').select('card_id, count, locked').eq('player_id', userId)
  if (error) throw error
  return new Map(data!.map((r) => [r.card_id as number, { count: r.count as number, locked: r.locked as number }]))
}

export async function giveCards(userId: string, cardId: number, count: number) {
  const { error } = await admin
    .from('inventory')
    .upsert({ player_id: userId, card_id: cardId, count }, { onConflict: 'player_id,card_id' })
  if (error) throw error
}

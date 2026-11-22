import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { admin, anonKey, url } from './helpers'

describe('catalog schema', () => {
  it('seeds 120 cards with the percentile rarity layout', async () => {
    const { data, error } = await admin.from('cards').select('rarity')
    expect(error).toBeNull()
    expect(data).toHaveLength(120)
    const counts: Record<string, number> = {}
    for (const c of data!) counts[c.rarity] = (counts[c.rarity] ?? 0) + 1
    expect(counts).toEqual({ mythic: 4, legendary: 8, epic: 18, rare: 30, uncommon: 30, common: 30 })
  })

  it('seeds 16 pack types', async () => {
    const { count, error } = await admin.from('pack_types').select('*', { count: 'exact', head: true }).neq('kind', 'seasonal')
    expect(error).toBeNull()
    expect(count).toBe(16)
  })

  it('rejects card inserts from an authenticated client', async () => {
    const email = `catalog-${Date.now()}@test.local`
    const password = 'test-password-123'
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    expect(created.error).toBeNull()
    const client = createClient(url, anonKey, { auth: { persistSession: false } })
    const signIn = await client.auth.signInWithPassword({ email, password })
    expect(signIn.error).toBeNull()
    const { error } = await client.from('cards').insert({
      number: 999, name: 'x', series_id: 1, popularity_rank: 999, rarity: 'common', pow: 1, aura: 1,
    })
    expect(error).not.toBeNull()
    await admin.auth.admin.deleteUser(created.data.user!.id)
  })
})

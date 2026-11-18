import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { admin, anonKey, url } from './helpers'

const anon = () => createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })

describe('login_showcase', () => {
  it('gives logged-out visitors the three best cards with art, and the catalog size', async () => {
    const { data, error } = await anon().rpc('login_showcase')
    expect(error).toBeNull()
    const res = data as { total: number; cards: Record<string, unknown>[] }
    const { count } = await admin.from('cards').select('id', { count: 'exact', head: true })
    expect(res.total).toBe(count)
    expect(res.cards).toHaveLength(3)
    for (const c of res.cards) {
      expect(Object.keys(c).sort()).toEqual(
        ['aura', 'imageUrl', 'name', 'nativeName', 'number', 'pow', 'rarity', 'seriesTitle'].sort(),
      )
      expect(c.imageUrl).toBeTruthy()
    }
    const order = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic']
    const { data: best } = await admin.from('cards').select('rarity').not('image_url', 'is', null)
      .order('rarity', { ascending: false }).limit(1).single()
    expect(order.indexOf(res.cards[0].rarity as string)).toBe(order.indexOf(best!.rarity))
  })

  it('logged-out visitors still cannot read the cards table', async () => {
    const { data } = await anon().from('cards').select('id').limit(1)
    expect(data ?? []).toHaveLength(0)
  })
})

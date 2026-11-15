import { describe, it, expect } from 'vitest'
import { admin, newPlayer, inventoryOf, giveCards } from './helpers'

type Row = { pack_index: number; slot: number; card_id: number; rarity: string; is_new: boolean }

async function player(userId: string) {
  const { data, error } = await admin.from('players').select('*').eq('id', userId).single()
  if (error) throw error
  return data
}

describe('paid fallback', () => {
  it('charges 150 for a mix pack when stock is empty', async () => {
    const { userId, client } = await newPlayer({ freeStock: 0, currency: 150, standardOpened: 0 })
    const { data, error } = await client.rpc('open_pack', { p_pack: 'mix' })
    expect(error).toBeNull()
    expect(data).toHaveLength(5)
    const p = await player(userId)
    expect(p.currency).toBe(0)
    expect(p.standard_opened).toBe(1)
    const { data: led } = await admin.from('ledger').select('currency_delta').eq('player_id', userId).neq('currency_delta', 0)
    expect(led).toEqual([{ currency_delta: -150 }])
  })

  it('rejects with insufficient_currency when short', async () => {
    const { userId, client } = await newPlayer({ freeStock: 0, currency: 149 })
    const { error } = await client.rpc('open_pack', { p_pack: 'mix' })
    expect(error?.message).toContain('insufficient_currency')
    expect((await player(userId)).currency).toBe(149)
  })

  it('leaves shop packs unaffected', async () => {
    const { userId, client } = await newPlayer({ freeStock: 0, currency: 750 })
    const { error } = await client.rpc('open_pack', { p_pack: 'hall_of_fame' })
    expect(error).toBeNull()
    expect((await player(userId)).currency).toBe(0)
  })
})

describe('open_packs', () => {
  it('opens 5 packs using stock then currency', async () => {
    const { userId, client } = await newPlayer({ freeStock: 2, currency: 450 })
    const { data, error } = await client.rpc('open_packs', { p_pack: 'mix', p_count: 5 })
    expect(error).toBeNull()
    const rows = data as Row[]
    expect(rows).toHaveLength(25)
    expect([...new Set(rows.map((r) => r.pack_index))]).toEqual([1, 2, 3, 4, 5])
    const p = await player(userId)
    expect(p.free_stock).toBe(0)
    expect(p.currency).toBe(0)
  })

  it('rolls everything back when currency runs short', async () => {
    const { userId, client } = await newPlayer({ freeStock: 2, currency: 300 })
    const { error } = await client.rpc('open_packs', { p_pack: 'shonen', p_count: 5 })
    expect(error?.message).toContain('insufficient_currency')
    const p = await player(userId)
    expect(p.free_stock).toBe(2)
    expect(p.currency).toBe(300)
    expect((await inventoryOf(userId)).size).toBe(0)
  })

  it('rejects invalid counts', async () => {
    const { client } = await newPlayer()
    for (const n of [0, 11]) {
      const { error } = await client.rpc('open_packs', { p_pack: 'mix', p_count: n })
      expect(error?.message).toContain('invalid_count')
    }
    const { error } = await client.rpc('open_packs', { p_pack: 'daily', p_count: 2 })
    expect(error?.message).toContain('invalid_count')
  })

  it('computes is_new against inventory before the whole call', async () => {
    const { userId, client } = await newPlayer({ freeStock: 10 })
    const { data: all } = await admin.from('cards').select('id').limit(120)
    for (const c of all!.slice(0, 60)) await giveCards(userId, c.id as number, 1)
    const owned = new Set(all!.slice(0, 60).map((c) => c.id as number))
    const { data, error } = await client.rpc('open_packs', { p_pack: 'mix', p_count: 10 })
    expect(error).toBeNull()
    for (const r of data as Row[]) expect(r.is_new).toBe(!owned.has(r.card_id))
  })
})

describe('open_packs max cost', () => {
  it('opens when the stock covers everything and max cost is 0', async () => {
    const { userId, client } = await newPlayer({ freeStock: 5, currency: 1000 })
    const { error } = await client.rpc('open_packs', { p_pack: 'mix', p_count: 5, p_max_cost: 0 })
    expect(error).toBeNull()
    expect((await player(userId)).currency).toBe(1000)
  })

  it('rejects with cost_changed and spends nothing when the cost exceeds the ceiling', async () => {
    const { userId, client } = await newPlayer({ freeStock: 2, currency: 1000 })
    const { error } = await client.rpc('open_packs', { p_pack: 'mix', p_count: 5, p_max_cost: 0 })
    expect(error?.message).toContain('cost_changed')
    const p = await player(userId)
    expect(p.free_stock).toBe(2)
    expect(p.currency).toBe(1000)
    expect((await inventoryOf(userId)).size).toBe(0)
  })

  it('opens when the cost equals the ceiling', async () => {
    const { userId, client } = await newPlayer({ freeStock: 2, currency: 1000 })
    const { error } = await client.rpc('open_packs', { p_pack: 'mix', p_count: 5, p_max_cost: 450 })
    expect(error).toBeNull()
    expect((await player(userId)).currency).toBe(550)
  })

  it('keeps the old behaviour without a ceiling', async () => {
    const { userId, client } = await newPlayer({ freeStock: 2, currency: 1000 })
    const { error } = await client.rpc('open_packs', { p_pack: 'mix', p_count: 5, p_max_cost: null })
    expect(error).toBeNull()
    expect((await player(userId)).currency).toBe(550)
  })

  it('applies to shop packs', async () => {
    const { userId, client } = await newPlayer({ freeStock: 5, currency: 750 })
    const { error } = await client.rpc('open_packs', { p_pack: 'hall_of_fame', p_count: 1, p_max_cost: 749 })
    expect(error?.message).toContain('cost_changed')
    expect((await player(userId)).currency).toBe(750)
  })
})

import { describe, it, expect } from 'vitest'
import { admin, newPlayer, inventoryOf, giveCards } from './helpers'

async function cardOf(rarity: string, skip = 0): Promise<number> {
  const { data, error } = await admin.from('cards').select('id').eq('rarity', rarity).order('id').range(skip, skip)
  if (error) throw error
  return data![0].id as number
}

describe('recycle_duplicates', () => {
  it('recycles only the chosen rarities, keeping one copy', async () => {
    const { userId, client } = await newPlayer()
    const common = await cardOf('common')
    const rare = await cardOf('rare')
    const epic = await cardOf('epic')
    for (const c of [common, rare, epic]) await giveCards(userId, c, 3)
    const { data, error } = await client.rpc('recycle_duplicates', { p_rarities: ['common', 'rare'] })
    expect(error).toBeNull()
    expect(data).toBe(2 * 1 + 2 * 3)
    const inv = await inventoryOf(userId)
    expect(inv.get(common)!.count).toBe(1)
    expect(inv.get(rare)!.count).toBe(1)
    expect(inv.get(epic)!.count).toBe(3)
    const { data: rows } = await admin.from('ledger').select('card_id').eq('player_id', userId).eq('kind', 'recycle')
    expect(rows!.map((r) => r.card_id).sort()).toEqual([common, rare].sort())
  })

  it('does nothing with no rarity chosen', async () => {
    const { userId, client } = await newPlayer()
    const common = await cardOf('common')
    await giveCards(userId, common, 3)
    const { data, error } = await client.rpc('recycle_duplicates', { p_rarities: [] })
    expect(error).toBeNull()
    expect(data).toBe(0)
    expect((await inventoryOf(userId)).get(common)!.count).toBe(3)
  })

  it('keeps copies locked in the market', async () => {
    const { userId, client } = await newPlayer()
    const common = await cardOf('common', 1)
    await giveCards(userId, common, 4)
    await admin.from('inventory').update({ locked: 2 }).eq('player_id', userId).eq('card_id', common)
    await client.rpc('recycle_duplicates', { p_rarities: ['common'] })
    expect((await inventoryOf(userId)).get(common)!.count).toBe(2)
  })
})

describe('wishlist_add_series', () => {
  it('adds the missing cards of a series once', async () => {
    const { userId, client } = await newPlayer()
    const { data: cards } = await admin.from('cards').select('id').eq('series_id', 1).order('id')
    const ids = cards!.map((c) => c.id as number)
    await giveCards(userId, ids[0], 1)
    const first = await client.rpc('wishlist_add_series', { p_series_id: 1 })
    expect(first.error).toBeNull()
    expect(first.data).toBe(ids.length - 1)
    const again = await client.rpc('wishlist_add_series', { p_series_id: 1 })
    expect(again.data).toBe(0)
    const { data: wish } = await admin.from('wishlist').select('card_id').eq('player_id', userId)
    expect(wish!.map((w) => w.card_id).sort((a, b) => a - b)).toEqual(ids.slice(1))
  })
})

describe('catalog_page', () => {
  it('pages missing and all cards of a series', async () => {
    const { userId, client } = await newPlayer()
    const { data: cards } = await admin.from('cards').select('id, number').eq('series_id', 1).order('number')
    await giveCards(userId, cards![0].id, 2)
    const args = { p_series_id: 1, p_rarity: null, p_q: null, p_sort: 'number', p_offset: 0, p_limit: 48 }
    const missing = await client.rpc('catalog_page', { p_show: 'missing', ...args })
    expect(missing.error).toBeNull()
    const rows = missing.data as { card_id: number; number: number; owned_count: number; total: number }[]
    expect(rows.map((r) => r.card_id)).not.toContain(cards![0].id)
    expect(rows[0].total).toBe(cards!.length - 1)
    expect(rows.map((r) => r.number)).toEqual([...rows.map((r) => r.number)].sort((a, b) => a - b))
    const all = await client.rpc('catalog_page', { p_show: 'all', ...args })
    const allRows = all.data as { card_id: number; owned_count: number; total: number }[]
    expect(allRows[0].total).toBe(cards!.length)
    expect(allRows.find((r) => r.card_id === cards![0].id)!.owned_count).toBe(2)
  })
})

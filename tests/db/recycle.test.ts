import { describe, it, expect } from 'vitest'
import { admin, newPlayer, inventoryOf, giveCards } from './helpers'

async function cardOf(rarity: string, skip = 0): Promise<number> {
  const { data, error } = await admin.from('cards').select('id').eq('rarity', rarity).order('id').range(skip, skip)
  if (error) throw error
  return data![0].id as number
}

async function currencyOf(userId: string): Promise<number> {
  const { data, error } = await admin.from('players').select('currency').eq('id', userId).single()
  if (error) throw error
  return data.currency as number
}

describe('recycle', () => {
  it('recycles duplicates of an epic for 10 each and writes a ledger row', async () => {
    const { userId, client } = await newPlayer({ currency: 5 })
    const card = await cardOf('epic')
    await giveCards(userId, card, 3)
    const { data, error } = await client.rpc('recycle', { p_card_id: card, p_count: 2 })
    expect(error).toBeNull()
    expect(data).toBe(20)
    expect((await inventoryOf(userId)).get(card)!.count).toBe(1)
    expect(await currencyOf(userId)).toBe(25)
    const { data: rows } = await admin.from('ledger').select('*').eq('player_id', userId).eq('kind', 'recycle')
    expect(rows).toHaveLength(1)
    expect(rows![0]).toMatchObject({ card_id: card, card_delta: -2, currency_delta: 20 })
  })

  it('refuses to recycle the last copy or a count below 1', async () => {
    const { userId, client } = await newPlayer()
    const card = await cardOf('rare')
    await giveCards(userId, card, 1)
    const r1 = await client.rpc('recycle', { p_card_id: card, p_count: 1 })
    expect(r1.error?.message).toContain('not_enough_duplicates')
    await giveCards(userId, card, 3)
    const r2 = await client.rpc('recycle', { p_card_id: card, p_count: 0 })
    expect(r2.error?.message).toContain('not_enough_duplicates')
  })

  it('does not recycle locked copies', async () => {
    const { userId, client } = await newPlayer()
    const card = await cardOf('epic')
    await giveCards(userId, card, 3)
    const { error: e } = await admin.from('inventory').update({ locked: 2 }).eq('player_id', userId).eq('card_id', card)
    expect(e).toBeNull()
    const bad = await client.rpc('recycle', { p_card_id: card, p_count: 2 })
    expect(bad.error?.message).toContain('not_enough_duplicates')
    const ok = await client.rpc('recycle', { p_card_id: card, p_count: 1 })
    expect(ok.error).toBeNull()
    expect(ok.data).toBe(10)
    expect((await inventoryOf(userId)).get(card)).toEqual({ count: 2, locked: 2 })
  })

  it('recycle_all_duplicates sums everything and keeps one of each', async () => {
    const { userId, client } = await newPlayer()
    const m = await cardOf('mythic')
    const c = await cardOf('common')
    await giveCards(userId, m, 2)
    await giveCards(userId, c, 4)
    const { data, error } = await client.rpc('recycle_all_duplicates')
    expect(error).toBeNull()
    expect(data).toBe(153)
    const inv = await inventoryOf(userId)
    expect(inv.get(m)!.count).toBe(1)
    expect(inv.get(c)!.count).toBe(1)
    expect(await currencyOf(userId)).toBe(153)
    const again = await client.rpc('recycle_all_duplicates')
    expect(again.data).toBe(0)
  })

  it('rejects non-players', async () => {
    const { signedInClient } = await import('./helpers')
    const { client } = await signedInClient()
    const r = await client.rpc('recycle_all_duplicates')
    expect(r.error?.message).toContain('not_a_player')
  })
})

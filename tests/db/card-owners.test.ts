import { describe, it, expect } from 'vitest'
import { admin, newPlayer, giveCards } from './helpers'

describe('card_owners', () => {
  it('counts players holding at least one copy', async () => {
    const { data } = await admin.from('cards').select('id').order('id', { ascending: false }).limit(1)
    const card = data![0].id as number
    const before = await (await newPlayer()).client.rpc('card_owners', { p_card_id: card })
    const a = await newPlayer()
    const b = await newPlayer()
    const c = await newPlayer()
    await giveCards(a.userId, card, 1)
    await giveCards(b.userId, card, 3)
    await giveCards(c.userId, card, 1)
    await admin.from('inventory').update({ count: 0 }).eq('player_id', c.userId).eq('card_id', card)
    const { data: n, error } = await a.client.rpc('card_owners', { p_card_id: card })
    expect(error).toBeNull()
    expect(n).toBe((before.data as number) + 2)
  })
})

import { describe, it, expect } from 'vitest'
import { admin, newPlayer, inventoryOf, giveCards } from './helpers'

// the test seed has 120 cards; inventory is per player, so tests may share cards
async function cardAt(index: number): Promise<number> {
  const { data, error } = await admin.from('cards').select('id').order('id').range(index, index)
  if (error) throw error
  return data![0].id as number
}

const ALL_RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic']

describe('set_card_protected', () => {
  it('lock blocks new listing but keeps the open one', async () => {
    const { userId, client } = await newPlayer()
    const card = await cardAt(0)
    await giveCards(userId, card, 3)
    const first = await client.rpc('create_listing', { p_card_id: card, p_price: 100 })
    expect(first.error).toBeNull()

    expect((await client.rpc('set_card_protected', { p_card_id: card, p_on: true })).error).toBeNull()
    const blocked = await client.rpc('create_listing', { p_card_id: card, p_price: 100 })
    expect(blocked.error?.message).toContain('card_protected')
    const { data: listing } = await admin.from('listings').select('status').eq('id', first.data).single()
    expect(listing!.status).toBe('open')

    expect((await client.rpc('set_card_protected', { p_card_id: card, p_on: false })).error).toBeNull()
    const again = await client.rpc('create_listing', { p_card_id: card, p_price: 100 })
    expect(again.error).toBeNull()
  })

  it('cannot lock a card you do not own', async () => {
    const { client } = await newPlayer()
    const card = await cardAt(1)
    const { error } = await client.rpc('set_card_protected', { p_card_id: card, p_on: true })
    expect(error?.message).toContain('no_copy')
  })
})

describe('lock blocks recycle, auction, order fill and trades', () => {
  async function lockedOwner(cardIndex: number) {
    const p = await newPlayer()
    const card = await cardAt(cardIndex)
    await giveCards(p.userId, card, 3)
    const { error } = await p.client.rpc('set_card_protected', { p_card_id: card, p_on: true })
    if (error) throw error
    return { ...p, card }
  }

  it('recycle', async () => {
    const { client, card } = await lockedOwner(2)
    const { error } = await client.rpc('recycle', { p_card_id: card, p_count: 1 })
    expect(error?.message).toContain('card_protected')
  })

  it('create_auction', async () => {
    const { client, card } = await lockedOwner(3)
    const { error } = await client.rpc('create_auction', { p_card_id: card, p_start_price: 100, p_duration_h: 1 })
    expect(error?.message).toContain('card_protected')
  })

  it('fill_buy_order', async () => {
    const seller = await lockedOwner(4)
    const buyer = await newPlayer({ currency: 500000 })
    const order = await buyer.client.rpc('create_buy_order', { p_card_id: seller.card, p_price: 100 })
    expect(order.error).toBeNull()
    const { error } = await seller.client.rpc('fill_buy_order', { p_id: order.data })
    expect(error?.message).toContain('card_protected')
  })

  it('propose_trade', async () => {
    const proposer = await lockedOwner(5)
    const to = await newPlayer()
    const { error } = await proposer.client.rpc('propose_trade', {
      p_to: to.userId,
      p_give: [{ card_id: proposer.card, count: 1 }],
      p_give_currency: 0,
      p_want: [],
      p_want_currency: 1,
    })
    expect(error?.message).toContain('card_protected')
  })

  it('accept_trade', async () => {
    const proposer = await newPlayer({ currency: 500000 })
    const to = await newPlayer()
    const card = await cardAt(6)
    await giveCards(to.userId, card, 3)
    const trade = await proposer.client.rpc('propose_trade', {
      p_to: to.userId,
      p_give: [],
      p_give_currency: 10,
      p_want: [{ card_id: card, count: 1 }],
      p_want_currency: 0,
    })
    expect(trade.error).toBeNull()
    expect((await to.client.rpc('set_card_protected', { p_card_id: card, p_on: true })).error).toBeNull()
    const { error } = await to.client.rpc('accept_trade', { p_id: trade.data })
    expect(error?.message).toContain('card_protected')
  })
})

describe('bulk recycle skips locked cards', () => {
  async function twoCards() {
    const p = await newPlayer()
    const locked = await cardAt(7)
    const free = await cardAt(8)
    await giveCards(p.userId, locked, 3)
    await giveCards(p.userId, free, 3)
    const { error } = await p.client.rpc('set_card_protected', { p_card_id: locked, p_on: true })
    if (error) throw error
    return { ...p, locked, free }
  }

  it('recycle_duplicates', async () => {
    const { userId, client, locked, free } = await twoCards()
    const { error } = await client.rpc('recycle_duplicates', { p_rarities: ALL_RARITIES })
    expect(error).toBeNull()
    const inv = await inventoryOf(userId)
    expect(inv.get(locked)!.count).toBe(3)
    expect(inv.get(free)!.count).toBe(1)
  })

  it('recycle_all_duplicates', async () => {
    const { userId, client, locked, free } = await twoCards()
    const { error } = await client.rpc('recycle_all_duplicates')
    expect(error).toBeNull()
    const inv = await inventoryOf(userId)
    expect(inv.get(locked)!.count).toBe(3)
    expect(inv.get(free)!.count).toBe(1)
  })
})

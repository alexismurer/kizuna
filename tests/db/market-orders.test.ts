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

describe('create_buy_order / cancel_buy_order', () => {
  it('deducts the price and writes a ledger row', async () => {
    const buyer = await newPlayer({ currency: 500 })
    const card = await cardOf('epic', 10)
    const { data: id, error } = await buyer.client.rpc('create_buy_order', { p_card_id: card, p_price: 120 })
    expect(error).toBeNull()
    expect(typeof id).toBe('number')
    expect(await currencyOf(buyer.userId)).toBe(380)
    const { data: row } = await admin.from('buy_orders').select('*').eq('id', id).single()
    expect(row).toMatchObject({ buyer_id: buyer.userId, card_id: card, price: 120, status: 'open', seller_id: null })
    const { data: led } = await admin.from('ledger').select('*').eq('player_id', buyer.userId).eq('kind', 'buy_order')
    expect(led).toHaveLength(1)
    expect(led![0]).toMatchObject({ currency_delta: -120, card_id: card, card_delta: 0, ref: String(id) })
  })

  it('rejects invalid price, insufficient currency and unknown card; nothing changes', async () => {
    const buyer = await newPlayer({ currency: 100 })
    const card = await cardOf('epic', 11)
    for (const price of [0, -1, 1000001]) {
      const r = await buyer.client.rpc('create_buy_order', { p_card_id: card, p_price: price })
      expect(r.error?.message).toContain('invalid_price')
    }
    const poor = await buyer.client.rpc('create_buy_order', { p_card_id: card, p_price: 101 })
    expect(poor.error?.message).toContain('insufficient_currency')
    const bad = await buyer.client.rpc('create_buy_order', { p_card_id: 999999999, p_price: 10 })
    expect(bad.error?.message).toContain('invalid_card')
    expect(await currencyOf(buyer.userId)).toBe(100)
  })

  it('allows several open orders for the same card', async () => {
    const buyer = await newPlayer({ currency: 100 })
    const card = await cardOf('epic', 12)
    const a = await buyer.client.rpc('create_buy_order', { p_card_id: card, p_price: 10 })
    const b = await buyer.client.rpc('create_buy_order', { p_card_id: card, p_price: 20 })
    expect(a.error).toBeNull()
    expect(b.error).toBeNull()
    expect(await currencyOf(buyer.userId)).toBe(70)
  })

  it('cancel refunds; only the owner and only open orders', async () => {
    const buyer = await newPlayer({ currency: 300 })
    const other = await newPlayer()
    const card = await cardOf('epic', 13)
    const { data: id } = await buyer.client.rpc('create_buy_order', { p_card_id: card, p_price: 250 })
    const foreign = await other.client.rpc('cancel_buy_order', { p_id: id })
    expect(foreign.error?.message).toContain('not_found')
    const ok = await buyer.client.rpc('cancel_buy_order', { p_id: id })
    expect(ok.error).toBeNull()
    expect(await currencyOf(buyer.userId)).toBe(300)
    const { data: row } = await admin.from('buy_orders').select('status, closed_at').eq('id', id).single()
    expect(row!.status).toBe('cancelled')
    expect(row!.closed_at).not.toBeNull()
    const { data: led } = await admin
      .from('ledger')
      .select('*')
      .eq('player_id', buyer.userId)
      .eq('kind', 'buy_order_refund')
    expect(led![0]).toMatchObject({ currency_delta: 250, ref: String(id) })
    const again = await buyer.client.rpc('cancel_buy_order', { p_id: id })
    expect(again.error?.message).toContain('not_open')
    const missing = await buyer.client.rpc('cancel_buy_order', { p_id: 999999999 })
    expect(missing.error?.message).toContain('not_found')
  })
})

describe('fill_buy_order', () => {
  it('moves card and currency, writes sale, ledger and notifies the buyer only', async () => {
    const buyer = await newPlayer({ currency: 1000 })
    const seller = await newPlayer({ currency: 5 })
    const card = await cardOf('legendary', 1)
    await giveCards(seller.userId, card, 1)
    const { data: id } = await buyer.client.rpc('create_buy_order', { p_card_id: card, p_price: 333 })
    const { data, error } = await seller.client.rpc('fill_buy_order', { p_id: id })
    expect(error).toBeNull()
    const net = 333 - 16
    expect(data).toEqual({ card_id: card, price: 333, net })
    expect(await currencyOf(buyer.userId)).toBe(1000 - 333)
    expect(await currencyOf(seller.userId)).toBe(5 + net)
    expect((await inventoryOf(seller.userId)).get(card)).toEqual({ count: 0, locked: 0 })
    expect((await inventoryOf(buyer.userId)).get(card)).toEqual({ count: 1, locked: 0 })
    const { data: row } = await admin.from('buy_orders').select('*').eq('id', id).single()
    expect(row).toMatchObject({ status: 'filled', seller_id: seller.userId })
    expect(row!.closed_at).not.toBeNull()
    const { data: sales } = await admin.from('market_sales').select('*').eq('card_id', card)
    expect(sales!.some((s) => s.price === 333 && s.source === 'order')).toBe(true)
    const { data: sl } = await admin.from('ledger').select('*').eq('player_id', seller.userId).eq('kind', 'market_sale')
    expect(sl).toHaveLength(1)
    expect(sl![0]).toMatchObject({ currency_delta: net, card_id: card, card_delta: -1, ref: String(id) })
    const { data: bl } = await admin.from('ledger').select('*').eq('player_id', buyer.userId).eq('kind', 'order_fill')
    expect(bl).toHaveLength(1)
    expect(bl![0]).toMatchObject({ currency_delta: 0, card_id: card, card_delta: 1, ref: String(id) })
    const { data: notes } = await buyer.client.rpc('my_notifications')
    expect(notes).toHaveLength(1)
    expect(notes![0]).toMatchObject({ kind: 'order_filled', payload: { order_id: id, card_id: card, price: 333 } })
    const { data: none } = await seller.client.rpc('my_notifications')
    expect(none).toHaveLength(0)
    const again = await seller.client.rpc('fill_buy_order', { p_id: id })
    expect(again.error?.message).toContain('not_open')
  })

  it('ledger currency over create -> fill sums to -fee across both players', async () => {
    const buyer = await newPlayer({ currency: 1000 })
    const seller = await newPlayer({ currency: 0 })
    const card = await cardOf('legendary', 2)
    await giveCards(seller.userId, card, 1)
    const { data: id } = await buyer.client.rpc('create_buy_order', { p_card_id: card, p_price: 777 })
    const r = await seller.client.rpc('fill_buy_order', { p_id: id })
    expect(r.error).toBeNull()
    const { data: led } = await admin
      .from('ledger')
      .select('currency_delta')
      .in('player_id', [buyer.userId, seller.userId])
      .eq('ref', String(id))
    const sum = led!.reduce((a, l) => a + (l.currency_delta as number), 0)
    expect(sum).toBe(-38)
  })

  it('own order -> own_order', async () => {
    const buyer = await newPlayer({ currency: 100 })
    const card = await cardOf('rare', 20)
    await giveCards(buyer.userId, card, 1)
    const { data: id } = await buyer.client.rpc('create_buy_order', { p_card_id: card, p_price: 50 })
    const r = await buyer.client.rpc('fill_buy_order', { p_id: id })
    expect(r.error?.message).toContain('own_order')
  })

  it('no free copy (none or all locked) -> no_free_copy, nothing moves', async () => {
    const buyer = await newPlayer({ currency: 100 })
    const seller = await newPlayer()
    const card = await cardOf('rare', 21)
    const { data: id } = await buyer.client.rpc('create_buy_order', { p_card_id: card, p_price: 50 })
    const none = await seller.client.rpc('fill_buy_order', { p_id: id })
    expect(none.error?.message).toContain('no_free_copy')
    await giveCards(seller.userId, card, 1)
    const l = await seller.client.rpc('create_listing', { p_card_id: card, p_price: 10 })
    expect(l.error).toBeNull()
    const locked = await seller.client.rpc('fill_buy_order', { p_id: id })
    expect(locked.error?.message).toContain('no_free_copy')
    expect(await currencyOf(buyer.userId)).toBe(50)
    const { data: row } = await admin.from('buy_orders').select('status').eq('id', id).single()
    expect(row!.status).toBe('open')
    expect((await inventoryOf(seller.userId)).get(card)).toEqual({ count: 1, locked: 1 })
  })

  it('a cancelled order cannot be filled', async () => {
    const buyer = await newPlayer({ currency: 100 })
    const seller = await newPlayer()
    const card = await cardOf('rare', 22)
    await giveCards(seller.userId, card, 1)
    const { data: id } = await buyer.client.rpc('create_buy_order', { p_card_id: card, p_price: 50 })
    await buyer.client.rpc('cancel_buy_order', { p_id: id })
    const r = await seller.client.rpc('fill_buy_order', { p_id: id })
    expect(r.error?.message).toContain('not_open')
  })

  it('keeps the buyer first_at when they already own the card', async () => {
    const buyer = await newPlayer({ currency: 100 })
    const seller = await newPlayer()
    const card = await cardOf('rare', 23)
    await giveCards(buyer.userId, card, 1)
    await giveCards(seller.userId, card, 1)
    const before = await admin
      .from('inventory')
      .select('first_at')
      .eq('player_id', buyer.userId)
      .eq('card_id', card)
      .single()
    const { data: id } = await buyer.client.rpc('create_buy_order', { p_card_id: card, p_price: 30 })
    const r = await seller.client.rpc('fill_buy_order', { p_id: id })
    expect(r.error).toBeNull()
    const after = await admin
      .from('inventory')
      .select('first_at, count')
      .eq('player_id', buyer.userId)
      .eq('card_id', card)
      .single()
    expect(after.data!.count).toBe(2)
    expect(after.data!.first_at).toBe(before.data!.first_at)
  })

  it('two sellers filling in parallel: one wins, the other gets not_open and keeps the card', async () => {
    const buyer = await newPlayer({ currency: 1000 })
    const a = await newPlayer()
    const b = await newPlayer()
    const card = await cardOf('mythic', 1)
    await giveCards(a.userId, card, 1)
    await giveCards(b.userId, card, 1)
    const { data: id } = await buyer.client.rpc('create_buy_order', { p_card_id: card, p_price: 400 })
    const [ra, rb] = await Promise.all([
      a.client.rpc('fill_buy_order', { p_id: id }),
      b.client.rpc('fill_buy_order', { p_id: id }),
    ])
    expect([ra, rb].filter((r) => r.error === null)).toHaveLength(1)
    const failed = [ra, rb].find((r) => r.error !== null)!
    expect(failed.error!.message).toContain('not_open')
    const winner = ra.error === null ? a : b
    const loser = ra.error === null ? b : a
    expect(await currencyOf(winner.userId)).toBe(380)
    expect(await currencyOf(loser.userId)).toBe(0)
    expect((await inventoryOf(loser.userId)).get(card)!.count).toBe(1)
    expect((await inventoryOf(buyer.userId)).get(card)!.count).toBe(1)
  })

  it('fill your last copy is allowed', async () => {
    const buyer = await newPlayer({ currency: 100 })
    const seller = await newPlayer()
    const card = await cardOf('rare', 24)
    await giveCards(seller.userId, card, 1)
    const { data: id } = await buyer.client.rpc('create_buy_order', { p_card_id: card, p_price: 60 })
    const r = await seller.client.rpc('fill_buy_order', { p_id: id })
    expect(r.error).toBeNull()
    expect((await inventoryOf(seller.userId)).get(card)!.count).toBe(0)
  })
})

async function clearOpenOrders(cardId: number) {
  const { error } = await admin.from('buy_orders').update({ status: 'cancelled' }).eq('card_id', cardId).eq('status', 'open')
  if (error) throw error
}

describe('market_orders / best_order', () => {
  it('lists open orders highest price first with card, series and buyer; filters by card', async () => {
    const b1 = await newPlayer({ currency: 100 })
    const b2 = await newPlayer({ currency: 100 })
    const viewer = await newPlayer()
    const card = await cardOf('uncommon', 28)
    await clearOpenOrders(card)
    const lo = await b1.client.rpc('create_buy_order', { p_card_id: card, p_price: 10 })
    const hi = await b2.client.rpc('create_buy_order', { p_card_id: card, p_price: 40 })
    const cancelled = await b1.client.rpc('create_buy_order', { p_card_id: card, p_price: 90 })
    await b1.client.rpc('cancel_buy_order', { p_id: cancelled.data })
    const { data, error } = await viewer.client.rpc('market_orders', { p_card_id: card, p_limit: 10, p_offset: 0 })
    expect(error).toBeNull()
    expect(data!.map((o: { id: number }) => o.id)).toEqual([hi.data, lo.data])
    expect(data![0]).toMatchObject({ card_id: card, price: 40, buyer_id: b2.userId })
    expect(data![0].buyer_username).toBeTruthy()
    expect(data![0].series_title).toBeTruthy()
    const best = await viewer.client.rpc('best_order', { p_card_id: card })
    expect(best.data).toEqual([{ id: hi.data, price: 40 }])
    const emptyCard = await cardOf('uncommon', 29)
    await clearOpenOrders(emptyCard)
    const empty = await viewer.client.rpc('best_order', { p_card_id: emptyCard })
    expect(empty.data).toEqual([])
  })

  it('best_order ties go to the oldest order', async () => {
    const b = await newPlayer({ currency: 100 })
    const viewer = await newPlayer()
    const card = await cardOf('uncommon', 27)
    await clearOpenOrders(card)
    const first = await b.client.rpc('create_buy_order', { p_card_id: card, p_price: 25 })
    await b.client.rpc('create_buy_order', { p_card_id: card, p_price: 25 })
    const best = await viewer.client.rpc('best_order', { p_card_id: card })
    expect(best.data).toEqual([{ id: first.data, price: 25 }])
  })
})

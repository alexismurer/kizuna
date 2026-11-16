import { describe, it, expect } from 'vitest'
import { admin, newPlayer, inventoryOf, giveCards, signedInClient, type TestClient } from './helpers'

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

type Auction = {
  id: number
  status: string
  top_bid: number | null
  top_bidder: string | null
  bid_count: number
  ends_at: string
  closed_at: string | null
}

async function auctionRow(id: number): Promise<Auction> {
  const { data, error } = await admin.from('auctions').select('*').eq('id', id).single()
  if (error) throw error
  return data as Auction
}

async function newAuction(client: TestClient, card: number, startPrice: number, durationH = 1): Promise<number> {
  const { data, error } = await client.rpc('create_auction', {
    p_card_id: card,
    p_start_price: startPrice,
    p_duration_h: durationH,
  })
  if (error) throw error
  return data as number
}

function bidAt(userId: string, id: number, amount: number, now: string) {
  return admin.rpc('_place_bid', { p_player: userId, p_id: id, p_amount: amount, p_now: now })
}

const plus = (iso: string, ms: number) => new Date(Date.parse(iso) + ms).toISOString()

async function ledgerOf(userId: string, kind: string) {
  const { data, error } = await admin.from('ledger').select('*').eq('player_id', userId).eq('kind', kind).order('id')
  if (error) throw error
  return data!
}

async function notesOf(userId: string) {
  const { data, error } = await admin.from('notifications').select('kind, payload').eq('player_id', userId).order('id')
  if (error) throw error
  return data!
}

async function auctionSales(card: number, price: number): Promise<number> {
  const { count, error } = await admin
    .from('market_sales')
    .select('id', { count: 'exact', head: true })
    .eq('card_id', card)
    .eq('source', 'auction')
    .eq('price', price)
  if (error) throw error
  return count!
}

describe('create_auction / cancel_auction', () => {
  it('locks one copy and validates price and duration', async () => {
    const { userId, client } = await newPlayer()
    const card = await cardOf('epic', 1)
    await giveCards(userId, card, 2)
    const before = Date.now()
    const id = await newAuction(client, card, 50, 6)
    expect((await inventoryOf(userId)).get(card)).toEqual({ count: 2, locked: 1 })
    const a = await auctionRow(id)
    expect(a).toMatchObject({ status: 'open', top_bid: null, top_bidder: null, bid_count: 0 })
    const ends = Date.parse(a.ends_at)
    expect(ends - before).toBeGreaterThan(6 * 3600_000 - 60_000)
    expect(ends - before).toBeLessThan(6 * 3600_000 + 60_000)

    for (const [price, dur, err] of [
      [0, 1, 'invalid_price'],
      [1000001, 1, 'invalid_price'],
      [10, 2, 'invalid_duration'],
    ] as const) {
      const r = await client.rpc('create_auction', { p_card_id: card, p_start_price: price, p_duration_h: dur })
      expect(r.error?.message).toContain(err)
    }
    await newAuction(client, card, 10, 24)
    const none = await client.rpc('create_auction', { p_card_id: card, p_start_price: 10, p_duration_h: 1 })
    expect(none.error?.message).toContain('no_free_copy')
    expect((await inventoryOf(userId)).get(card)).toEqual({ count: 2, locked: 2 })
  })

  it('cancel without bids unlocks; with bids fails has_bids', async () => {
    const seller = await newPlayer()
    const bidder = await newPlayer({ currency: 100 })
    const card = await cardOf('rare', 11)
    await giveCards(seller.userId, card, 2)
    const free = await newAuction(seller.client, card, 10)
    const foreign = await bidder.client.rpc('cancel_auction', { p_id: free })
    expect(foreign.error?.message).toContain('not_found')
    expect((await seller.client.rpc('cancel_auction', { p_id: free })).error).toBeNull()
    expect((await auctionRow(free)).status).toBe('cancelled')
    expect((await inventoryOf(seller.userId)).get(card)).toEqual({ count: 2, locked: 0 })
    expect((await seller.client.rpc('cancel_auction', { p_id: free })).error?.message).toContain('not_open')

    const bidOn = await newAuction(seller.client, card, 10)
    expect((await bidder.client.rpc('place_bid', { p_id: bidOn, p_amount: 10 })).error).toBeNull()
    const r = await seller.client.rpc('cancel_auction', { p_id: bidOn })
    expect(r.error?.message).toContain('has_bids')
    expect((await auctionRow(bidOn)).status).toBe('open')
    expect((await inventoryOf(seller.userId)).get(card)).toEqual({ count: 2, locked: 1 })
  })
})

describe('place_bid', () => {
  it('min_next_bid: start price, then +5 % rounded up (at least 1)', async () => {
    const seller = await newPlayer()
    const a = await newPlayer({ currency: 10000 })
    const b = await newPlayer({ currency: 10000 })
    const card = await cardOf('rare', 12)
    await giveCards(seller.userId, card, 1)
    const id = await newAuction(seller.client, card, 10)
    expect((await a.client.rpc('min_next_bid', { p_id: id })).data).toBe(10)
    const low = await a.client.rpc('place_bid', { p_id: id, p_amount: 9 })
    expect(low.error?.message).toContain('bid_too_low')
    expect(low.error?.message).toContain('10')
    expect(await currencyOf(a.userId)).toBe(10000)
    expect((await a.client.rpc('place_bid', { p_id: id, p_amount: 10 })).error).toBeNull()
    expect((await a.client.rpc('min_next_bid', { p_id: id })).data).toBe(11) // 10 + max(1, ceil(0.5))
    expect((await b.client.rpc('place_bid', { p_id: id, p_amount: 101 })).error).toBeNull()
    expect((await a.client.rpc('min_next_bid', { p_id: id })).data).toBe(107) // 101 + ceil(5.05)
    expect((await a.client.rpc('place_bid', { p_id: id, p_amount: 106 })).error?.message).toContain('bid_too_low')
  })

  it('a valid bid deducts; outbidding refunds the previous bidder in the same call and notifies', async () => {
    const seller = await newPlayer()
    const a = await newPlayer({ currency: 500 })
    const b = await newPlayer({ currency: 500 })
    const card = await cardOf('legendary', 1)
    await giveCards(seller.userId, card, 1)
    const id = await newAuction(seller.client, card, 100)
    const first = await a.client.rpc('place_bid', { p_id: id, p_amount: 120 })
    expect(first.error).toBeNull()
    expect(first.data).toMatchObject({ top_bid: 120 })
    expect(await currencyOf(a.userId)).toBe(380)
    expect(await ledgerOf(a.userId, 'bid')).toEqual([
      expect.objectContaining({ currency_delta: -120, card_id: card, card_delta: 0, ref: String(id) }),
    ])

    const second = await b.client.rpc('place_bid', { p_id: id, p_amount: 200 })
    expect(second.error).toBeNull()
    expect(await currencyOf(a.userId)).toBe(500)
    expect(await currencyOf(b.userId)).toBe(300)
    expect(await ledgerOf(a.userId, 'bid_refund')).toEqual([
      expect.objectContaining({ currency_delta: 120, card_id: card, card_delta: 0, ref: String(id) }),
    ])
    expect(await notesOf(a.userId)).toEqual([
      { kind: 'outbid', payload: { auction_id: id, card_id: card, amount: 200 } },
    ])
    expect(await auctionRow(id)).toMatchObject({ top_bid: 200, top_bidder: b.userId, bid_count: 2 })
    const { data: bids } = await admin.from('bids').select('bidder_id, amount').eq('auction_id', id).order('id')
    expect(bids).toEqual([
      { bidder_id: a.userId, amount: 120 },
      { bidder_id: b.userId, amount: 200 },
    ])
  })

  it('own auction, current top bidder and insufficient currency are refused; nothing changes', async () => {
    const seller = await newPlayer({ currency: 1000 })
    const a = await newPlayer({ currency: 1000 })
    const poor = await newPlayer({ currency: 49 })
    const card = await cardOf('rare', 13)
    await giveCards(seller.userId, card, 1)
    const id = await newAuction(seller.client, card, 10)
    expect((await seller.client.rpc('place_bid', { p_id: id, p_amount: 50 })).error?.message).toContain('own_auction')
    expect((await a.client.rpc('place_bid', { p_id: id, p_amount: 20 })).error).toBeNull()
    expect((await a.client.rpc('place_bid', { p_id: id, p_amount: 100 })).error?.message).toContain('already_top')
    expect((await poor.client.rpc('place_bid', { p_id: id, p_amount: 50 })).error?.message).toContain(
      'insufficient_currency',
    )
    expect(await currencyOf(seller.userId)).toBe(1000)
    expect(await currencyOf(a.userId)).toBe(980)
    expect(await currencyOf(poor.userId)).toBe(49)
    expect(await auctionRow(id)).toMatchObject({ top_bid: 20, top_bidder: a.userId, bid_count: 1 })
    expect((await a.client.rpc('place_bid', { p_id: 999999999, p_amount: 50 })).error?.message).toContain('not_found')
  })

  it('anti-snipe: a bid at ends_at - 1 s extends by 2 min; a bid at ends_at fails auction_ended', async () => {
    const seller = await newPlayer()
    const a = await newPlayer({ currency: 1000 })
    const b = await newPlayer({ currency: 1000 })
    const card = await cardOf('rare', 14)
    await giveCards(seller.userId, card, 1)
    const id = await newAuction(seller.client, card, 10)
    const ends = (await auctionRow(id)).ends_at

    // a bid well before the end does not extend
    expect((await bidAt(a.userId, id, 10, plus(ends, -10 * 60_000))).error).toBeNull()
    expect(Date.parse((await auctionRow(id)).ends_at)).toBe(Date.parse(ends))

    const late = await bidAt(b.userId, id, 20, plus(ends, -1000))
    expect(late.error).toBeNull()
    const extended = plus(ends, 2 * 60_000)
    expect(Date.parse((late.data as { ends_at: string }).ends_at)).toBe(Date.parse(extended))
    expect(Date.parse((await auctionRow(id)).ends_at)).toBe(Date.parse(extended))

    const tooLate = await bidAt(a.userId, id, 50, extended)
    expect(tooLate.error?.message).toContain('auction_ended')
    expect(await currencyOf(a.userId)).toBe(1000) // refunded when b outbid, untouched by the late bid
    expect(await currencyOf(b.userId)).toBe(980)
  })

  it('two parallel bids of the same amount: one wins, the other gets bid_too_low and keeps its currency', async () => {
    const seller = await newPlayer()
    const a = await newPlayer({ currency: 1000 })
    const b = await newPlayer({ currency: 1000 })
    const card = await cardOf('mythic', 1)
    await giveCards(seller.userId, card, 1)
    const id = await newAuction(seller.client, card, 300)
    const [ra, rb] = await Promise.all([
      a.client.rpc('place_bid', { p_id: id, p_amount: 300 }),
      b.client.rpc('place_bid', { p_id: id, p_amount: 300 }),
    ])
    expect([ra, rb].filter((r) => r.error === null)).toHaveLength(1)
    expect([ra, rb].find((r) => r.error !== null)!.error!.message).toContain('bid_too_low')
    const winner = ra.error === null ? a : b
    const loser = ra.error === null ? b : a
    expect(await currencyOf(winner.userId)).toBe(700)
    expect(await currencyOf(loser.userId)).toBe(1000)
    expect(await auctionRow(id)).toMatchObject({ top_bid: 300, top_bidder: winner.userId, bid_count: 1 })
    expect(await ledgerOf(loser.userId, 'bid')).toHaveLength(0)
  })

  it('parallel outbids of different amounts keep escrow consistent', async () => {
    const seller = await newPlayer()
    const players = await Promise.all([1, 2, 3, 4].map(() => newPlayer({ currency: 1000 })))
    const card = await cardOf('epic', 12)
    await giveCards(seller.userId, card, 1)
    const id = await newAuction(seller.client, card, 10)
    const results = await Promise.all(
      players.map((p, i) => p.client.rpc('place_bid', { p_id: id, p_amount: 100 + i * 50 })),
    )
    const a = await auctionRow(id)
    const winners = results.filter((r) => r.error === null).length
    expect(a.bid_count).toBe(winners)
    for (const [i, p] of players.entries()) {
      const expected = p.userId === a.top_bidder ? 1000 - a.top_bid! : 1000
      expect(await currencyOf(p.userId)).toBe(expected)
      if (results[i].error) expect(results[i].error!.message).toContain('bid_too_low')
    }
  })

  it('players cannot call the internal functions', async () => {
    const { userId, client } = await newPlayer()
    expect((await client.rpc('_place_bid', { p_player: userId, p_id: 1, p_amount: 1, p_now: new Date().toISOString() })).error).not.toBeNull()
    expect((await client.rpc('_settle_market', { p_now: new Date().toISOString() })).error).not.toBeNull()
  })
})

describe('settlement', () => {
  it('with bids: card to the winner, net to the seller, sale row, ledger and notifications', async () => {
    const seller = await newPlayer({ currency: 5 })
    const a = await newPlayer({ currency: 1000 })
    const b = await newPlayer({ currency: 1000 })
    const card = await cardOf('legendary', 2)
    await giveCards(seller.userId, card, 2)
    const id = await newAuction(seller.client, card, 100)
    expect((await a.client.rpc('place_bid', { p_id: id, p_amount: 100 })).error).toBeNull()
    expect((await b.client.rpc('place_bid', { p_id: id, p_amount: 333 })).error).toBeNull()
    const ends = (await auctionRow(id)).ends_at

    // not yet ended: nothing happens
    expect((await admin.rpc('_settle_market', { p_now: plus(ends, -1000) })).error).toBeNull()
    expect((await auctionRow(id)).status).toBe('open')

    const salesBefore = await auctionSales(card, 333)
    const r = await admin.rpc('_settle_market', { p_now: plus(ends, 1000) })
    expect(r.error).toBeNull()
    expect(r.data).toBeGreaterThanOrEqual(1)
    const fee = 16
    const net = 333 - fee
    expect(net + fee).toBe(333)
    const after = await auctionRow(id)
    expect(after.status).toBe('sold')
    expect(after.closed_at).not.toBeNull()
    expect(await currencyOf(seller.userId)).toBe(5 + net)
    expect(await currencyOf(b.userId)).toBe(1000 - 333)
    expect(await currencyOf(a.userId)).toBe(1000)
    expect((await inventoryOf(seller.userId)).get(card)).toEqual({ count: 1, locked: 0 })
    expect((await inventoryOf(b.userId)).get(card)).toEqual({ count: 1, locked: 0 })
    expect((await inventoryOf(a.userId)).get(card)).toBeUndefined()

    expect(await auctionSales(card, 333)).toBe(salesBefore + 1)
    expect(await ledgerOf(seller.userId, 'market_sale')).toEqual([
      expect.objectContaining({ currency_delta: net, card_id: card, card_delta: -1, ref: String(id) }),
    ])
    expect(await ledgerOf(b.userId, 'auction_won')).toEqual([
      expect.objectContaining({ currency_delta: 0, card_id: card, card_delta: 1, ref: String(id) }),
    ])
    expect(await notesOf(seller.userId)).toEqual([
      { kind: 'sold', payload: { card_id: card, price: 333, net, source: 'auction' } },
    ])
    expect(await notesOf(b.userId)).toEqual([
      { kind: 'auction_won', payload: { auction_id: id, card_id: card, price: 333 } },
    ])

    // settling again changes nothing
    await admin.rpc('_settle_market', { p_now: plus(ends, 5000) })
    expect(await currencyOf(seller.userId)).toBe(5 + net)
    expect(await ledgerOf(b.userId, 'auction_won')).toHaveLength(1)
    expect(await notesOf(seller.userId)).toHaveLength(1)
    expect(await auctionSales(card, 333)).toBe(salesBefore + 1)
  })

  it('keeps the winner first_at when they already own the card', async () => {
    const seller = await newPlayer()
    const buyer = await newPlayer({ currency: 100 })
    const card = await cardOf('rare', 15)
    await giveCards(seller.userId, card, 1)
    await giveCards(buyer.userId, card, 1)
    const firstAt = '2020-01-01T00:00:00+00:00'
    await admin.from('inventory').update({ first_at: firstAt }).eq('player_id', buyer.userId).eq('card_id', card)
    const id = await newAuction(seller.client, card, 5)
    expect((await buyer.client.rpc('place_bid', { p_id: id, p_amount: 5 })).error).toBeNull()
    await admin.rpc('_settle_market', { p_now: plus((await auctionRow(id)).ends_at, 1000) })
    const { data: row } = await admin
      .from('inventory')
      .select('count, first_at')
      .eq('player_id', buyer.userId)
      .eq('card_id', card)
      .single()
    expect(row!.count).toBe(2)
    expect(new Date(row!.first_at as string).toISOString()).toBe(new Date(firstAt).toISOString())
  })

  it('without bids: unlocks the copy, unsold, auction_unsold notification', async () => {
    const seller = await newPlayer({ currency: 7 })
    const card = await cardOf('rare', 16)
    await giveCards(seller.userId, card, 1)
    const id = await newAuction(seller.client, card, 50)
    await admin.rpc('_settle_market', { p_now: plus((await auctionRow(id)).ends_at, 0) })
    expect((await auctionRow(id)).status).toBe('unsold')
    expect((await inventoryOf(seller.userId)).get(card)).toEqual({ count: 1, locked: 0 })
    expect(await currencyOf(seller.userId)).toBe(7)
    expect(await notesOf(seller.userId)).toEqual([{ kind: 'auction_unsold', payload: { auction_id: id, card_id: card } }])
  })

  it('concurrent settlements settle once', async () => {
    const seller = await newPlayer()
    const buyer = await newPlayer({ currency: 1000 })
    const card = await cardOf('epic', 13)
    await giveCards(seller.userId, card, 1)
    const id = await newAuction(seller.client, card, 40)
    expect((await buyer.client.rpc('place_bid', { p_id: id, p_amount: 400 })).error).toBeNull()
    const at = plus((await auctionRow(id)).ends_at, 1000)
    const runs = await Promise.all([1, 2, 3, 4].map(() => admin.rpc('_settle_market', { p_now: at })))
    expect(runs.every((r) => r.error === null)).toBe(true)
    expect((await auctionRow(id)).status).toBe('sold')
    expect(await currencyOf(seller.userId)).toBe(400 - 20)
    expect(await ledgerOf(seller.userId, 'market_sale')).toHaveLength(1)
    expect(await ledgerOf(buyer.userId, 'auction_won')).toHaveLength(1)
    expect((await inventoryOf(buyer.userId)).get(card)).toEqual({ count: 1, locked: 0 })
    expect(await notesOf(buyer.userId)).toHaveLength(1)
  })

  it('a bid at the boundary racing settlement: either the bid extends or the auction settles, never both', async () => {
    for (let round = 0; round < 3; round++) {
      const seller = await newPlayer()
      const a = await newPlayer({ currency: 1000 })
      const b = await newPlayer({ currency: 1000 })
      const card = await cardOf('epic', 14 + round)
      await giveCards(seller.userId, card, 1)
      const id = await newAuction(seller.client, card, 10)
      expect((await a.client.rpc('place_bid', { p_id: id, p_amount: 100 })).error).toBeNull()
      const ends = (await auctionRow(id)).ends_at
      const [bid, settle] = await Promise.all([
        bidAt(b.userId, id, 200, plus(ends, -1000)),
        admin.rpc('_settle_market', { p_now: plus(ends, 1000) }),
      ])
      expect(settle.error).toBeNull()
      const after = await auctionRow(id)
      if (bid.error === null) {
        expect(after).toMatchObject({ status: 'open', top_bid: 200, top_bidder: b.userId })
        expect(Date.parse(after.ends_at)).toBe(Date.parse(ends) + 120_000)
        expect(await currencyOf(a.userId)).toBe(1000)
        expect(await currencyOf(b.userId)).toBe(800)
        expect((await inventoryOf(seller.userId)).get(card)).toEqual({ count: 1, locked: 1 })
      } else {
        expect(bid.error.message).toContain('auction_ended')
        expect(after).toMatchObject({ status: 'sold', top_bid: 100, top_bidder: a.userId })
        expect(await currencyOf(a.userId)).toBe(900)
        expect(await currencyOf(b.userId)).toBe(1000)
        expect((await inventoryOf(a.userId)).get(card)).toEqual({ count: 1, locked: 0 })
      }
    }
  })

  it('settle_market is callable by players', async () => {
    const { client } = await newPlayer()
    const r = await client.rpc('settle_market')
    expect(r.error).toBeNull()
    expect(typeof r.data).toBe('number')
    const { client: stranger } = await signedInClient()
    expect((await stranger.rpc('settle_market')).error?.message).toContain('not_a_player')
  })
})

describe('market_auctions', () => {
  it('lists open auctions with card, seller, value and min next bid; filters and sorts', async () => {
    const seller = await newPlayer()
    const viewer = await newPlayer({ currency: 1000 })
    const c1 = await cardOf('common', 3)
    const c2 = await cardOf('epic', 17)
    await giveCards(seller.userId, c1, 1)
    await giveCards(seller.userId, c2, 1)
    const short = await newAuction(seller.client, c1, 7, 1)
    const long = await newAuction(seller.client, c2, 900, 24)
    expect((await viewer.client.rpc('place_bid', { p_id: long, p_amount: 950 })).error).toBeNull()

    const args = { p_query: null, p_rarities: null, p_min: null, p_max: null, p_sort: 'ending', p_limit: 100, p_offset: 0 }
    const all = await viewer.client.rpc('market_auctions', args)
    expect(all.error).toBeNull()
    const rows = all.data as Record<string, unknown>[]
    const ids = rows.map((r) => r.id)
    expect(ids.indexOf(short)).toBeLessThan(ids.indexOf(long))
    const { data: username } = await admin.from('players').select('username').eq('id', seller.userId).single()
    expect(rows.find((r) => r.id === long)).toMatchObject({
      card_id: c2,
      start_price: 900,
      top_bid: 950,
      top_bidder: viewer.userId,
      bid_count: 1,
      min_bid: 998,
      rarity: 'epic',
      seller_id: seller.userId,
      seller_username: username!.username,
    })
    expect(rows.find((r) => r.id === short)).toMatchObject({ min_bid: 7, top_bid: null })
    for (const k of ['ends_at', 'name', 'number', 'image_url', 'series_title', 'value']) {
      expect(rows[0]).toHaveProperty(k)
    }

    const byRarity = await viewer.client.rpc('market_auctions', { ...args, p_rarities: ['common'] })
    expect((byRarity.data as { id: number }[]).map((r) => r.id)).toContain(short)
    expect((byRarity.data as { id: number }[]).map((r) => r.id)).not.toContain(long)
    // price filters use the current price (top bid, else start price)
    const byPrice = await viewer.client.rpc('market_auctions', { ...args, p_min: 940, p_max: 960 })
    expect((byPrice.data as { id: number }[]).map((r) => r.id)).toContain(long)
    expect((byPrice.data as { id: number }[]).map((r) => r.id)).not.toContain(short)
    const newest = await viewer.client.rpc('market_auctions', { ...args, p_sort: 'newest' })
    const nIds = (newest.data as { id: number }[]).map((r) => r.id)
    expect(nIds.indexOf(long)).toBeLessThan(nIds.indexOf(short))
    for (const sort of ['price_asc', 'price_desc'] as const) {
      const r = await viewer.client.rpc('market_auctions', { ...args, p_sort: sort })
      const p = (r.data as { top_bid: number | null; start_price: number }[]).map((x) => x.top_bid ?? x.start_price)
      expect(p).toEqual([...p].sort((x, y) => (sort === 'price_asc' ? x - y : y - x)))
    }
    const limited = await viewer.client.rpc('market_auctions', { ...args, p_limit: 1 })
    expect(limited.data).toHaveLength(1)

    await seller.client.rpc('cancel_auction', { p_id: short })
    const after = await viewer.client.rpc('market_auctions', args)
    expect((after.data as { id: number }[]).map((r) => r.id)).not.toContain(short)
  })

  it('is for players only; tables are readable by players', async () => {
    const { client } = await signedInClient()
    const r = await client.rpc('market_auctions', {
      p_query: null, p_rarities: null, p_min: null, p_max: null, p_sort: 'ending', p_limit: 10, p_offset: 0,
    })
    expect(r.error?.message).toContain('not_a_player')
    const p = await newPlayer()
    expect((await p.client.from('auctions').select('id').limit(1)).error).toBeNull()
    expect((await p.client.from('bids').select('id').limit(1)).error).toBeNull()
  })
})

describe('daily_bid mission', () => {
  it('bids_placed counts the player bids since the period start', async () => {
    const seller = await newPlayer()
    const bidder = await newPlayer({ currency: 1000 })
    const card = await cardOf('rare', 17)
    await giveCards(seller.userId, card, 1)
    const id = await newAuction(seller.client, card, 10)
    const since = new Date(Date.now() - 60_000).toISOString()
    const before = await admin.rpc('metric_value', { p_player: bidder.userId, p_metric: 'bids_placed', p_since: since })
    expect(before.data).toBe(0)
    expect((await bidder.client.rpc('place_bid', { p_id: id, p_amount: 10 })).error).toBeNull()
    const after = await admin.rpc('metric_value', { p_player: bidder.userId, p_metric: 'bids_placed', p_since: since })
    expect(after.data).toBe(1)
    const later = await admin.rpc('metric_value', {
      p_player: bidder.userId,
      p_metric: 'bids_placed',
      p_since: new Date(Date.now() + 60_000).toISOString(),
    })
    expect(later.data).toBe(0)

    // on a day where daily_bid is in the player's set, a bid that day completes it
    let day = ''
    for (let i = 0; i < 200 && !day; i++) {
      const d = new Date(Date.parse('2026-02-01T00:00:00Z') + i * 86400000).toISOString().slice(0, 10)
      const { data } = await admin.rpc('_daily_missions', { p_player: bidder.userId, p_day: d })
      if ((data as string[]).includes('daily_bid')) day = d
    }
    expect(day).not.toBe('')
    const at = `${day}T10:00:00Z`
    const ins = await admin.from('bids').insert({ auction_id: id, bidder_id: bidder.userId, amount: 1, created_at: at })
    expect(ins.error).toBeNull()
    const m = await admin.rpc('_my_missions', { p_player: bidder.userId, p_now: `${day}T12:00:00Z` })
    expect(m.error).toBeNull()
    const daily = (m.data as { daily: { key: string; progress: number; target: number; reward: number }[] }).daily
    expect(daily.find((x) => x.key === 'daily_bid')).toMatchObject({ progress: 1, target: 1, reward: 20 })
  })
})

import { describe, it, expect } from 'vitest'
import { admin, newPlayer, inventoryOf, giveCards, signedInClient } from './helpers'

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

async function usernameOf(userId: string): Promise<string> {
  const { data, error } = await admin.from('players').select('username').eq('id', userId).single()
  if (error) throw error
  return data.username as string
}

describe('market_fee', () => {
  it('takes 5 % rounded down', async () => {
    const { client } = await newPlayer()
    for (const [price, fee] of [
      [1, 0],
      [19, 0],
      [20, 1],
      [39, 1],
      [1000000, 50000],
    ]) {
      const { data, error } = await client.rpc('market_fee', { p_price: price })
      expect(error).toBeNull()
      expect(data).toBe(fee)
    }
  })
})

describe('create_listing / cancel_listing', () => {
  it('locks one copy; the locked copy cannot be recycled, free copies can', async () => {
    const { userId, client } = await newPlayer()
    const card = await cardOf('epic', 0)
    await giveCards(userId, card, 2)
    const { data: id, error } = await client.rpc('create_listing', { p_card_id: card, p_price: 50 })
    expect(error).toBeNull()
    expect(typeof id).toBe('number')
    expect((await inventoryOf(userId)).get(card)).toEqual({ count: 2, locked: 1 })
    const bad = await client.rpc('recycle', { p_card_id: card, p_count: 2 })
    expect(bad.error?.message).toContain('not_enough_duplicates')
    const ok = await client.rpc('recycle', { p_card_id: card, p_count: 1 })
    expect(ok.error).toBeNull()
    expect((await inventoryOf(userId)).get(card)).toEqual({ count: 1, locked: 1 })
    const none = await client.rpc('recycle', { p_card_id: card, p_count: 1 })
    expect(none.error?.message).toContain('not_enough_duplicates')
  })

  it('allows listing the last copy, then no_free_copy', async () => {
    const { userId, client } = await newPlayer()
    const card = await cardOf('rare', 0)
    await giveCards(userId, card, 1)
    const first = await client.rpc('create_listing', { p_card_id: card, p_price: 10 })
    expect(first.error).toBeNull()
    const second = await client.rpc('create_listing', { p_card_id: card, p_price: 10 })
    expect(second.error?.message).toContain('no_free_copy')
    const missing = await client.rpc('create_listing', { p_card_id: await cardOf('rare', 1), p_price: 10 })
    expect(missing.error?.message).toContain('no_free_copy')
    expect((await inventoryOf(userId)).get(card)).toEqual({ count: 1, locked: 1 })
  })

  it('rejects invalid prices', async () => {
    const { userId, client } = await newPlayer()
    const card = await cardOf('rare', 2)
    await giveCards(userId, card, 2)
    for (const price of [0, -5, 1000001]) {
      const r = await client.rpc('create_listing', { p_card_id: card, p_price: price })
      expect(r.error?.message).toContain('invalid_price')
    }
    expect((await inventoryOf(userId)).get(card)).toEqual({ count: 2, locked: 0 })
  })

  it('cancel unlocks; only the seller and only open listings', async () => {
    const { userId, client } = await newPlayer()
    const other = await newPlayer()
    const card = await cardOf('rare', 3)
    await giveCards(userId, card, 1)
    const { data: id } = await client.rpc('create_listing', { p_card_id: card, p_price: 10 })
    const foreign = await other.client.rpc('cancel_listing', { p_id: id })
    expect(foreign.error?.message).toContain('not_found')
    const ok = await client.rpc('cancel_listing', { p_id: id })
    expect(ok.error).toBeNull()
    expect((await inventoryOf(userId)).get(card)).toEqual({ count: 1, locked: 0 })
    const { data: row } = await admin.from('listings').select('status, closed_at').eq('id', id).single()
    expect(row!.status).toBe('cancelled')
    expect(row!.closed_at).not.toBeNull()
    const again = await client.rpc('cancel_listing', { p_id: id })
    expect(again.error?.message).toContain('not_open')
    const missing = await client.rpc('cancel_listing', { p_id: 999999999 })
    expect(missing.error?.message).toContain('not_found')
  })
})

describe('buy_listing', () => {
  it('moves card and currency, writes sale, ledger and a sold notification', async () => {
    const seller = await newPlayer({ currency: 10 })
    const buyer = await newPlayer({ currency: 500 })
    const card = await cardOf('legendary', 0)
    await giveCards(seller.userId, card, 1)
    const { data: id } = await seller.client.rpc('create_listing', { p_card_id: card, p_price: 333 })
    const { data, error } = await buyer.client.rpc('buy_listing', { p_id: id })
    expect(error).toBeNull()
    expect(data).toEqual({ card_id: card, price: 333 })
    const fee = 16
    const net = 333 - fee
    expect(await currencyOf(buyer.userId)).toBe(500 - 333)
    expect(await currencyOf(seller.userId)).toBe(10 + net)
    expect((await inventoryOf(seller.userId)).get(card)).toEqual({ count: 0, locked: 0 })
    expect((await inventoryOf(buyer.userId)).get(card)).toEqual({ count: 1, locked: 0 })

    const { data: listing } = await admin.from('listings').select('*').eq('id', id).single()
    expect(listing).toMatchObject({ status: 'sold', buyer_id: buyer.userId })
    expect(listing!.closed_at).not.toBeNull()

    const { data: sales } = await admin.from('market_sales').select('*').eq('card_id', card)
    expect(sales!.some((s) => s.price === 333 && s.source === 'listing')).toBe(true)

    const { data: bl } = await admin.from('ledger').select('*').eq('player_id', buyer.userId).eq('kind', 'listing_buy')
    expect(bl).toHaveLength(1)
    expect(bl![0]).toMatchObject({ currency_delta: -333, card_id: card, card_delta: 1, ref: String(id) })
    const { data: sl } = await admin.from('ledger').select('*').eq('player_id', seller.userId).eq('kind', 'market_sale')
    expect(sl).toHaveLength(1)
    expect(sl![0]).toMatchObject({ currency_delta: net, card_id: card, card_delta: -1, ref: String(id) })

    const { data: notes, error: ne } = await seller.client.rpc('my_notifications')
    expect(ne).toBeNull()
    expect(notes).toHaveLength(1)
    expect(notes![0]).toMatchObject({
      kind: 'sold',
      payload: { card_id: card, price: 333, net, source: 'listing' },
      read_at: null,
    })
    const again = await buyer.client.rpc('buy_listing', { p_id: id })
    expect(again.error?.message).toContain('not_open')
  })

  it('keeps the buyer first_at when they already own the card', async () => {
    const seller = await newPlayer()
    const buyer = await newPlayer({ currency: 100 })
    const card = await cardOf('rare', 4)
    await giveCards(seller.userId, card, 1)
    await giveCards(buyer.userId, card, 1)
    const firstAt = '2020-01-01T00:00:00+00:00'
    await admin.from('inventory').update({ first_at: firstAt }).eq('player_id', buyer.userId).eq('card_id', card)
    const { data: id } = await seller.client.rpc('create_listing', { p_card_id: card, p_price: 5 })
    const r = await buyer.client.rpc('buy_listing', { p_id: id })
    expect(r.error).toBeNull()
    const { data: row } = await admin
      .from('inventory')
      .select('count, first_at')
      .eq('player_id', buyer.userId)
      .eq('card_id', card)
      .single()
    expect(row!.count).toBe(2)
    expect(new Date(row!.first_at as string).toISOString()).toBe(new Date(firstAt).toISOString())
  })

  it('refuses own listing', async () => {
    const seller = await newPlayer({ currency: 100 })
    const card = await cardOf('rare', 5)
    await giveCards(seller.userId, card, 1)
    const { data: id } = await seller.client.rpc('create_listing', { p_card_id: card, p_price: 5 })
    const r = await seller.client.rpc('buy_listing', { p_id: id })
    expect(r.error?.message).toContain('own_listing')
    expect(await currencyOf(seller.userId)).toBe(100)
  })

  it('insufficient currency changes nothing', async () => {
    const seller = await newPlayer({ currency: 0 })
    const buyer = await newPlayer({ currency: 99 })
    const card = await cardOf('rare', 6)
    await giveCards(seller.userId, card, 1)
    const { data: id } = await seller.client.rpc('create_listing', { p_card_id: card, p_price: 100 })
    const r = await buyer.client.rpc('buy_listing', { p_id: id })
    expect(r.error?.message).toContain('insufficient_currency')
    expect(await currencyOf(buyer.userId)).toBe(99)
    expect(await currencyOf(seller.userId)).toBe(0)
    expect((await inventoryOf(seller.userId)).get(card)).toEqual({ count: 1, locked: 1 })
    expect((await inventoryOf(buyer.userId)).get(card)).toBeUndefined()
    const { data: listing } = await admin.from('listings').select('status').eq('id', id).single()
    expect(listing!.status).toBe('open')
    const { data: led } = await admin.from('ledger').select('id').in('player_id', [buyer.userId, seller.userId])
    expect(led).toHaveLength(0)
  })

  it('two parallel buyers: exactly one wins, the other gets not_open', async () => {
    const seller = await newPlayer({ currency: 0 })
    const a = await newPlayer({ currency: 1000 })
    const b = await newPlayer({ currency: 1000 })
    const card = await cardOf('mythic', 0)
    await giveCards(seller.userId, card, 1)
    const { data: id } = await seller.client.rpc('create_listing', { p_card_id: card, p_price: 400 })
    const [ra, rb] = await Promise.all([
      a.client.rpc('buy_listing', { p_id: id }),
      b.client.rpc('buy_listing', { p_id: id }),
    ])
    const results = [ra, rb]
    expect(results.filter((r) => r.error === null)).toHaveLength(1)
    const failed = results.find((r) => r.error !== null)!
    expect(failed.error!.message).toContain('not_open')
    const winner = ra.error === null ? a : b
    const loser = ra.error === null ? b : a
    expect(await currencyOf(winner.userId)).toBe(600)
    expect(await currencyOf(loser.userId)).toBe(1000)
    expect(await currencyOf(seller.userId)).toBe(380)
    expect((await inventoryOf(winner.userId)).get(card)!.count).toBe(1)
    expect((await inventoryOf(loser.userId)).get(card)).toBeUndefined()
  })

  it('a listing whose seller cancelled cannot be bought', async () => {
    const seller = await newPlayer()
    const buyer = await newPlayer({ currency: 100 })
    const card = await cardOf('rare', 7)
    await giveCards(seller.userId, card, 1)
    const { data: id } = await seller.client.rpc('create_listing', { p_card_id: card, p_price: 5 })
    await seller.client.rpc('cancel_listing', { p_id: id })
    const r = await buyer.client.rpc('buy_listing', { p_id: id })
    expect(r.error?.message).toContain('not_open')
    expect(await currencyOf(buyer.userId)).toBe(100)
  })
})

describe('card_value', () => {
  it('is null without sales and the rounded median of the last 10', async () => {
    const { client } = await newPlayer()
    const card = await cardOf('uncommon', 0)
    const empty = await cardOf('uncommon', 1)
    const base = Date.now() + 3600_000
    // 12 sales; the two oldest are outliers that must be ignored
    const prices = [100000, 100000, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const rows = prices.map((price, i) => ({
      card_id: card,
      price,
      source: 'listing',
      sold_at: new Date(base + i * 1000).toISOString(),
    }))
    const { error } = await admin.from('market_sales').insert(rows)
    expect(error).toBeNull()
    const v = await client.rpc('card_value', { p_card_id: card })
    expect(v.error).toBeNull()
    expect(v.data).toBe(6) // median of 1..10 = 5.5 -> 6
    const n = await client.rpc('card_value', { p_card_id: empty })
    expect(n.data).toBeNull()
    const many = await client.rpc('card_values', { p_card_ids: [card, empty] })
    expect(many.error).toBeNull()
    expect(many.data).toEqual(expect.arrayContaining([{ card_id: card, value: 6 }]))
    expect((many.data as { card_id: number; value: number | null }[]).find((r) => r.card_id === empty)?.value ?? null).toBeNull()
  })

  it('market_sales are readable by players', async () => {
    const { client } = await newPlayer()
    const { error } = await client.from('market_sales').select('id').limit(1)
    expect(error).toBeNull()
  })
})

describe('market_listings', () => {
  it('filters by query, rarity and price, sorts, and includes seller and value', async () => {
    const seller = await newPlayer()
    const viewer = await newPlayer()
    const cheap = await cardOf('common', 0)
    const pricey = await cardOf('epic', 5)
    await giveCards(seller.userId, cheap, 1)
    await giveCards(seller.userId, pricey, 1)
    const { data: idCheap } = await seller.client.rpc('create_listing', { p_card_id: cheap, p_price: 7 })
    const { data: idPricey } = await seller.client.rpc('create_listing', { p_card_id: pricey, p_price: 900 })

    const all = await viewer.client.rpc('market_listings', {
      p_query: null,
      p_rarities: null,
      p_min: null,
      p_max: null,
      p_sort: 'newest',
      p_limit: 100,
      p_offset: 0,
    })
    expect(all.error).toBeNull()
    const mine = (all.data as { id: number }[]).filter((r) => r.id === idCheap || r.id === idPricey)
    expect(mine.map((r) => r.id)).toEqual([idPricey, idCheap])
    const row = (all.data as Record<string, unknown>[]).find((r) => r.id === idPricey)!
    const { data: c } = await admin.from('cards').select('name, number, rarity').eq('id', pricey).single()
    expect(row).toMatchObject({
      card_id: pricey,
      price: 900,
      name: c!.name,
      number: c!.number,
      rarity: 'epic',
      seller_username: await usernameOf(seller.userId),
      seller_id: seller.userId,
    })
    expect(row).toHaveProperty('series_title')
    expect(row).toHaveProperty('image_url')
    expect(row).toHaveProperty('value')

    const byRarity = await viewer.client.rpc('market_listings', {
      p_query: null, p_rarities: ['common'], p_min: null, p_max: null, p_sort: 'newest', p_limit: 100, p_offset: 0,
    })
    const ids = (byRarity.data as { id: number }[]).map((r) => r.id)
    expect(ids).toContain(idCheap)
    expect(ids).not.toContain(idPricey)

    const byPrice = await viewer.client.rpc('market_listings', {
      p_query: null, p_rarities: null, p_min: 100, p_max: 1000, p_sort: 'price_asc', p_limit: 100, p_offset: 0,
    })
    const pIds = (byPrice.data as { id: number; price: number }[])
    expect(pIds.map((r) => r.id)).toContain(idPricey)
    expect(pIds.map((r) => r.id)).not.toContain(idCheap)
    expect(pIds.every((r) => r.price >= 100 && r.price <= 1000)).toBe(true)

    const byName = await viewer.client.rpc('market_listings', {
      p_query: (c!.name as string).toUpperCase(), p_rarities: null, p_min: null, p_max: null, p_sort: 'price_desc', p_limit: 100, p_offset: 0,
    })
    expect((byName.data as { id: number }[]).map((r) => r.id)).toContain(idPricey)
    expect((byName.data as { id: number }[]).map((r) => r.id)).not.toContain(idCheap)

    const asc = await viewer.client.rpc('market_listings', {
      p_query: null, p_rarities: null, p_min: null, p_max: null, p_sort: 'price_asc', p_limit: 100, p_offset: 0,
    })
    const ap = (asc.data as { price: number }[]).map((r) => r.price)
    expect(ap).toEqual([...ap].sort((x, y) => x - y))
    const desc = await viewer.client.rpc('market_listings', {
      p_query: null, p_rarities: null, p_min: null, p_max: null, p_sort: 'price_desc', p_limit: 100, p_offset: 0,
    })
    const dp = (desc.data as { price: number }[]).map((r) => r.price)
    expect(dp).toEqual([...dp].sort((x, y) => y - x))

    // cancelled listings disappear
    await seller.client.rpc('cancel_listing', { p_id: idCheap })
    const after = await viewer.client.rpc('market_listings', {
      p_query: null, p_rarities: null, p_min: null, p_max: null, p_sort: 'newest', p_limit: 100, p_offset: 0,
    })
    expect((after.data as { id: number }[]).map((r) => r.id)).not.toContain(idCheap)

    const limited = await viewer.client.rpc('market_listings', {
      p_query: null, p_rarities: null, p_min: null, p_max: null, p_sort: 'newest', p_limit: 1, p_offset: 0,
    })
    expect(limited.data).toHaveLength(1)
  })

  it('is for players only', async () => {
    const { client } = await signedInClient()
    const r = await client.rpc('market_listings', {
      p_query: null, p_rarities: null, p_min: null, p_max: null, p_sort: 'newest', p_limit: 10, p_offset: 0,
    })
    expect(r.error?.message).toContain('not_a_player')
  })

  it('listings RLS: others see open listings, not cancelled ones; seller sees own', async () => {
    const seller = await newPlayer()
    const other = await newPlayer()
    const card = await cardOf('rare', 8)
    await giveCards(seller.userId, card, 2)
    const { data: open } = await seller.client.rpc('create_listing', { p_card_id: card, p_price: 5 })
    const { data: gone } = await seller.client.rpc('create_listing', { p_card_id: card, p_price: 6 })
    await seller.client.rpc('cancel_listing', { p_id: gone })
    const { data: seen } = await other.client.from('listings').select('id').in('id', [open, gone])
    expect(seen!.map((r) => r.id)).toEqual([open])
    const { data: own } = await seller.client.from('listings').select('id').in('id', [open, gone])
    expect(own!.map((r) => r.id).sort()).toEqual([open, gone].sort())
  })
})

describe('find_players', () => {
  it('prefix, case-insensitive, excludes self', async () => {
    const me = await newPlayer()
    const prefix = `fp${Math.random().toString(36).slice(2, 7)}`
    const a = await newPlayer()
    const b = await newPlayer()
    await admin.from('players').update({ username: `${prefix}Alpha` }).eq('id', a.userId)
    await admin.from('players').update({ username: `${prefix}beta` }).eq('id', b.userId)
    await admin.from('players').update({ username: `${prefix}me` }).eq('id', me.userId)
    const r = await me.client.rpc('find_players', { p_query: prefix.toUpperCase() })
    expect(r.error).toBeNull()
    const names = (r.data as { id: string; username: string }[]).map((x) => x.username).sort()
    expect(names).toEqual([`${prefix}Alpha`, `${prefix}beta`])
    const one = await me.client.rpc('find_players', { p_query: `${prefix}AL` })
    expect(one.data).toEqual([{ id: a.userId, username: `${prefix}Alpha` }])
    const notInfix = await me.client.rpc('find_players', { p_query: 'lpha' })
    expect((notInfix.data as { id: string }[]).map((x) => x.id)).not.toContain(a.userId)
  })
})

describe('notifications', () => {
  it('RLS own rows; mark read up to an id', async () => {
    const a = await newPlayer()
    const b = await newPlayer()
    const { error } = await admin.from('notifications').insert([
      { player_id: a.userId, kind: 'sold', payload: { n: 1 } },
      { player_id: a.userId, kind: 'sold', payload: { n: 2 } },
      { player_id: b.userId, kind: 'sold', payload: { n: 3 } },
    ])
    expect(error).toBeNull()
    const { data: seenByB } = await b.client.from('notifications').select('player_id')
    expect(seenByB!.every((r) => r.player_id === b.userId)).toBe(true)
    expect(seenByB).toHaveLength(1)
    const { data: list } = await a.client.rpc('my_notifications', { p_limit: 30 })
    expect(list).toHaveLength(2)
    // newest first
    const [newest, oldest] = list as { id: number; read_at: string | null }[]
    expect(newest.id).toBeGreaterThan(oldest.id)
    const m = await a.client.rpc('mark_notifications_read', { p_up_to: oldest.id })
    expect(m.error).toBeNull()
    const { data: after } = await a.client.rpc('my_notifications')
    const byId = new Map((after as { id: number; read_at: string | null }[]).map((r) => [r.id, r.read_at]))
    expect(byId.get(oldest.id)).not.toBeNull()
    expect(byId.get(newest.id)).toBeNull()
    // marking cannot touch another player's rows
    await a.client.rpc('mark_notifications_read', { p_up_to: Number.MAX_SAFE_INTEGER })
    const { data: bRows } = await admin.from('notifications').select('read_at').eq('player_id', b.userId)
    expect(bRows![0].read_at).toBeNull()
    const direct = await a.client.from('notifications').update({ read_at: null }).eq('player_id', a.userId).select()
    expect(direct.data ?? []).toHaveLength(0)
  })

  it('_notify is not callable by players', async () => {
    const { userId, client } = await newPlayer()
    const r = await client.rpc('_notify', { p_player: userId, p_kind: 'sold', p_payload: {} })
    expect(r.error).not.toBeNull()
  })
})

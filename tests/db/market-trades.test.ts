import { describe, it, expect } from 'vitest'
import { admin, newPlayer, inventoryOf, giveCards, signedInClient, type TestClient } from './helpers'

// the test seed has 120 cards; inventory is per player, so tests may share cards
async function cardAt(index: number): Promise<number> {
  const { data, error } = await admin.from('cards').select('id').order('id').range(index, index)
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

async function tradeRow(id: number) {
  const { data, error } = await admin.from('trades').select('*').eq('id', id).single()
  if (error) throw error
  return data as {
    id: number
    from_id: string
    to_id: string
    give_currency: number
    want_currency: number
    status: string
    created_at: string
    expires_at: string
    closed_at: string | null
  }
}

async function ledgerOf(userId: string, kind: string) {
  const { data, error } = await admin
    .from('ledger')
    .select('kind, currency_delta, card_id, card_delta, ref')
    .eq('player_id', userId)
    .eq('kind', kind)
    .order('id')
  if (error) throw error
  return data!
}

async function notesOf(userId: string) {
  const { data, error } = await admin.from('notifications').select('kind, payload').eq('player_id', userId).order('id')
  if (error) throw error
  return data!
}

type Item = { card_id: number; count: number }

function propose(
  client: TestClient,
  to: string,
  give: Item[],
  want: Item[],
  giveCurrency = 0,
  wantCurrency = 0,
) {
  return client.rpc('propose_trade', {
    p_to: to,
    p_give: give,
    p_give_currency: giveCurrency,
    p_want: want,
    p_want_currency: wantCurrency,
  })
}

async function newTrade(...args: Parameters<typeof propose>): Promise<number> {
  const { data, error } = await propose(...args)
  if (error) throw error
  return data as number
}

async function expire(id: number) {
  const { error } = await admin
    .from('trades')
    .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
    .eq('id', id)
  if (error) throw error
}

describe('propose_trade', () => {
  it('locks the give cards, deducts the give currency, notifies the recipient', async () => {
    const from = await newPlayer({ currency: 500 })
    const to = await newPlayer({ currency: 0 })
    const a = await cardAt(30)
    const b = await cardAt(70)
    const c = await cardAt(80)
    await giveCards(from.userId, a, 3)
    await giveCards(from.userId, b, 1)
    await giveCards(to.userId, c, 1)

    const { data: id, error } = await propose(
      from.client,
      to.userId,
      [
        { card_id: a, count: 2 },
        { card_id: b, count: 1 },
      ],
      [{ card_id: c, count: 1 }],
      100,
      50,
    )
    expect(error).toBeNull()
    expect(typeof id).toBe('number')

    const row = await tradeRow(id)
    expect(row).toMatchObject({
      from_id: from.userId,
      to_id: to.userId,
      give_currency: 100,
      want_currency: 50,
      status: 'open',
      closed_at: null,
    })
    expect(Date.parse(row.expires_at) - Date.parse(row.created_at)).toBe(48 * 3600 * 1000)
    const { data: items } = await admin.from('trade_items').select('side, card_id, count').eq('trade_id', id)
    expect(items).toHaveLength(3)
    expect(items).toEqual(
      expect.arrayContaining([
        { side: 'give', card_id: a, count: 2 },
        { side: 'give', card_id: b, count: 1 },
        { side: 'want', card_id: c, count: 1 },
      ]),
    )

    const inv = await inventoryOf(from.userId)
    expect(inv.get(a)).toEqual({ count: 3, locked: 2 })
    expect(inv.get(b)).toEqual({ count: 1, locked: 1 })
    expect((await inventoryOf(to.userId)).get(c)).toEqual({ count: 1, locked: 0 })
    expect(await currencyOf(from.userId)).toBe(400)
    expect(await ledgerOf(from.userId, 'trade_offer')).toEqual([
      { kind: 'trade_offer', currency_delta: -100, card_id: null, card_delta: 0, ref: String(id) },
    ])
    expect(await notesOf(to.userId)).toEqual([
      { kind: 'trade_received', payload: { trade_id: id, from_username: await usernameOf(from.userId) } },
    ])
    expect(await notesOf(from.userId)).toEqual([])
  })

  it('no give currency -> no trade_offer ledger row', async () => {
    const from = await newPlayer({ currency: 0 })
    const to = await newPlayer()
    const a = await cardAt(31)
    await giveCards(from.userId, a, 1)
    await newTrade(from.client, to.userId, [{ card_id: a, count: 1 }], [], 0, 10)
    expect(await ledgerOf(from.userId, 'trade_offer')).toEqual([])
  })

  it('rejects invalid trades; nothing changes', async () => {
    const from = await newPlayer({ currency: 2_000_000 })
    const to = await newPlayer()
    const a = await cardAt(32)
    const b = await cardAt(33)
    await giveCards(from.userId, a, 5)
    const one = [{ card_id: a, count: 1 }]
    const want = [{ card_id: b, count: 1 }]
    const many = await admin.from('cards').select('id').order('id').limit(21)
    const items21 = many.data!.map((r) => ({ card_id: r.id as number, count: 1 }))

    const cases: Array<() => ReturnType<typeof propose>> = [
      () => propose(from.client, from.userId, one, want), // to self
      () => propose(from.client, to.userId, [], want), // empty give side
      () => propose(from.client, to.userId, one, []), // empty want side
      () => propose(from.client, to.userId, [], [], 0, 0),
      () => propose(from.client, to.userId, [{ card_id: a, count: 1 }, { card_id: a, count: 1 }], want), // duplicate
      () => propose(from.client, to.userId, [{ card_id: a, count: 0 }], want), // count 0
      () => propose(from.client, to.userId, [{ card_id: a, count: -1 }], want),
      () => propose(from.client, to.userId, one, items21), // > 20 items
      () => propose(from.client, to.userId, one, want, 1_000_001), // currency over max
      () => propose(from.client, to.userId, one, want, 0, 1_000_001),
      () => propose(from.client, to.userId, one, want, -1),
      () => propose(from.client, to.userId, one, [{ card_id: 999999999, count: 1 }]), // unknown card
      () => propose(from.client, to.userId, one, [{ card_id: a, count: 1 }]), // same card both sides
      () =>
        from.client.rpc('propose_trade', {
          p_to: to.userId,
          p_give: { card_id: a, count: 1 },
          p_give_currency: 0,
          p_want: want,
          p_want_currency: 0,
        }), // not an array
      () =>
        from.client.rpc('propose_trade', {
          p_to: to.userId,
          p_give: [{ card_id: 'x', count: 1 }],
          p_give_currency: 0,
          p_want: want,
          p_want_currency: 0,
        }), // garbage card id
    ]
    for (const run of cases) {
      const r = await run()
      expect(r.error?.message).toContain('invalid_trade')
    }
    const unknown = await propose(from.client, '00000000-0000-0000-0000-000000000001', one, want)
    expect(unknown.error?.message).toContain('unknown_player')

    expect(await currencyOf(from.userId)).toBe(2_000_000)
    expect((await inventoryOf(from.userId)).get(a)).toEqual({ count: 5, locked: 0 })
    const { data: trades } = await admin.from('trades').select('id').eq('from_id', from.userId)
    expect(trades).toEqual([])
  })

  it('no_free_copy and insufficient_currency; nothing changes', async () => {
    const from = await newPlayer({ currency: 50 })
    const to = await newPlayer()
    const a = await cardAt(34)
    const b = await cardAt(35)
    const notOwned = await cardAt(36)
    await giveCards(from.userId, a, 2)
    const want = [{ card_id: b, count: 1 }]

    const tooMany = await propose(from.client, to.userId, [{ card_id: a, count: 3 }], want)
    expect(tooMany.error?.message).toContain('no_free_copy')
    const missing = await propose(
      from.client,
      to.userId,
      [
        { card_id: a, count: 1 },
        { card_id: notOwned, count: 1 },
      ],
      want,
    )
    expect(missing.error?.message).toContain('no_free_copy')
    const poor = await propose(from.client, to.userId, [{ card_id: a, count: 1 }], want, 51)
    expect(poor.error?.message).toContain('insufficient_currency')

    // copies locked by an open trade are not free
    await newTrade(from.client, to.userId, [{ card_id: a, count: 2 }], want)
    const locked = await propose(from.client, to.userId, [{ card_id: a, count: 1 }], want)
    expect(locked.error?.message).toContain('no_free_copy')

    expect(await currencyOf(from.userId)).toBe(50)
    expect((await inventoryOf(from.userId)).get(a)).toEqual({ count: 2, locked: 2 })
  })

  it("the proposer's locked cards can't be listed or recycled", async () => {
    const from = await newPlayer()
    const to = await newPlayer()
    const a = await cardAt(37)
    const b = await cardAt(38)
    await giveCards(from.userId, a, 2)
    await newTrade(from.client, to.userId, [{ card_id: a, count: 2 }], [{ card_id: b, count: 1 }])
    const list = await from.client.rpc('create_listing', { p_card_id: a, p_price: 10 })
    expect(list.error?.message).toContain('no_free_copy')
    const recycle = await from.client.rpc('recycle', { p_card_id: a, p_count: 1 })
    expect(recycle.error).not.toBeNull()
    expect((await inventoryOf(from.userId)).get(a)).toEqual({ count: 2, locked: 2 })
  })
})

describe('accept_trade', () => {
  it('swaps cards and currency atomically, writes trade_done ledger rows for both, notifies the proposer', async () => {
    const from = await newPlayer({ currency: 500 })
    const to = await newPlayer({ currency: 300 })
    const a = await cardAt(40)
    const b = await cardAt(80)
    const c = await cardAt(90)
    await giveCards(from.userId, a, 3)
    await giveCards(from.userId, b, 1)
    await giveCards(to.userId, c, 2)
    await giveCards(to.userId, a, 1)
    const since = new Date(Date.now() - 1000).toISOString()

    const id = await newTrade(
      from.client,
      to.userId,
      [
        { card_id: a, count: 2 },
        { card_id: b, count: 1 },
      ],
      [{ card_id: c, count: 2 }],
      100,
      70,
    )
    const { data, error } = await to.client.rpc('accept_trade', { p_id: id })
    expect(error).toBeNull()
    expect(data).toBeNull()

    const fromInv = await inventoryOf(from.userId)
    const toInv = await inventoryOf(to.userId)
    expect(fromInv.get(a)).toEqual({ count: 1, locked: 0 })
    expect(fromInv.get(b)).toEqual({ count: 0, locked: 0 })
    expect(fromInv.get(c)).toEqual({ count: 2, locked: 0 })
    expect(toInv.get(a)).toEqual({ count: 3, locked: 0 })
    expect(toInv.get(b)).toEqual({ count: 1, locked: 0 })
    expect(toInv.get(c)).toEqual({ count: 0, locked: 0 })
    expect(await currencyOf(from.userId)).toBe(500 - 100 + 70)
    expect(await currencyOf(to.userId)).toBe(300 + 100 - 70)

    const row = await tradeRow(id)
    expect(row.status).toBe('accepted')
    expect(row.closed_at).not.toBeNull()

    const ref = String(id)
    const fromLed = await ledgerOf(from.userId, 'trade_done')
    const toLed = await ledgerOf(to.userId, 'trade_done')
    expect(fromLed).toEqual(
      expect.arrayContaining([
        { kind: 'trade_done', currency_delta: 70, card_id: null, card_delta: 0, ref },
        { kind: 'trade_done', currency_delta: 0, card_id: a, card_delta: -2, ref },
        { kind: 'trade_done', currency_delta: 0, card_id: b, card_delta: -1, ref },
        { kind: 'trade_done', currency_delta: 0, card_id: c, card_delta: 2, ref },
      ]),
    )
    expect(fromLed).toHaveLength(4)
    expect(toLed).toEqual(
      expect.arrayContaining([
        { kind: 'trade_done', currency_delta: 30, card_id: null, card_delta: 0, ref },
        { kind: 'trade_done', currency_delta: 0, card_id: a, card_delta: 2, ref },
        { kind: 'trade_done', currency_delta: 0, card_id: b, card_delta: 1, ref },
        { kind: 'trade_done', currency_delta: 0, card_id: c, card_delta: -2, ref },
      ]),
    )
    expect(toLed).toHaveLength(4)

    for (const p of [from, to]) {
      const m = await admin.rpc('metric_value', { p_player: p.userId, p_metric: 'trades_done', p_since: since })
      expect(m.error).toBeNull()
      expect(m.data).toBe(1)
    }

    expect(await notesOf(from.userId)).toEqual([
      { kind: 'trade_accepted', payload: { trade_id: id, to_username: await usernameOf(to.userId) } },
    ])

    const again = await to.client.rpc('accept_trade', { p_id: id })
    expect(again.error?.message).toContain('not_open')
  })

  it('writes a currency row per player even with no currency', async () => {
    const from = await newPlayer()
    const to = await newPlayer()
    const a = await cardAt(41)
    const c = await cardAt(42)
    await giveCards(from.userId, a, 1)
    await giveCards(to.userId, c, 1)
    const id = await newTrade(from.client, to.userId, [{ card_id: a, count: 1 }], [{ card_id: c, count: 1 }])
    expect((await to.client.rpc('accept_trade', { p_id: id })).error).toBeNull()
    for (const p of [from, to]) {
      const rows = await ledgerOf(p.userId, 'trade_done')
      expect(rows).toHaveLength(3) // currency + one card out + one card in
      expect(rows.filter((r) => r.card_id === null)).toEqual([
        { kind: 'trade_done', currency_delta: 0, card_id: null, card_delta: 0, ref: String(id) },
      ])
    }
    // the new owner keeps first_at; a brand new row gets one
    const { data: inv } = await admin.from('inventory').select('first_at').eq('player_id', to.userId).eq('card_id', a)
    expect(inv![0].first_at).not.toBeNull()
  })

  it('only the recipient can accept', async () => {
    const from = await newPlayer()
    const to = await newPlayer()
    const third = await newPlayer()
    const a = await cardAt(43)
    await giveCards(from.userId, a, 1)
    const id = await newTrade(from.client, to.userId, [{ card_id: a, count: 1 }], [], 0, 5)
    for (const c of [from.client, third.client]) {
      const r = await c.rpc('accept_trade', { p_id: id })
      expect(r.error?.message).toContain('not_found')
    }
    const missing = await to.client.rpc('accept_trade', { p_id: 999999999 })
    expect(missing.error?.message).toContain('not_found')
  })

  it('recipient recycled or listed the wanted card -> no_free_copy, nothing moved', async () => {
    const from = await newPlayer({ currency: 200 })
    const to = await newPlayer({ currency: 100 })
    const a = await cardAt(44)
    const c = await cardAt(45)
    await giveCards(from.userId, a, 1)
    await giveCards(to.userId, c, 3)
    const id = await newTrade(from.client, to.userId, [{ card_id: a, count: 1 }], [{ card_id: c, count: 3 }], 50, 20)

    expect((await to.client.rpc('recycle', { p_card_id: c, p_count: 1 })).error).toBeNull()
    const r1 = await to.client.rpc('accept_trade', { p_id: id })
    expect(r1.error?.message).toContain('no_free_copy')

    await giveCards(to.userId, c, 3)
    expect((await to.client.rpc('create_listing', { p_card_id: c, p_price: 10 })).error).toBeNull()
    const r2 = await to.client.rpc('accept_trade', { p_id: id })
    expect(r2.error?.message).toContain('no_free_copy')

    expect((await tradeRow(id)).status).toBe('open')
    expect((await inventoryOf(from.userId)).get(a)).toEqual({ count: 1, locked: 1 })
    expect((await inventoryOf(from.userId)).get(c)).toBeUndefined()
    expect((await inventoryOf(to.userId)).get(c)).toEqual({ count: 3, locked: 1 })
    expect((await inventoryOf(to.userId)).get(a)).toBeUndefined()
    expect(await currencyOf(from.userId)).toBe(150)
    expect(await ledgerOf(from.userId, 'trade_done')).toEqual([])
    expect(await ledgerOf(to.userId, 'trade_done')).toEqual([])
  })

  it('recipient lacks the wanted currency -> insufficient_currency, nothing moved', async () => {
    const from = await newPlayer({ currency: 0 })
    const to = await newPlayer({ currency: 99 })
    const a = await cardAt(46)
    await giveCards(from.userId, a, 1)
    const id = await newTrade(from.client, to.userId, [{ card_id: a, count: 1 }], [], 0, 100)
    const r = await to.client.rpc('accept_trade', { p_id: id })
    expect(r.error?.message).toContain('insufficient_currency')
    expect(await currencyOf(to.userId)).toBe(99)
    expect((await inventoryOf(from.userId)).get(a)).toEqual({ count: 1, locked: 1 })
    expect((await tradeRow(id)).status).toBe('open')
  })

  it('after expiry -> trade_expired and nothing moves; settlement then expires and refunds', async () => {
    const from = await newPlayer({ currency: 300 })
    const to = await newPlayer({ currency: 300 })
    const a = await cardAt(47)
    const c = await cardAt(48)
    await giveCards(from.userId, a, 2)
    await giveCards(to.userId, c, 1)
    const id = await newTrade(from.client, to.userId, [{ card_id: a, count: 2 }], [{ card_id: c, count: 1 }], 120, 0)
    await expire(id)

    const r = await to.client.rpc('accept_trade', { p_id: id })
    expect(r.error?.message).toContain('trade_expired')
    expect((await tradeRow(id)).status).toBe('open')
    expect((await inventoryOf(to.userId)).get(c)).toEqual({ count: 1, locked: 0 })
    expect((await inventoryOf(from.userId)).get(a)).toEqual({ count: 2, locked: 2 })
    expect(await currencyOf(from.userId)).toBe(180)

    const s = await admin.rpc('_settle_market', { p_now: new Date().toISOString() })
    expect(s.error).toBeNull()
    expect(s.data).toBeGreaterThanOrEqual(1)
    const row = await tradeRow(id)
    expect(row.status).toBe('expired')
    expect(row.closed_at).not.toBeNull()
    expect((await inventoryOf(from.userId)).get(a)).toEqual({ count: 2, locked: 0 })
    expect(await currencyOf(from.userId)).toBe(300)
    expect(await ledgerOf(from.userId, 'trade_refund')).toEqual([
      { kind: 'trade_refund', currency_delta: 120, card_id: null, card_delta: 0, ref: String(id) },
    ])
    expect((await notesOf(from.userId)).filter((n) => n.kind === 'trade_expired')).toEqual([
      { kind: 'trade_expired', payload: { trade_id: id } },
    ])

    // settles once
    await admin.rpc('_settle_market', { p_now: new Date().toISOString() })
    expect(await currencyOf(from.userId)).toBe(300)
    const after = await to.client.rpc('accept_trade', { p_id: id })
    expect(after.error?.message).toContain('not_open')
  })

  it('settlement leaves unexpired trades alone', async () => {
    const from = await newPlayer()
    const to = await newPlayer()
    const a = await cardAt(49)
    await giveCards(from.userId, a, 1)
    const id = await newTrade(from.client, to.userId, [{ card_id: a, count: 1 }], [], 0, 1)
    await admin.rpc('_settle_market', { p_now: new Date().toISOString() })
    expect((await tradeRow(id)).status).toBe('open')
  })

  it('accept racing cancel: exactly one wins', async () => {
    for (let round = 0; round < 3; round++) {
      const from = await newPlayer({ currency: 100 })
      const to = await newPlayer({ currency: 100 })
      const a = await cardAt(50 + round)
      const c = await cardAt(90 + round)
      await giveCards(from.userId, a, 1)
      await giveCards(to.userId, c, 1)
      const id = await newTrade(from.client, to.userId, [{ card_id: a, count: 1 }], [{ card_id: c, count: 1 }], 40, 0)
      const [acc, can] = await Promise.all([
        to.client.rpc('accept_trade', { p_id: id }),
        from.client.rpc('cancel_trade', { p_id: id }),
      ])
      expect([acc.error, can.error].filter((e) => e === null)).toHaveLength(1)
      const row = await tradeRow(id)
      if (acc.error === null) {
        expect(can.error!.message).toContain('not_open')
        expect(row.status).toBe('accepted')
        expect(await currencyOf(from.userId)).toBe(60)
        expect(await currencyOf(to.userId)).toBe(140)
      } else {
        expect(acc.error.message).toContain('not_open')
        expect(row.status).toBe('cancelled')
        expect(await currencyOf(from.userId)).toBe(100)
        expect(await currencyOf(to.userId)).toBe(100)
        expect((await inventoryOf(from.userId)).get(a)).toEqual({ count: 1, locked: 0 })
      }
    }
  })
})

describe('decline_trade / cancel_trade', () => {
  it('decline (recipient only) unlocks, refunds and notifies the proposer', async () => {
    const from = await newPlayer({ currency: 100 })
    const to = await newPlayer()
    const a = await cardAt(55)
    const c = await cardAt(56)
    await giveCards(from.userId, a, 2)
    const id = await newTrade(from.client, to.userId, [{ card_id: a, count: 2 }], [{ card_id: c, count: 1 }], 60)

    const wrong = await from.client.rpc('decline_trade', { p_id: id })
    expect(wrong.error?.message).toContain('not_found')
    const { error } = await to.client.rpc('decline_trade', { p_id: id })
    expect(error).toBeNull()
    const row = await tradeRow(id)
    expect(row.status).toBe('declined')
    expect(row.closed_at).not.toBeNull()
    expect((await inventoryOf(from.userId)).get(a)).toEqual({ count: 2, locked: 0 })
    expect(await currencyOf(from.userId)).toBe(100)
    expect(await ledgerOf(from.userId, 'trade_refund')).toEqual([
      { kind: 'trade_refund', currency_delta: 60, card_id: null, card_delta: 0, ref: String(id) },
    ])
    expect(await notesOf(from.userId)).toEqual([
      { kind: 'trade_declined', payload: { trade_id: id, to_username: await usernameOf(to.userId) } },
    ])
    const again = await to.client.rpc('decline_trade', { p_id: id })
    expect(again.error?.message).toContain('not_open')
  })

  it('cancel (proposer only) unlocks and refunds', async () => {
    const from = await newPlayer({ currency: 100 })
    const to = await newPlayer()
    const a = await cardAt(57)
    const c = await cardAt(58)
    await giveCards(from.userId, a, 1)
    const id = await newTrade(from.client, to.userId, [{ card_id: a, count: 1 }], [{ card_id: c, count: 1 }], 25)

    const wrong = await to.client.rpc('cancel_trade', { p_id: id })
    expect(wrong.error?.message).toContain('not_found')
    expect((await from.client.rpc('cancel_trade', { p_id: id })).error).toBeNull()
    expect((await tradeRow(id)).status).toBe('cancelled')
    expect((await inventoryOf(from.userId)).get(a)).toEqual({ count: 1, locked: 0 })
    expect(await currencyOf(from.userId)).toBe(100)
    expect(await ledgerOf(from.userId, 'trade_refund')).toEqual([
      { kind: 'trade_refund', currency_delta: 25, card_id: null, card_delta: 0, ref: String(id) },
    ])
    const again = await from.client.rpc('cancel_trade', { p_id: id })
    expect(again.error?.message).toContain('not_open')
    const acc = await to.client.rpc('accept_trade', { p_id: id })
    expect(acc.error?.message).toContain('not_open')
  })
})

describe('settlement isolation', () => {
  it('one failing auction or trade does not block the others', async () => {
    const seller = await newPlayer()
    const card1 = await cardAt(60)
    const card2 = await cardAt(61)
    await giveCards(seller.userId, card1, 1)
    await giveCards(seller.userId, card2, 1)
    const past = new Date(Date.now() - 60_000).toISOString()
    const auctions: number[] = []
    for (const card of [card1, card2]) {
      const { data, error } = await seller.client.rpc('create_auction', {
        p_card_id: card,
        p_start_price: 10,
        p_duration_h: 1,
      })
      if (error) throw error
      auctions.push(data as number)
    }
    await admin.from('auctions').update({ ends_at: past }).in('id', auctions)

    const from1 = await newPlayer()
    const from2 = await newPlayer()
    const to = await newPlayer()
    const t1 = await cardAt(62)
    const t2 = await cardAt(63)
    await giveCards(from1.userId, t1, 1)
    await giveCards(from2.userId, t2, 1)
    const trade1 = await newTrade(from1.client, to.userId, [{ card_id: t1, count: 1 }], [], 0, 1)
    const trade2 = await newTrade(from2.client, to.userId, [{ card_id: t2, count: 1 }], [], 0, 1)
    await expire(trade1)
    await expire(trade2)

    // corrupt the first auction and the first trade: unlocking would make `locked` negative
    await admin.from('inventory').update({ locked: 0 }).eq('player_id', seller.userId).eq('card_id', card1)
    await admin.from('inventory').update({ locked: 0 }).eq('player_id', from1.userId).eq('card_id', t1)

    const r = await admin.rpc('_settle_market', { p_now: new Date().toISOString() })
    expect(r.error).toBeNull()
    const status = async (table: string, id: number) =>
      (await admin.from(table).select('status').eq('id', id).single()).data!.status
    expect(await status('auctions', auctions[0])).toBe('open')
    expect(await status('auctions', auctions[1])).toBe('unsold')
    expect(await status('trades', trade1)).toBe('open')
    expect(await status('trades', trade2)).toBe('expired')

    // repair: the next run settles them
    await admin.from('inventory').update({ locked: 1 }).eq('player_id', seller.userId).eq('card_id', card1)
    await admin.from('inventory').update({ locked: 1 }).eq('player_id', from1.userId).eq('card_id', t1)
    await admin.rpc('_settle_market', { p_now: new Date().toISOString() })
    expect(await status('auctions', auctions[0])).toBe('unsold')
    expect(await status('trades', trade1)).toBe('expired')
  })
})

describe('visibility and reads', () => {
  it('RLS: only the two parties see a trade and its items', async () => {
    const from = await newPlayer()
    const to = await newPlayer()
    const third = await newPlayer()
    const a = await cardAt(65)
    await giveCards(from.userId, a, 1)
    const id = await newTrade(from.client, to.userId, [{ card_id: a, count: 1 }], [], 0, 3)
    for (const p of [from, to]) {
      const { data: t } = await p.client.from('trades').select('id').eq('id', id)
      expect(t).toEqual([{ id }])
      const { data: i } = await p.client.from('trade_items').select('card_id').eq('trade_id', id)
      expect(i).toEqual([{ card_id: a }])
    }
    const { data: t3 } = await third.client.from('trades').select('id').eq('id', id)
    expect(t3).toEqual([])
    const { data: i3 } = await third.client.from('trade_items').select('card_id').eq('trade_id', id)
    expect(i3).toEqual([])
  })

  it('my_trades: open and recent closed trades, newest first, with items and usernames', async () => {
    const me = await newPlayer({ currency: 100 })
    const other = await newPlayer({ currency: 100 })
    const a = await cardAt(66)
    const c = await cardAt(106)
    await giveCards(me.userId, a, 2)
    await giveCards(other.userId, c, 1)
    const sent = await newTrade(me.client, other.userId, [{ card_id: a, count: 1 }], [{ card_id: c, count: 1 }], 10, 0)
    const received = await newTrade(other.client, me.userId, [{ card_id: c, count: 1 }], [{ card_id: a, count: 1 }], 0, 5)
    const old = await newTrade(me.client, other.userId, [{ card_id: a, count: 1 }], [], 0, 1)
    expect((await me.client.rpc('cancel_trade', { p_id: old })).error).toBeNull()
    await admin
      .from('trades')
      .update({ closed_at: new Date(Date.now() - 8 * 86400_000).toISOString() })
      .eq('id', old)

    const { data, error } = await me.client.rpc('my_trades')
    expect(error).toBeNull()
    const list = data as Array<Record<string, unknown>>
    expect(list.map((t) => t.id)).toEqual([received, sent])
    const { data: card } = await admin.from('cards').select('name, number, image_url, rarity').eq('id', c).single()
    expect(list[0]).toMatchObject({
      id: received,
      direction: 'received',
      status: 'open',
      other: { id: other.userId, username: await usernameOf(other.userId) },
      give_currency: 0,
      want_currency: 5,
      give: [{ card_id: c, count: 1, ...card }],
      closed_at: null,
    })
    expect((list[0].want as unknown[])).toHaveLength(1)
    expect(list[1]).toMatchObject({ id: sent, direction: 'sent', give_currency: 10 })
    expect(typeof list[1].created_at).toBe('string')
    expect(typeof list[1].expires_at).toBe('string')

    const none = await (await newPlayer()).client.rpc('my_trades')
    expect(none.data).toEqual([])
  })

  it('player_tradable_cards: free copies of another player with card info', async () => {
    const me = await newPlayer()
    const other = await newPlayer()
    const a = await cardAt(67)
    const b = await cardAt(68)
    const c = await cardAt(69)
    await giveCards(other.userId, a, 3)
    await giveCards(other.userId, b, 1)
    await giveCards(other.userId, c, 0)
    expect((await other.client.rpc('create_listing', { p_card_id: b, p_price: 5 })).error).toBeNull()
    expect((await other.client.rpc('create_listing', { p_card_id: a, p_price: 5 })).error).toBeNull()

    const { data, error } = await me.client.rpc('player_tradable_cards', { p_player: other.userId })
    expect(error).toBeNull()
    const { data: card } = await admin
      .from('cards')
      .select('name, number, image_url, rarity, series:series_id(title)')
      .eq('id', a)
      .single()
    expect(data).toEqual([
      {
        card_id: a,
        free: 2,
        name: card!.name,
        number: card!.number,
        image_url: card!.image_url,
        rarity: card!.rarity,
        series_title: (card!.series as unknown as { title: string }).title,
      },
    ])

    const q = await me.client.rpc('player_tradable_cards', { p_player: other.userId, p_query: 'zzzz-no-match' })
    expect(q.data).toEqual([])
    const byName = await me.client.rpc('player_tradable_cards', {
      p_player: other.userId,
      p_query: card!.name.slice(0, 4),
    })
    expect((byName.data as Array<{ card_id: number }>).map((r) => r.card_id)).toContain(a)
  })

  it('reads and writes are players only; internal functions are not callable', async () => {
    const { client } = await signedInClient()
    expect((await client.rpc('my_trades')).error?.message).toContain('not_a_player')
    expect(
      (await client.rpc('player_tradable_cards', { p_player: '00000000-0000-0000-0000-000000000001' })).error?.message,
    ).toContain('not_a_player')
    const p = await propose(client, '00000000-0000-0000-0000-000000000001', [], [])
    expect(p.error?.message).toContain('not_a_player')
    const me = await newPlayer()
    expect((await me.client.rpc('_close_trade', { p_id: 1, p_status: 'cancelled' })).error).not.toBeNull()
  })
})

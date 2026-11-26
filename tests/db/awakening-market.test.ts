import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { admin, newPlayer } from './helpers'

const AW = 'test-market'
let copyIds: number[] = []

async function currencyOf(id: string) {
  const { data } = await admin.from('players').select('currency').eq('id', id).single()
  return data!.currency as number
}

async function newCopy(owner: string) {
  const { data, error } = await admin
    .from('awakening_copies')
    .insert({ awakening_id: AW, serial: 1 + Math.floor(Math.random() * 1e9), owner_id: owner, first_owner_id: owner })
    .select('id')
    .single()
  if (error) throw error
  copyIds.push(data.id as number)
  return data.id as number
}

describe('awakening market', () => {
  beforeAll(async () => {
    const { data: card } = await admin.from('cards').select('id').eq('rarity', 'legendary').order('id').limit(1).single()
    await admin.from('awakenings').upsert({
      id: AW, base_card_id: card!.id, title: 'T', form: 'F', effect: 'sun', accent: '#fff', total: 1000000, active: false,
    })
  })
  afterAll(async () => {
    if (copyIds.length) {
      await admin.from('awakening_listings').delete().in('copy_id', copyIds)
      await admin.from('awakening_copies').delete().in('id', copyIds)
    }
    await admin.from('awakenings').delete().eq('id', AW)
  })

  it('list then buy moves owner and currency with a 5% fee', async () => {
    const seller = await newPlayer({ currency: 0 })
    const buyer = await newPlayer({ currency: 1000 })
    const copy = await newCopy(seller.userId)
    const { data: listing, error } = await seller.client.rpc('list_awakening', { p_copy: copy, p_price: 400 })
    expect(error).toBeNull()

    const market = await buyer.client.rpc('awakening_market')
    expect((market.data as { listingId: number }[]).some((l) => l.listingId === listing)).toBe(true)

    const buy = await buyer.client.rpc('buy_awakening', { p_listing: listing })
    expect(buy.error).toBeNull()
    const { data: c } = await admin.from('awakening_copies').select('owner_id, first_owner_id').eq('id', copy).single()
    expect(c!.owner_id).toBe(buyer.userId)
    expect(c!.first_owner_id).toBe(seller.userId)
    expect(await currencyOf(buyer.userId)).toBe(600)
    expect(await currencyOf(seller.userId)).toBe(380)
    const { data: led } = await admin.from('ledger').select('kind, currency_delta, player_id').eq('ref', String(listing)).in('kind', ['awakening_buy', 'awakening_sale'])
    expect(led!.map((r) => r.kind).sort()).toEqual(['awakening_buy', 'awakening_sale'])
    expect(led!.find((r) => r.kind === 'awakening_buy')).toMatchObject({ player_id: buyer.userId, currency_delta: -400 })
    expect(led!.find((r) => r.kind === 'awakening_sale')).toMatchObject({ player_id: seller.userId, currency_delta: 380 })

    const mine = await buyer.client.rpc('my_awakenings')
    expect((mine.data as { copyId: number }[]).map((r) => r.copyId)).toContain(copy)
  })

  it('rejects a double list, wrong owner and bad price', async () => {
    const seller = await newPlayer()
    const other = await newPlayer()
    const copy = await newCopy(seller.userId)
    expect((await seller.client.rpc('list_awakening', { p_copy: copy, p_price: 0 })).error?.message).toContain('bad_price')
    expect((await other.client.rpc('list_awakening', { p_copy: copy, p_price: 10 })).error?.message).toContain('not_owner')
    expect((await seller.client.rpc('list_awakening', { p_copy: copy, p_price: 10 })).error).toBeNull()
    expect((await seller.client.rpc('list_awakening', { p_copy: copy, p_price: 10 })).error?.message).toContain('already_listed')
  })

  it('rejects buying your own listing and a cancelled listing', async () => {
    const seller = await newPlayer()
    const buyer = await newPlayer({ currency: 1000 })
    const copy = await newCopy(seller.userId)
    const { data: listing } = await seller.client.rpc('list_awakening', { p_copy: copy, p_price: 100 })
    expect((await seller.client.rpc('buy_awakening', { p_listing: listing })).error?.message).toContain('own_listing')
    expect((await buyer.client.rpc('cancel_awakening_listing', { p_listing: listing })).error?.message).toContain('not_seller')
    expect((await seller.client.rpc('cancel_awakening_listing', { p_listing: listing })).error).toBeNull()
    expect((await seller.client.rpc('cancel_awakening_listing', { p_listing: listing })).error?.message).toContain('listing_closed')
    expect((await buyer.client.rpc('buy_awakening', { p_listing: listing })).error?.message).toContain('listing_closed')
  })

  it('rejects a buyer without enough currency', async () => {
    const seller = await newPlayer()
    const buyer = await newPlayer({ currency: 5 })
    const copy = await newCopy(seller.userId)
    const { data: listing } = await seller.client.rpc('list_awakening', { p_copy: copy, p_price: 100 })
    expect((await buyer.client.rpc('buy_awakening', { p_listing: listing })).error?.message).toContain('not_enough_currency')
  })

  it('allows relisting after a cancel', async () => {
    const seller = await newPlayer()
    const copy = await newCopy(seller.userId)
    const { data: first } = await seller.client.rpc('list_awakening', { p_copy: copy, p_price: 50 })
    await seller.client.rpc('cancel_awakening_listing', { p_listing: first })
    const again = await seller.client.rpc('list_awakening', { p_copy: copy, p_price: 60 })
    expect(again.error).toBeNull()
    expect(again.data).not.toBe(first)
  })

  it('buy and cancel racing: exactly one wins, no deadlock', async () => {
    for (let i = 0; i < 5; i++) {
      const seller = await newPlayer()
      const buyer = await newPlayer({ currency: 1000 })
      const copy = await newCopy(seller.userId)
      const { data: listing } = await seller.client.rpc('list_awakening', { p_copy: copy, p_price: 100 })
      const [b, c] = await Promise.all([
        buyer.client.rpc('buy_awakening', { p_listing: listing }),
        seller.client.rpc('cancel_awakening_listing', { p_listing: listing }),
      ])
      for (const r of [b, c]) expect(r.error?.code).not.toBe('40P01')
      expect([b.error, c.error].filter((e) => e === null).length).toBe(1)
      const { data: l } = await admin.from('awakening_listings').select('status').eq('id', listing).single()
      const { data: cp } = await admin.from('awakening_copies').select('owner_id').eq('id', copy).single()
      if (b.error === null) {
        expect(l!.status).toBe('sold')
        expect(cp!.owner_id).toBe(buyer.userId)
      } else {
        expect(l!.status).toBe('cancelled')
        expect(cp!.owner_id).toBe(seller.userId)
        expect(await currencyOf(buyer.userId)).toBe(1000)
      }
    }
  }, 60_000) // five rounds of two new players against the hosted test DB

  it('rebirth noSales is false while an awakening is listed', async () => {
    const seller = await newPlayer()
    const copy = await newCopy(seller.userId)
    const before = await seller.client.rpc('rebirth_status')
    expect(before.data.checks.noSales).toBe(true)
    await seller.client.rpc('list_awakening', { p_copy: copy, p_price: 10 })
    const after = await seller.client.rpc('rebirth_status')
    expect(after.data.checks.noSales).toBe(false)
  })
})

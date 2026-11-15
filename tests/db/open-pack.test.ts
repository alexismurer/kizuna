import { describe, it, expect } from 'vitest'
import { admin, newPlayer } from './helpers'

const ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic']
const rank = (r: string) => ORDER.indexOf(r)

type Row = { slot: number; card_id: number; rarity: string; is_new: boolean }

async function openAs(userId: string, pack: string, rng: number[] | null = null) {
  return admin.rpc('_open_pack', {
    p_player: userId,
    p_pack: pack,
    p_now: new Date().toISOString(),
    p_rng: rng,
  })
}

async function player(userId: string) {
  const { data, error } = await admin.from('players').select('*').eq('id', userId).single()
  if (error) throw error
  return data
}

async function popularityOf(cardIds: number[]) {
  const { data, error } = await admin.from('cards').select('id, popularity_rank').in('id', cardIds)
  if (error) throw error
  return new Map(data!.map((c) => [c.id as number, c.popularity_rank as number]))
}

describe('open_pack', () => {
  it('opens a free mix pack', async () => {
    const { userId, client } = await newPlayer()
    const { data, error } = await client.rpc('open_pack', { p_pack: 'mix' })
    expect(error).toBeNull()
    const rows = data as Row[]
    expect(rows.map((r) => r.slot)).toEqual([1, 2, 3, 4, 5])
    expect(rank(rows[3].rarity)).toBeGreaterThanOrEqual(rank('uncommon'))
    expect(rank(rows[4].rarity)).toBeGreaterThanOrEqual(rank('rare'))
    expect((await player(userId)).free_stock).toBe(9)

    const { data: inv } = await admin.from('inventory').select('count').eq('player_id', userId)
    expect(inv!.reduce((a, r) => a + (r.count as number), 0)).toBe(5)
    const { data: ledger } = await admin.from('ledger').select('*').eq('player_id', userId)
    expect(ledger).toHaveLength(5)
    expect(ledger!.every((l) => l.kind === 'pack_open' && l.card_delta === 1)).toBe(true)
    const { data: openings } = await admin.from('pack_openings').select('*').eq('player_id', userId)
    expect(openings).toHaveLength(1)
  })

  it('rejects when no free boosters', async () => {
    const { client } = await newPlayer({ freeStock: 0 })
    const { error } = await client.rpc('open_pack', { p_pack: 'mix' })
    expect(error?.message).toContain('no_free_boosters')
  })

  it('rejects a shop pack without enough currency', async () => {
    const { client } = await newPlayer({ currency: 99 })
    const { error } = await client.rpc('open_pack', { p_pack: 'mini' })
    expect(error?.message).toContain('insufficient_currency')
  })

  it('buys a shop pack', async () => {
    const { userId, client } = await newPlayer({ currency: 100 })
    const { data, error } = await client.rpc('open_pack', { p_pack: 'mini' })
    expect(error).toBeNull()
    expect(data).toHaveLength(3)
    const p = await player(userId)
    expect(p.currency).toBe(0)
    expect(p.free_stock).toBe(10)
    const { data: ledger } = await admin.from('ledger').select('*').eq('player_id', userId)
    expect(ledger).toHaveLength(4)
    expect(ledger!.filter((l) => l.currency_delta === -100)).toHaveLength(1)
  })

  it('every 10th standard booster has an epic+ slot 5', async () => {
    const { userId } = await newPlayer({ standardOpened: 9 })
    const { data, error } = await openAs(userId, 'mix', [0.5, ...Array(10).fill(0)])
    expect(error).toBeNull()
    const rows = data as Row[]
    expect(rows.slice(0, 3).map((r) => r.rarity)).toEqual(['common', 'common', 'common'])
    expect(rows[3].rarity).toBe('uncommon')
    expect(rows[4].rarity).toBe('epic')
    expect((await player(userId)).standard_opened).toBe(10)
  })

  it('marks cards new only when the player had none before the pack', async () => {
    const { userId } = await newPlayer()
    const rng = [0.5, ...Array(10).fill(0)]
    const first = (await openAs(userId, 'mix', rng)).data as Row[]
    expect(first[0].card_id).toBe(first[1].card_id)
    expect(first.every((r) => r.is_new)).toBe(true)
    const second = (await openAs(userId, 'mix', rng)).data as Row[]
    expect(second.every((r) => !r.is_new)).toBe(true)
    const inv = await admin.from('inventory').select('count').eq('player_id', userId).eq('card_id', first[0].card_id).single()
    expect(inv.data!.count).toBe(6)
  })

  it('pity forces a mythic on the 250th booster and resets', async () => {
    const { userId } = await newPlayer({ pity: 249 })
    const { data, error } = await openAs(userId, 'mix', [0.5])
    expect(error).toBeNull()
    expect((data as Row[])[4].rarity).toBe('mythic')
    expect((await player(userId)).pity).toBe(0)
  })

  it('increments pity without a mythic', async () => {
    const { userId } = await newPlayer({ pity: 5 })
    const { error } = await openAs(userId, 'mix', [0.5, ...Array(10).fill(0)])
    expect(error).toBeNull()
    expect((await player(userId)).pity).toBe(6)
  })

  it('divine booster is all epic+ with a mythic', async () => {
    const { userId } = await newPlayer()
    const { data, error } = await openAs(userId, 'mix', [0.0001])
    expect(error).toBeNull()
    const rows = data as Row[]
    expect(rows.every((r) => rank(r.rarity) >= rank('epic'))).toBe(true)
    expect(rows.some((r) => r.rarity === 'mythic')).toBe(true)
  })

  it('themed pack only draws from its theme', async () => {
    const { userId } = await newPlayer()
    const { data, error } = await openAs(userId, 'female', [0.5, ...Array(10).fill(0.99999)])
    expect(error).toBeNull()
    const rows = data as Row[]
    expect(rows.every((r) => r.rarity === 'mythic')).toBe(true)
    const ranks = await popularityOf(rows.map((r) => r.card_id))
    for (const r of rows) expect(ranks.get(r.card_id)! % 2).toBe(1)
  })

  it('falls back to another rarity when the pool has none of the rolled one', async () => {
    const { data: commons } = await admin.from('cards').select('id').eq('rarity', 'common')
    const links = commons!.map((c) => ({ card_id: c.id, theme_id: 'isekai' }))
    const ins = await admin.from('card_themes').insert(links)
    expect(ins.error).toBeNull()
    try {
      const { userId } = await newPlayer()
      const { data, error } = await openAs(userId, 'isekai', [0.5, ...Array(10).fill(0.99999)])
      expect(error).toBeNull()
      const rows = data as Row[]
      expect(rows).toHaveLength(5)
      expect(rows.every((r) => r.rarity === 'common')).toBe(true)
    } finally {
      await admin.from('card_themes').delete().eq('theme_id', 'isekai')
    }
  })

  it('serialises parallel opens so stock is never over-spent', async () => {
    const { userId, client } = await newPlayer({ freeStock: 2 })
    const results = await Promise.all([1, 2, 3].map(() => client.rpc('open_pack', { p_pack: 'mix' })))
    expect(results.filter((r) => r.error === null)).toHaveLength(2)
    expect(results.filter((r) => r.error?.message.includes('no_free_boosters'))).toHaveLength(1)
    expect((await player(userId)).free_stock).toBe(0)
  })

  it('rejects a pack whose pool is empty', async () => {
    const { client } = await newPlayer({ currency: 1000 })
    const { error } = await client.rpc('open_pack', { p_pack: 'deep_cuts' })
    expect(error?.message).toContain('pack_unavailable')
  })

  it('rejects an unknown pack', async () => {
    const { client } = await newPlayer()
    const { error } = await client.rpc('open_pack', { p_pack: 'nope' })
    expect(error?.message).toContain('pack_unavailable')
  })

  it('is not callable directly by players', async () => {
    const { userId, client } = await newPlayer()
    const { error } = await client.rpc('_open_pack', {
      p_player: userId,
      p_pack: 'mix',
      p_now: new Date().toISOString(),
      p_rng: null,
    })
    expect(error).not.toBeNull()
  })
})

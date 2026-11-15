import { describe, it, expect } from 'vitest'
import { admin, newPlayer, setPlayer } from './helpers'

const ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic']
const rank = (r: string) => ORDER.indexOf(r)

type Row = { slot: number; card_id: number; rarity: string; is_new: boolean }

async function player(userId: string) {
  const { data, error } = await admin.from('players').select('*').eq('id', userId).single()
  if (error) throw error
  return data
}

async function grant(userId: string, pack: string, count: number) {
  const { error } = await admin.rpc('_grant_pack', { p_player: userId, p_pack: pack, p_count: count })
  if (error) throw error
}

async function granted(userId: string, pack: string): Promise<number> {
  const { data, error } = await admin
    .from('granted_packs')
    .select('count')
    .eq('player_id', userId)
    .eq('pack_type_id', pack)
    .maybeSingle()
  if (error) throw error
  return (data?.count as number | undefined) ?? 0
}

function openAs(userId: string, pack: string, rng: number[] | null = null) {
  return admin.rpc('_open_pack', {
    p_player: userId,
    p_pack: pack,
    p_now: new Date().toISOString(),
    p_rng: rng,
  })
}

// divine roll, then (rarity, card) per slot; all zeros = lowest rarity allowed by the floor
const commonRolls = (slots: number) => [0.5, ...Array(slots * 2).fill(0)]

describe('_grant_pack', () => {
  it('adds to the count and writes a pack_grant ledger row', async () => {
    const { userId } = await newPlayer()
    await grant(userId, 'chest', 1)
    await grant(userId, 'chest', 2)
    expect(await granted(userId, 'chest')).toBe(3)
    const { data: led } = await admin.from('ledger').select('kind, ref, currency_delta').eq('player_id', userId)
    expect(led).toEqual([
      { kind: 'pack_grant', ref: 'chest', currency_delta: 0 },
      { kind: 'pack_grant', ref: 'chest', currency_delta: 0 },
    ])
  })

  it('is not callable by players', async () => {
    const { userId, client } = await newPlayer()
    const { error } = await client.rpc('_grant_pack', { p_player: userId, p_pack: 'chest', p_count: 1 })
    expect(error).not.toBeNull()
  })
})

describe('opening a granted pack', () => {
  it('costs nothing, decrements the count and leaves pity/golden counters', async () => {
    const { userId, client } = await newPlayer({ currency: 1000, standardOpened: 3, pity: 40 })
    await grant(userId, 'chest', 2)
    const { data, error } = await client.rpc('open_pack', { p_pack: 'chest' })
    expect(error).toBeNull()
    expect(data).toHaveLength(20)
    const p = await player(userId)
    expect(p.currency).toBe(1000)
    expect(p.standard_opened).toBe(3)
    expect(p.pity).toBe(40)
    expect(await granted(userId, 'chest')).toBe(1)
    const { data: led } = await admin.from('ledger').select('currency_delta').eq('player_id', userId).neq('currency_delta', 0)
    expect(led).toEqual([])
  })

  it('uses granted free packs before the free stock', async () => {
    const { userId, client } = await newPlayer({ freeStock: 10 })
    await grant(userId, 'mix', 1)
    const { error } = await client.rpc('open_pack', { p_pack: 'mix' })
    expect(error).toBeNull()
    expect((await player(userId)).free_stock).toBe(10)
    expect(await granted(userId, 'mix')).toBe(0)
  })

  it('still resets pity on a Mythic', async () => {
    const { userId } = await newPlayer({ pity: 100 })
    await grant(userId, 'mix', 1)
    const { error } = await openAs(userId, 'mix', [0, ...Array(10).fill(0)])
    expect(error).toBeNull()
    expect((await player(userId)).pity).toBe(0)
  })
})

describe('open_packs with granted packs', () => {
  it('charges 4 x 550 for a x5 chest with one granted', async () => {
    const { userId, client } = await newPlayer({ currency: 2200 })
    await grant(userId, 'chest', 1)
    const { data, error } = await client.rpc('open_packs', { p_pack: 'chest', p_count: 5, p_max_cost: 2200 })
    expect(error).toBeNull()
    expect(data).toHaveLength(100)
    const p = await player(userId)
    expect(p.currency).toBe(0)
    expect(p.standard_opened).toBe(4)
    expect(await granted(userId, 'chest')).toBe(0)
  })

  it('rejects with cost_changed below that and changes nothing', async () => {
    const { userId, client } = await newPlayer({ currency: 2200 })
    await grant(userId, 'chest', 1)
    const { error } = await client.rpc('open_packs', { p_pack: 'chest', p_count: 5, p_max_cost: 2199 })
    expect(error?.message).toContain('cost_changed')
    expect((await player(userId)).currency).toBe(2200)
    expect(await granted(userId, 'chest')).toBe(1)
    const { data: inv } = await admin.from('inventory').select('card_id').eq('player_id', userId)
    expect(inv).toEqual([])
  })

  it('counts granted, then free stock, then currency for free packs', async () => {
    const { userId, client } = await newPlayer({ freeStock: 2, currency: 300 })
    await grant(userId, 'mix', 1)
    const { error } = await client.rpc('open_packs', { p_pack: 'mix', p_count: 5, p_max_cost: 300 })
    expect(error).toBeNull()
    const p = await player(userId)
    expect(p.free_stock).toBe(0)
    expect(p.currency).toBe(0)
    expect(await granted(userId, 'mix')).toBe(0)
  })
})

describe('golden_next', () => {
  it('makes the next standard pack golden and clears the flag', async () => {
    const { userId } = await newPlayer({ standardOpened: 0 })
    await setPlayer(userId, { golden_next: true })
    const { data, error } = await openAs(userId, 'mix', commonRolls(5))
    expect(error).toBeNull()
    const rows = data as Row[]
    expect(rank(rows[4].rarity)).toBeGreaterThanOrEqual(rank('epic'))
    expect((await player(userId)).golden_next).toBe(false)
  })

  it('without the flag the same rolls give a plain slot 5', async () => {
    const { userId } = await newPlayer({ standardOpened: 0 })
    const { data } = await openAs(userId, 'mix', commonRolls(5))
    expect((data as Row[])[4].rarity).toBe('rare')
  })

  it('is not used up by a granted pack', async () => {
    const { userId } = await newPlayer({ standardOpened: 0 })
    await setPlayer(userId, { golden_next: true })
    await grant(userId, 'mix', 1)
    const { data, error } = await openAs(userId, 'mix', commonRolls(5))
    expect(error).toBeNull()
    expect((data as Row[])[4].rarity).toBe('rare')
    expect((await player(userId)).golden_next).toBe(true)
  })
})

describe('divine flag', () => {
  it('marks divine openings', async () => {
    const { userId } = await newPlayer()
    expect((await openAs(userId, 'mix', [0.0001, ...Array(10).fill(0)])).error).toBeNull()
    expect((await openAs(userId, 'mix', commonRolls(5))).error).toBeNull()
    const { data } = await admin.from('pack_openings').select('divine').eq('player_id', userId).order('id')
    expect(data).toEqual([{ divine: true }, { divine: false }])
  })
})

describe('my_status', () => {
  it('lists reward packs with a positive count and untilGolden 1 when golden_next', async () => {
    const { userId, client } = await newPlayer({ standardOpened: 2 })
    await grant(userId, 'chest', 2)
    await grant(userId, 'mix', 1)
    await admin.from('granted_packs').update({ count: 0 }).eq('player_id', userId).eq('pack_type_id', 'mix')
    let { data } = await client.rpc('my_status')
    expect(data.rewardPacks).toEqual({ chest: 2 })
    expect(data.untilGolden).toBe(8)

    await setPlayer(userId, { golden_next: true })
    ;({ data } = await client.rpc('my_status'))
    expect(data.untilGolden).toBe(1)
  })

  it('returns an empty object without reward packs', async () => {
    const { client } = await newPlayer()
    const { data } = await client.rpc('my_status')
    expect(data.rewardPacks).toEqual({})
  })
})

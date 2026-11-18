import { describe, it, expect } from 'vitest'
import { admin, newPlayer, setPlayer } from './helpers'

type Row = {
  pack_index?: number
  slot: number
  card_id: number
  rarity: string
  is_new: boolean
  golden: boolean
  divine: boolean
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

describe('reveal flags', () => {
  it('a 10th standard open is golden on its own rows only', async () => {
    const { client } = await newPlayer({ freeStock: 10, standardOpened: 0 })
    const { data, error } = await client.rpc('open_packs', { p_pack: 'mix', p_count: 10 })
    expect(error).toBeNull()
    const rows = data as Row[]
    expect(rows).toHaveLength(50)
    // a (1 in 2000) divine pack replaces the golden floor
    for (const r of rows) expect(r.golden).toBe(r.pack_index === 10 && !r.divine)
  })

  it('golden_next makes the open golden', async () => {
    const { userId } = await newPlayer({ standardOpened: 0 })
    await setPlayer(userId, { golden_next: true })
    const { data, error } = await openAs(userId, 'mix', commonRolls(5))
    expect(error).toBeNull()
    const rows = data as Row[]
    expect(rows.every((r) => r.golden && !r.divine)).toBe(true)
  })

  it('a divine roll is divine', async () => {
    const { userId } = await newPlayer({ standardOpened: 0 })
    const { data, error } = await openAs(userId, 'mix', [0, ...Array(10).fill(0)])
    expect(error).toBeNull()
    const rows = data as Row[]
    expect(rows.every((r) => r.divine && !r.golden)).toBe(true)
  })

  it('a normal open is neither', async () => {
    const { userId } = await newPlayer({ standardOpened: 0 })
    const { data, error } = await openAs(userId, 'mix', commonRolls(5))
    expect(error).toBeNull()
    const rows = data as Row[]
    expect(rows).toHaveLength(5)
    expect(rows.every((r) => !r.golden && !r.divine)).toBe(true)
  })

  it('open_pack keeps its four columns', async () => {
    const { client } = await newPlayer()
    const { data, error } = await client.rpc('open_pack', { p_pack: 'mix' })
    expect(error).toBeNull()
    expect(Object.keys((data as Row[])[0]).sort()).toEqual(['card_id', 'is_new', 'rarity', 'slot'])
  })
})

describe('new_series flag', () => {
  it('marks cards whose series the player owned no card of before the batch', async () => {
    const { userId, client } = await newPlayer({ freeStock: 10 })
    const { data: owned } = await admin.from('cards').select('id, series_id').eq('series_id', 1).limit(1)
    const { giveCards } = await import('./helpers')
    await giveCards(userId, owned![0].id as number, 1)
    const { data, error } = await client.rpc('open_packs', { p_pack: 'mix', p_count: 10 })
    expect(error).toBeNull()
    const rows = data as (Row & { new_series: boolean })[]
    const { data: cards } = await admin.from('cards').select('id, series_id').in('id', rows.map((r) => r.card_id))
    const seriesOf = new Map(cards!.map((c) => [c.id as number, c.series_id as number]))
    for (const r of rows) expect(r.new_series).toBe(seriesOf.get(r.card_id) !== 1)
  })
})

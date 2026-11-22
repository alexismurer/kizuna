import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin, newPlayer } from './helpers'

type Row = { slot: number; card_id: number; rarity: string }

// 20 throwaway series with 2 common cards each: A = first 10, B = last 10
let seriesIds: number[] = []
let cardIds: number[] = []
const players: string[] = []
const A = () => seriesIds.slice(0, 10)
const B = () => seriesIds.slice(10, 20)

async function player(opts: Parameters<typeof newPlayer>[0] = {}) {
  const p = await newPlayer(opts)
  players.push(p.userId)
  return p
}

beforeAll(async () => {
  const tag = Math.random().toString(36).slice(2, 8)
  const { data: s, error } = await admin
    .from('series')
    .insert(Array.from({ length: 20 }, (_, i) => ({ source: `custom-${tag}`, source_id: i, title: `Custom ${tag} ${i}` })))
    .select('id')
  if (error) throw error
  seriesIds = s!.map((r) => r.id as number).sort((a, b) => a - b)
  const base = 800000 + Math.floor(Math.random() * 90000)
  const { data: c, error: ce } = await admin
    .from('cards')
    .insert(
      seriesIds.flatMap((sid, i) =>
        [0, 1].map((k) => ({
          number: base + i * 2 + k,
          name: `Custom card ${i}-${k}`,
          series_id: sid,
          popularity_rank: base + i * 2 + k,
          rarity: 'common',
          pow: 1,
          aura: 1,
        })),
      ),
    )
    .select('id')
  if (ce) throw ce
  cardIds = c!.map((r) => r.id as number)
})

afterAll(async () => {
  await admin.from('player_custom_series').delete().in('player_id', players)
  await admin.from('inventory').delete().in('player_id', players)
  await admin.from('pack_openings').delete().in('player_id', players)
  await admin.from('cards').delete().in('id', cardIds)
  await admin.from('series').delete().in('id', seriesIds)
})

const currencyOf = async (id: string) =>
  (await admin.from('players').select('currency, free_stock, standard_opened').eq('id', id).single()).data!

async function seriesOf(rows: Row[]) {
  const { data } = await admin.from('cards').select('series_id').in('id', rows.map((r) => r.card_id))
  return data!.map((c) => c.series_id as number)
}

describe('custom booster', () => {
  it('first save costs 250, an edit costs 150, saving the same set costs nothing', async () => {
    const p = await player({ currency: 1000 })
    let r = await p.client.rpc('set_custom_series', { p_series: A() })
    expect(r.error).toBeNull()
    expect(r.data).toBe(750)
    r = await p.client.rpc('set_custom_series', { p_series: [...A().slice(0, 9), B()[0]] })
    expect(r.data).toBe(600)
    r = await p.client.rpc('set_custom_series', { p_series: [B()[0], ...A().slice(0, 9)].reverse() })
    expect(r.error).toBeNull()
    expect(r.data).toBe(600)
    expect((await currencyOf(p.userId)).currency).toBe(600)
  })

  it('rejects 9, 11, duplicates and unknown ids without charging', async () => {
    const p = await player({ currency: 1000 })
    for (const bad of [
      A().slice(0, 9),
      [...A(), B()[0]],
      [...A().slice(0, 9), A()[0]],
      [...A().slice(0, 9), 99999999],
    ]) {
      const r = await p.client.rpc('set_custom_series', { p_series: bad })
      expect(r.error?.message).toContain('invalid_selection')
    }
    expect((await currencyOf(p.userId)).currency).toBe(1000)
  })

  it('refuses when the player cannot pay and saves nothing', async () => {
    const p = await player({ currency: 249 })
    const r = await p.client.rpc('set_custom_series', { p_series: A() })
    expect(r.error?.message).toContain('insufficient_currency')
    const { data } = await admin.from('player_custom_series').select('series_id').eq('player_id', p.userId)
    expect(data).toHaveLength(0)
  })

  it('cannot be opened before picks are saved, and nothing is spent', async () => {
    const p = await player({ freeStock: 3 })
    const r = await admin.rpc('_open_pack', { p_player: p.userId, p_pack: 'custom', p_now: new Date().toISOString(), p_rng: null })
    expect(r.error?.message).toContain('custom_not_set')
    expect((await currencyOf(p.userId)).free_stock).toBe(3)
  })

  it('draws only from the picked series, uses free stock, then costs 175, and counts as standard', async () => {
    const p = await player({ currency: 1000, freeStock: 1 })
    await p.client.rpc('set_custom_series', { p_series: A() })
    let r = await p.client.rpc('open_packs', { p_pack: 'custom', p_count: 1 })
    expect(r.error).toBeNull()
    expect(r.data).toHaveLength(5)
    expect((await seriesOf(r.data as Row[])).every((s) => A().includes(s))).toBe(true)
    let me = await currencyOf(p.userId)
    expect(me.free_stock).toBe(0)
    expect(me.currency).toBe(750)
    expect(me.standard_opened).toBe(1)
    r = await p.client.rpc('open_packs', { p_pack: 'custom', p_count: 1 })
    expect(r.error).toBeNull()
    me = await currencyOf(p.userId)
    expect(me.currency).toBe(575)
  })

  it("two players' picks never mix", async () => {
    const a = await player({ currency: 1000, freeStock: 10 })
    const b = await player({ currency: 1000, freeStock: 10 })
    await a.client.rpc('set_custom_series', { p_series: A() })
    await b.client.rpc('set_custom_series', { p_series: B() })
    const ra = await a.client.rpc('open_packs', { p_pack: 'custom', p_count: 5 })
    const rb = await b.client.rpc('open_packs', { p_pack: 'custom', p_count: 5 })
    expect((await seriesOf(ra.data as Row[])).every((s) => A().includes(s))).toBe(true)
    expect((await seriesOf(rb.data as Row[])).every((s) => B().includes(s))).toBe(true)
  }, 15_000)

  it('a player reads their own picks only', async () => {
    const a = await player({ currency: 1000 })
    const b = await player({ currency: 1000 })
    await a.client.rpc('set_custom_series', { p_series: A() })
    await b.client.rpc('set_custom_series', { p_series: B() })
    const { data } = await a.client.from('player_custom_series').select('series_id')
    expect(data!.map((d) => d.series_id).sort((x, y) => x - y)).toEqual(A())
  })

  it('lists the series that have cards, with their card count', async () => {
    const p = await player()
    const { data, error } = await p.client.rpc('custom_series_options')
    expect(error).toBeNull()
    const mine = (data as { id: number; cards: number }[]).find((s) => s.id === A()[0])
    expect(mine?.cards).toBe(2)
  })

  it('orders the series by their most popular character', async () => {
    const p = await player()
    const { data } = await p.client.rpc('custom_series_options')
    const rows = data as { id: number; popularity: number }[]
    const ranks = rows.map((r) => r.popularity)
    expect(ranks.every((r) => typeof r === 'number')).toBe(true)
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    // seeded series hold ranks 1..120; the throwaway ones start at 800000
    expect(rows.findIndex((r) => r.id === A()[0])).toBeGreaterThan(rows.findIndex((r) => r.popularity === 1))
  })
})

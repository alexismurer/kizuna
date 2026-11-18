import { afterAll, describe, expect, it } from 'vitest'
import { admin, newPlayer } from './helpers'

type P = Awaited<ReturnType<typeof newPlayer>>
type Row = { slot: number; card_id: number; rarity: string }

async function newAdmin(): Promise<P> {
  const p = await newPlayer()
  const { error } = await admin.from('admins').insert({ player_id: p.userId })
  if (error) throw error
  return p
}

const made: string[] = []
const slug = () => {
  const s = `s${Math.random().toString(36).slice(2, 10)}`
  made.push(`season_${s}`)
  return s
}

afterAll(async () => {
  await admin.from('pack_openings').delete().in('pack_type_id', made)
  await admin.from('pack_types').delete().in('id', made)
})
const iso = (ms: number) => new Date(Date.now() + ms).toISOString()
const HOUR = 3600_000

async function season(a: P, s: string, start: string, end: string, series = [2]) {
  const { data, error } = await a.client.rpc('admin_save_seasonal', {
    p_slug: s, p_title: 'Spring', p_series_ids: series, p_starts_at: start, p_ends_at: end,
  })
  expect(error).toBeNull()
  return data as string
}

const openAt = (userId: string, pack: string, now: string) =>
  admin.rpc('_open_pack', { p_player: userId, p_pack: pack, p_now: now, p_rng: null })

describe('seasonal boosters', () => {
  it('opens inside its window: 5 cards from its series, spends free stock', async () => {
    const a = await newAdmin()
    const { userId } = await newPlayer({ freeStock: 4 })
    const id = await season(a, slug(), iso(-HOUR), iso(HOUR))
    expect(id).toMatch(/^season_/)
    const { data, error } = await openAt(userId, id, new Date().toISOString())
    expect(error).toBeNull()
    const rows = data as Row[]
    expect(rows).toHaveLength(5)
    const { data: cards } = await admin.from('cards').select('series_id').in('id', rows.map((r) => r.card_id))
    expect(cards!.every((c) => c.series_id === 2)).toBe(true)
    const { data: p } = await admin.from('players').select('free_stock').eq('id', userId).single()
    expect(p!.free_stock).toBe(3)
  })

  it('refuses before starts_at and at ends_at exactly', async () => {
    const a = await newAdmin()
    const { userId } = await newPlayer({ freeStock: 4 })
    const start = '2030-01-01T00:00:00Z'
    const end = '2030-02-01T00:00:00Z'
    const id = await season(a, slug(), start, end)
    expect((await openAt(userId, id, '2029-12-31T23:59:59Z')).error?.message).toContain('pack_unavailable')
    expect((await openAt(userId, id, end)).error?.message).toContain('pack_unavailable')
    expect((await openAt(userId, id, start)).error).toBeNull()
  })

  it('a x5 batch inside the window works', async () => {
    const a = await newAdmin()
    const p = await newPlayer({ freeStock: 10 })
    const id = await season(a, slug(), iso(-HOUR), iso(HOUR))
    const { data, error } = await p.client.rpc('open_packs', { p_pack: id, p_count: 5 })
    expect(error).toBeNull()
    expect(data).toHaveLength(25)
  })

  it('admin_save_seasonal validates input', async () => {
    const a = await newAdmin()
    const ok = { p_slug: slug(), p_title: 'T', p_series_ids: [2], p_starts_at: iso(-HOUR), p_ends_at: iso(HOUR) }
    for (const bad of [
      { p_series_ids: [] },
      { p_series_ids: [999999] },
      { p_slug: 'Bad Slug!' },
      { p_slug: 'a' },
      { p_title: '' },
      { p_ends_at: ok.p_starts_at },
      { p_ends_at: iso(-2 * HOUR) },
    ]) {
      const { error } = await a.client.rpc('admin_save_seasonal', { ...ok, ...bad })
      expect(error?.message, JSON.stringify(bad)).toContain('invalid_seasonal')
    }
  })

  it('non-admin gets not_admin from every seasonal RPC', async () => {
    const { client } = await newPlayer()
    const calls: [string, Record<string, unknown>][] = [
      ['admin_save_seasonal', { p_slug: 'abc', p_title: 'T', p_series_ids: [2], p_starts_at: iso(-HOUR), p_ends_at: iso(HOUR) }],
      ['admin_end_seasonal', { p_id: 'season_abc' }],
      ['admin_seasonals', {}],
    ]
    for (const [fn, args] of calls) {
      expect((await client.rpc(fn, args)).error?.message, fn).toContain('not_admin')
    }
  })

  it('saving the same slug twice updates one row; admin_seasonals lists it', async () => {
    const a = await newAdmin()
    const s = slug()
    const id = await season(a, s, iso(-HOUR), iso(HOUR))
    expect(await season(a, s, iso(-HOUR), iso(2 * HOUR), [1, 2])).toBe(id)
    const { data: rows } = await admin.from('pack_types').select('*').eq('id', id)
    expect(rows).toHaveLength(1)
    expect(rows![0].kind).toBe('seasonal')
    expect(rows![0].slot_floors).toEqual(['common', 'common', 'common', 'uncommon', 'rare'])
    expect(rows![0].fallback_price).toBe(150)
    const { data: list } = await a.client.rpc('admin_seasonals')
    const mine = (list as { id: string; title: string; seriesIds: number[] }[]).filter((x) => x.id === id)
    expect(mine).toHaveLength(1)
    expect(mine[0].seriesIds).toEqual([1, 2])
    expect(mine[0].title).toBe('Spring')
  })

  it('admin_end_seasonal makes it unopenable and keeps the row', async () => {
    const a = await newAdmin()
    const { userId } = await newPlayer({ freeStock: 4 })
    const id = await season(a, slug(), iso(-HOUR), iso(HOUR))
    expect((await a.client.rpc('admin_end_seasonal', { p_id: id })).error).toBeNull()
    expect((await openAt(userId, id, new Date(Date.now() + 1000).toISOString())).error?.message).toContain('pack_unavailable')
    const { data } = await admin.from('pack_types').select('id').eq('id', id)
    expect(data).toHaveLength(1)
  })
})

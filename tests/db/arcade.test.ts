import { describe, expect, it } from 'vitest'
import { admin, newPlayer } from './helpers'

type P = Awaited<ReturnType<typeof newPlayer>>

// a run as the server actions create it
async function run(p: P, game = 'twenty-one', mode: 'practice' | 'daily' = 'practice'): Promise<string> {
  const day = mode === 'daily' ? new Date().toISOString().slice(0, 10) : null
  const { data, error } = await admin.from('arcade_runs').insert({ player_id: p.userId, game, mode, day, seed: 1, state: {} }).select('id').single()
  if (error) throw error
  return data.id as string
}
const record = (id: string, score: number, stars: number, tickets: number) =>
  admin.rpc('arcade_record', { p_run: id, p_score: score, p_stars: stars, p_tickets: tickets })

describe('arcade runs', () => {
  it('records a run once and pays tickets', async () => {
    const p = await newPlayer()
    const id = await run(p)
    const { data, error } = await record(id, 60, 1, 6)
    expect(error).toBeNull()
    expect(data).toMatchObject({ earned: 6, tickets: 6, best: 60, newBest: true })
    expect((await record(id, 60, 1, 6)).error?.message).toContain('already_recorded')
  })

  it('keeps the weekly best and the first daily score', async () => {
    const p = await newPlayer()
    await record(await run(p, 'twenty-one', 'daily'), 50, 1, 0)
    await record(await run(p, 'twenty-one', 'practice'), 80, 2, 0)
    const { data } = await admin.from('arcade_scores').select('period, score').eq('player_id', p.userId).eq('game', 'twenty-one')
    const byKind = Object.fromEntries((data ?? []).map((r) => [r.period[0], r.score]))
    expect(byKind).toEqual({ w: 80, d: 50 })
  })

  it('ranks the players of the week', async () => {
    const [a, b] = await Promise.all([newPlayer(), newPlayer()])
    const game = `test-${Math.random().toString(36).slice(2, 8)}`
    await record(await run(a, game), 30, 0, 0)
    await record(await run(b, game), 90, 3, 0)
    const { data, error } = await a.client.rpc('arcade_ranking', { p_game: game })
    expect(error).toBeNull()
    const r = data as { top: { score: number }[]; me: { rank: number; score: number }; players: number }
    expect(r.top[0].score).toBe(90)
    expect(r.me).toMatchObject({ rank: 2, score: 30 })
    expect(r.players).toBe(2)
    expect((await b.client.rpc('arcade_best', { p_game: game })).data).toMatchObject({ weekBest: 90 })
  })

  it('cannot be recorded or read by players', async () => {
    const p = await newPlayer()
    const id = await run(p)
    expect((await p.client.rpc('arcade_record', { p_run: id, p_score: 999, p_stars: 3, p_tickets: 8 })).error).not.toBeNull()
    expect((await p.client.from('arcade_runs').select('id')).data ?? []).toHaveLength(0)
    expect((await p.client.rpc('arcade_cards', { p_n: 3 })).error).not.toBeNull()
  })

  it('draws random cards with art', async () => {
    const { data, error } = await admin.rpc('arcade_cards', { p_n: 5 })
    expect(error).toBeNull()
    const cards = data as { id: number; imageUrl: string; rarity: string }[]
    expect(cards).toHaveLength(5)
    expect(cards.every((c) => c.imageUrl)).toBe(true)
    const top = (await admin.rpc('arcade_cards', { p_n: 4, p_min_rarity: 'epic' })).data as { rarity: string }[]
    expect(top.every((c) => ['epic', 'legendary', 'mythic'].includes(c.rarity))).toBe(true)
  })
})

describe('one daily run a day', () => {
  it('refuses a second daily run of a game on the same day', async () => {
    const p = await newPlayer()
    await run(p, 'daily-hand', 'daily')
    await expect(run(p, 'daily-hand', 'daily')).rejects.toMatchObject({ code: '23505' })
  })
})

describe('genres and daily decks', () => {
  it('draws cards with their series genre', async () => {
    const { data: s } = await admin.from('series').select('id').limit(1).single()
    await admin.from('series').update({ genre: 'romance' }).eq('id', s!.id)
    const { data } = await admin.rpc('arcade_cards', { p_n: 500 })
    const c = (data as { seriesId: number; genre: string }[]).find((x) => x.seriesId === s!.id)
    if (c) expect(c.genre).toBe('romance')
    expect((data as { genre: string }[]).every((x) => typeof x.genre === 'string')).toBe(true)
  })

  it('keeps one deck per game and day: the first one stored wins', async () => {
    const day = '2000-01-0' + (1 + Math.floor(Math.random() * 9))
    const game = `test-${Math.random().toString(36).slice(2, 8)}`
    const a = await admin.rpc('arcade_daily_deck', { p_game: game, p_day: day, p_ids: [1, 2, 3] })
    const b = await admin.rpc('arcade_daily_deck', { p_game: game, p_day: day, p_ids: [9, 8, 7] })
    expect(a.data).toEqual([1, 2, 3])
    expect(b.data).toEqual([1, 2, 3])
  })

  it('reads cards by id, in the order asked', async () => {
    const { data: ids } = await admin.from('cards').select('id').not('image_url', 'is', null).limit(3)
    const want = ids!.map((r) => r.id).reverse()
    const { data } = await admin.rpc('arcade_cards_by_ids', { p_ids: want })
    expect((data as { id: number }[]).map((c) => c.id)).toEqual(want)
  })
})

describe('card themes for the arcade', () => {
  it('draws cards with their themes', async () => {
    const { data } = await admin.rpc('arcade_cards', { p_n: 50 })
    expect((data as { themes: unknown }[]).every((c) => Array.isArray(c.themes))).toBe(true)
  })
})

describe('expedition support', () => {
  it('pays tickets for a run without closing it, within the caps', async () => {
    const p = await newPlayer()
    const id = await run(p, 'expedition')
    expect((await admin.rpc('arcade_pay', { p_run: id, p_amount: 8, p_source: 'case' })).data).toBe(8)
    const { data: r } = await admin.from('arcade_runs').select('finished_at').eq('id', id).single()
    expect(r!.finished_at).toBeNull()
    expect((await p.client.rpc('arcade_pay', { p_run: id, p_amount: 8, p_source: 'case' })).error).not.toBeNull()
  })

  it('files progress on the weekly board, keeping the furthest', async () => {
    const p = await newPlayer()
    const id = await run(p, 'expedition')
    await admin.rpc('arcade_progress', { p_run: id, p_score: 7 })
    await admin.rpc('arcade_progress', { p_run: id, p_score: 3 })
    const { data } = await p.client.rpc('arcade_best', { p_game: 'expedition' })
    expect(data).toMatchObject({ weekBest: 7 })
  })

  it('adds experience to cards and keeps it', async () => {
    const p = await newPlayer()
    const { data: c } = await admin.from('cards').select('id').limit(2)
    const ids = c!.map((x) => x.id)
    await admin.rpc('expedition_add_xp', { p_player: p.userId, p_card_ids: ids, p_xp: 22 })
    const { data } = await admin.rpc('expedition_add_xp', { p_player: p.userId, p_card_ids: ids, p_xp: 22 })
    expect((data as { xp: number }[]).every((r) => r.xp === 44)).toBe(true)
  })

  it('searches the catalogue by name or series', async () => {
    const { data: c } = await admin.from('cards').select('name').not('image_url', 'is', null).limit(1).single()
    const p = await newPlayer()
    const { data, error } = await p.client.rpc('arcade_search_cards', { p_q: c!.name.slice(0, 4), p_rarity: null, p_limit: 20 })
    expect(error).toBeNull()
    expect((data as { name: string }[]).some((x) => x.name === c!.name)).toBe(true)
  })
})

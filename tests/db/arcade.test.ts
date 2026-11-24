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
    await record(await run(p, 'twenty-one', 'daily'), 80, 2, 0)
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

import { describe, expect, it } from 'vitest'
import { admin, newPlayer } from './helpers'

type P = Awaited<ReturnType<typeof newPlayer>>

// starts a match and backdates it, so it counts as a real (60 s+) match
async function played(p: P, mode: 'ai' | 'friend' = 'ai', ageSeconds = 120): Promise<string> {
  const { data, error } = await p.client.rpc('game_start', { p_game: 'duel', p_mode: mode })
  if (error) throw error
  await admin.from('game_matches').update({ started_at: new Date(Date.now() - ageSeconds * 1000).toISOString() }).eq('id', data)
  return data as string
}

const finish = (p: P, id: string, result: string) => p.client.rpc('game_finish', { p_match: id, p_result: result })
const tickets = async (p: P) => (await admin.from('players').select('tickets').eq('id', p.userId).single()).data!.tickets as number

describe('tickets', () => {
  it('pays by result and mode, once per match', async () => {
    const p = await newPlayer()
    const win = await played(p)
    expect((await finish(p, win, 'win')).data).toMatchObject({ earned: 10, tickets: 10 })
    expect((await finish(p, win, 'win')).error?.message).toContain('already_finished')
    expect((await finish(p, await played(p), 'loss')).data).toMatchObject({ earned: 3 })
    expect((await finish(p, await played(p, 'friend'), 'win')).data).toMatchObject({ earned: 15 })
    expect(await tickets(p)).toBe(28)
  })

  it('pays nothing for a match under a minute, or for someone else’s match', async () => {
    const [p, q] = await Promise.all([newPlayer(), newPlayer()])
    expect((await finish(p, await played(p, 'ai', 5), 'win')).data).toMatchObject({ earned: 0 })
    expect((await finish(q, await played(p), 'win')).error?.message).toContain('match_not_found')
  })

  it('caps earnings at 60 a day', async () => {
    const p = await newPlayer()
    let total = 0
    for (let i = 0; i < 5; i++) total += ((await finish(p, await played(p, 'friend'), 'win')).data as { earned: number }).earned
    expect(total).toBe(60)
    expect(await tickets(p)).toBe(60)
  })
})

describe('prize counter', () => {
  it('trades tickets for boosters or coins and refuses when short', async () => {
    const p = await newPlayer()
    await admin.from('players').update({ tickets: 200, currency: 0 }).eq('id', p.userId)
    expect((await p.client.rpc('redeem_prize', { p_prize: 'booster3' })).data).toBe(40)
    const { data: packs } = await admin.from('granted_packs').select('count').eq('player_id', p.userId).eq('pack_type_id', 'mix').single()
    expect(packs!.count).toBeGreaterThanOrEqual(3)
    expect((await p.client.rpc('redeem_prize', { p_prize: 'booster1' })).error?.message).toContain('not_enough_tickets')
    await admin.from('players').update({ tickets: 50 }).eq('id', p.userId)
    expect((await p.client.rpc('redeem_prize', { p_prize: 'coins150' })).data).toBe(0)
    const { data: me } = await admin.from('players').select('currency').eq('id', p.userId).single()
    expect(me!.currency).toBe(150)
    expect((await p.client.rpc('redeem_prize', { p_prize: 'nope' })).error?.message).toContain('unknown_prize')
  })
})

describe('boss of the week', () => {
  it('shows the boss, takes earned tickets as damage, and pays 40 to players with 30+ once it falls', async () => {
    const p = await newPlayer()
    const { data: status, error } = await p.client.rpc('game_room_status')
    expect(error).toBeNull()
    const boss = (status as { boss: { hp: number; defeated: boolean; name: string } }).boss
    expect(boss.name).toBeTruthy()
    expect((await p.client.rpc('boss_claim')).error?.message).toMatch(/boss_alive|not_enough_damage/)

    // knock it down: earn 45 tickets, then mark the boss defeated as the community would
    for (let i = 0; i < 3; i++) await finish(p, await played(p, 'friend'), 'win')
    const { data: rows } = await admin.from('bosses').select('week_start').order('week_start', { ascending: false }).limit(1)
    await admin.from('bosses').update({ defeated_at: new Date().toISOString() }).eq('week_start', rows![0].week_start)

    const before = await tickets(p)
    expect((await p.client.rpc('boss_claim')).data).toBe(before + 40)
    expect((await p.client.rpc('boss_claim')).error?.message).toContain('already_claimed')
    const after = (await p.client.rpc('game_room_status')).data as { boss: { claimed: boolean; defeated: boolean } }
    expect(after.boss).toMatchObject({ claimed: true, defeated: true })

    // a player with less than 30 damage gets nothing
    const q = await newPlayer()
    expect((await q.client.rpc('boss_claim')).error?.message).toContain('not_enough_damage')
    await admin.from('bosses').update({ defeated_at: null }).eq('week_start', rows![0].week_start)
  })
})

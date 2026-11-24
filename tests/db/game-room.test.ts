import { describe, expect, it } from 'vitest'
import { admin, newPlayer, setPlayer } from './helpers'

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
  type PrizeRow = { id: string; tier: string; kind: string; cost: number; left: number; owned: boolean }
  const counter = async (p: P) => (await p.client.rpc('prize_counter')).data as { prizes: PrizeRow[]; titleId: string | null }
  const redeem = (p: P, id: string) => p.client.rpc('redeem_prize', { p_prize: id })
  const granted = async (p: P, pack: string) =>
    ((await admin.from('granted_packs').select('count').eq('player_id', p.userId).eq('pack_type_id', pack).maybeSingle()).data?.count ?? 0) as number
  const player = async (p: P) =>
    (await admin.from('players').select('tickets, golden_next, golden_left, title_id, frame_id').eq('id', p.userId).single()).data!

  it('lists the three tiers with their limits', async () => {
    const p = await newPlayer()
    const { prizes } = await counter(p)
    expect(prizes).toHaveLength(12)
    expect(prizes.find((x) => x.id === 'legendary_booster')).toMatchObject({ tier: 'big', cost: 200, left: 1 })
    expect(prizes.find((x) => x.id === 'bonus5')).toMatchObject({ tier: 'small', cost: 30, left: 2 })
    expect(prizes.find((x) => x.id === 'frame_neon')).toMatchObject({ tier: 'medium', kind: 'frame', owned: false })
  })

  it('sells a guaranteed legendary booster once a week, again the next week', async () => {
    const p = await newPlayer()
    await setPlayer(p.userId, { tickets: 1000 })
    expect((await redeem(p, 'legendary_booster')).data).toBe(800)
    expect(await granted(p, 'prize_legendary')).toBe(1)
    expect((await redeem(p, 'legendary_booster')).error?.message).toContain('limit_reached')
    expect((await counter(p)).prizes.find((x) => x.id === 'legendary_booster')!.left).toBe(0)
    await admin.from('ticket_log').update({ created_at: new Date(Date.now() - 8 * 86400e3).toISOString() })
      .eq('player_id', p.userId).eq('source', 'prize_legendary_booster')
    expect((await redeem(p, 'legendary_booster')).data).toBe(600)
  })

  it('opens a prize booster with its guaranteed card, and never without the grant', async () => {
    const p = await newPlayer()
    await setPlayer(p.userId, { tickets: 1000 })
    await redeem(p, 'legendary_booster')
    const { data, error } = await p.client.rpc('open_packs', { p_pack: 'prize_legendary', p_count: 1 })
    expect(error).toBeNull()
    const rows = data as { rarity: string }[]
    expect(rows).toHaveLength(5)
    expect(['legendary', 'mythic']).toContain(rows[rows.length - 1].rarity)
    expect((await p.client.rpc('open_packs', { p_pack: 'prize_legendary', p_count: 1 })).error?.message).toContain('pack_unavailable')
  })

  it('adds three golden boosters, spending golden_next first', async () => {
    const p = await newPlayer({ freeStock: 10 })
    await setPlayer(p.userId, { tickets: 100, golden_next: false })
    await redeem(p, 'golden3')
    expect((await player(p)).golden_left).toBe(3)
    const open = async () => (await p.client.rpc('open_packs', { p_pack: 'mix', p_count: 1 })).data as { golden: boolean }[]
    expect((await open()).every((r) => r.golden)).toBe(true)
    expect((await player(p)).golden_left).toBe(2)
    await setPlayer(p.userId, { golden_next: true })
    await open()
    expect(await player(p)).toMatchObject({ golden_next: false, golden_left: 2 })
  })

  it('sells cosmetics once and equips only what you own', async () => {
    const p = await newPlayer()
    await setPlayer(p.userId, { tickets: 300 })
    expect((await redeem(p, 'title_ace21')).data).toBe(180)
    expect((await redeem(p, 'title_ace21')).error?.message).toContain('already_owned')
    expect((await player(p)).tickets).toBe(180)
    expect((await counter(p)).prizes.find((x) => x.id === 'title_ace21')).toMatchObject({ owned: true, left: 0 })
    expect((await p.client.rpc('equip_cosmetic', { p_kind: 'title', p_id: 'title_ace21' })).error).toBeNull()
    expect((await player(p)).title_id).toBe('title_ace21')
    expect((await p.client.rpc('equip_cosmetic', { p_kind: 'frame', p_id: 'frame_gold' })).error?.message).toContain('not_owned')
    expect((await p.client.rpc('equip_cosmetic', { p_kind: 'frame', p_id: 'title_ace21' })).error?.message).toContain('invalid_kind')
    expect((await p.client.rpc('equip_cosmetic', { p_kind: 'title', p_id: null })).error).toBeNull()
    expect((await player(p)).title_id).toBeNull()
  })

  it('gives five bonus boosters, twice a day', async () => {
    const p = await newPlayer()
    await setPlayer(p.userId, { tickets: 100 })
    const before = await granted(p, 'mix')
    await redeem(p, 'bonus5')
    await redeem(p, 'bonus5')
    expect(await granted(p, 'mix')).toBe(before + 10)
    expect((await redeem(p, 'bonus5')).error?.message).toContain('limit_reached')
  })

  it('refuses when short or unknown', async () => {
    const p = await newPlayer()
    await setPlayer(p.userId, { tickets: 10 })
    expect((await redeem(p, 'bonus5')).error?.message).toContain('not_enough_tickets')
    expect((await redeem(p, 'nope')).error?.message).toContain('unknown_prize')
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

describe('secret boss', () => {
  it('appears when the weekly boss falls, takes new tickets, and pays a golden booster', async () => {
    const p = await newPlayer()
    // this week's boss row, set so it is about to fall
    await p.client.rpc('game_room_status')
    const { data: rows } = await admin.from('bosses').select('*').order('week_start', { ascending: false }).limit(1)
    const week = rows![0].week_start as string
    const saved = rows![0]
    const status0 = (await p.client.rpc('game_room_status')).data as { boss: { damage: number } }
    await admin
      .from('bosses')
      .update({ hp: status0.boss.damage + 10, defeated_at: null, secret_at: null, secret_hp: null, secret_card_id: null, secret_defeated_at: null })
      .eq('week_start', week)

    try {
    // 15 tickets: the weekly boss falls and the secret boss appears
    await finish(p, await played(p, 'friend'), 'win')
    let s = (await p.client.rpc('game_room_status')).data as {
      boss: { defeated: boolean; hp: number }
      secret: { hp: number; damage: number; mine: number; defeated: boolean; rarity: string } | null
    }
    expect(s.boss.defeated).toBe(true)
    expect(s.secret).not.toBeNull()
    expect(s.secret!.hp).toBe(s.boss.hp * 3)
    expect(s.secret!.rarity).toBe('mythic')
    expect(s.secret!.mine).toBe(0)

    // knock the secret boss down with tickets earned after it appeared
    await admin.from('bosses').update({ secret_hp: 20 }).eq('week_start', week)
    expect((await p.client.rpc('boss_claim', { p_kind: 'secret' })).error?.message).toContain('boss_alive')
    await finish(p, await played(p, 'friend'), 'win')
    await finish(p, await played(p, 'friend'), 'win')
    s = (await p.client.rpc('game_room_status')).data as typeof s
    expect(s.secret!.defeated).toBe(true)
    expect(s.secret!.mine).toBe(30)

    await admin.from('players').update({ golden_next: false }).eq('id', p.userId)
    expect((await p.client.rpc('boss_claim', { p_kind: 'secret' })).error).toBeNull()
    const { data: me } = await admin.from('players').select('golden_next').eq('id', p.userId).single()
    expect(me!.golden_next).toBe(true)
    expect((await p.client.rpc('boss_claim', { p_kind: 'secret' })).error?.message).toContain('already_claimed')

    } finally {
    // put the week back as it was
    await admin
      .from('bosses')
      .update({ hp: saved.hp, defeated_at: saved.defeated_at, secret_at: saved.secret_at, secret_hp: saved.secret_hp, secret_card_id: saved.secret_card_id, secret_defeated_at: saved.secret_defeated_at })
      .eq('week_start', week)
    }
  })

  it('gives the weekly boss at least 1500 health', async () => {
    const p = await newPlayer()
    const s = (await p.client.rpc('game_room_status')).data as { boss: { hp: number } }
    expect(s.boss.hp).toBeGreaterThanOrEqual(1500)
  })
})

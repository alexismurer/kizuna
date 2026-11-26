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
    expect(prizes).toHaveLength(33)
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

  it('equips banners and name styles like titles and frames', async () => {
    const p = await newPlayer()
    await setPlayer(p.userId, { tickets: 700 })
    expect((await redeem(p, 'banner_dusk')).error).toBeNull()
    expect((await redeem(p, 'name_gold')).error).toBeNull()
    expect((await p.client.rpc('equip_cosmetic', { p_kind: 'banner', p_id: 'name_gold' })).error?.message).toContain('invalid_kind')
    expect((await p.client.rpc('equip_cosmetic', { p_kind: 'banner', p_id: 'banner_ink' })).error?.message).toContain('not_owned')
    expect((await p.client.rpc('equip_cosmetic', { p_kind: 'banner', p_id: 'banner_dusk' })).error).toBeNull()
    expect((await p.client.rpc('equip_cosmetic', { p_kind: 'name', p_id: 'name_gold' })).error).toBeNull()
    const row = (await admin.from('players').select('banner_id, name_id').eq('id', p.userId).single()).data
    expect(row).toEqual({ banner_id: 'banner_dusk', name_id: 'name_gold' })
    expect(await counter(p)).toMatchObject({ bannerId: 'banner_dusk', nameId: 'name_gold' })
  })

  it('adds a card of at most Epic to your collection, once a week', async () => {
    const p = await newPlayer()
    await setPlayer(p.userId, { tickets: 400 })
    expect((await redeem(p, 'wish_card')).data).toBe(250)
    const { data } = await admin.from('ledger').select('card_id, card_delta').eq('player_id', p.userId).eq('kind', 'prize_card')
    expect(data).toHaveLength(1)
    const card = (await admin.from('cards').select('rarity').eq('id', data![0].card_id).single()).data!.rarity
    expect(['common', 'uncommon', 'rare', 'epic']).toContain(card)
    expect((await redeem(p, 'wish_card')).error?.message).toContain('limit_reached')
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
  type WeeklyStatus = { boss: { name: string; mine: number; rank: number | null; chance: number; claimed: boolean; gotCard: boolean | null; top: { rank: number; me: boolean }[] } }
  const weekly = async (p: P) => ((await p.client.rpc('game_room_status')).data as WeeklyStatus).boss

  it('counts each player’s damage, ranks them, and gives the top 3 the boss card once it falls', async () => {
    const { data: rows } = await admin.from('bosses').select('*').order('week_start', { ascending: false }).limit(1)
    const week = rows![0].week_start
    await admin.from('bosses').update({ hp: 10000000, defeated_at: null, secret_at: null }).eq('week_start', week)

    const p = await newPlayer()
    expect((await p.client.rpc('boss_claim')).error?.message).toContain('boss_alive')
    for (let i = 0; i < 3; i++) await finish(p, await played(p, 'friend'), 'win')
    expect((await weekly(p)).mine).toBe(45)

    // push p to the top, then fell the boss
    await admin.from('boss_hits').update({ damage: 9000000 }).eq('week_start', week).eq('player_id', p.userId)
    const s = await weekly(p)
    expect(s).toMatchObject({ rank: 1, chance: 100 })
    expect(s.top[0]).toMatchObject({ rank: 1, me: true })
    await admin.from('bosses').update({ defeated_at: new Date().toISOString() }).eq('week_start', week)

    expect((await p.client.rpc('boss_claim')).data).toMatchObject({ rank: 1, card: true, boosters: 0 })
    expect((await p.client.rpc('boss_claim')).error?.message).toContain('already_claimed')
    const { data: inv } = await admin.from('inventory').select('count').eq('player_id', p.userId).eq('card_id', rows![0].card_id).single()
    expect(inv!.count).toBe(1)
    expect(await weekly(p)).toMatchObject({ claimed: true, gotCard: true })

    // under 30 damage: no reward
    const q = await newPlayer()
    expect((await q.client.rpc('boss_claim')).error?.message).toContain('not_enough_damage')
    await admin.from('boss_hits').delete().eq('week_start', week).eq('player_id', p.userId)
    await admin.from('bosses').update({ defeated_at: null }).eq('week_start', week)
  })

  it('keeps hitting the boss after the daily ticket cap', async () => {
    const { data: rows } = await admin.from('bosses').select('*').order('week_start', { ascending: false }).limit(1)
    const saved = rows![0]
    await admin.from('bosses').update({ hp: 10000000, defeated_at: null, secret_at: null }).eq('week_start', saved.week_start)
    const p = await newPlayer()
    for (let i = 0; i < 5; i++) await finish(p, await played(p, 'friend'), 'win')
    expect(await tickets(p)).toBe(60)
    expect((await weekly(p)).mine).toBe(75)
    await admin.from('boss_hits').delete().eq('week_start', saved.week_start).eq('player_id', p.userId)
    await admin.from('bosses').update({ hp: saved.hp, defeated_at: saved.defeated_at, secret_at: saved.secret_at }).eq('week_start', saved.week_start)
  })

  it('gives 3 bonus boosters past the top 10', async () => {
    const { data: rows } = await admin.from('bosses').select('*').order('week_start', { ascending: false }).limit(1)
    const week = rows![0].week_start
    const ahead = await Promise.all(Array.from({ length: 10 }, () => newPlayer()))
    const q = await newPlayer()
    await admin.from('boss_hits').upsert([
      ...ahead.map((a, i) => ({ week_start: week, player_id: a.userId, damage: 8000000 - i })),
      { week_start: week, player_id: q.userId, damage: 30 },
    ])
    expect(await weekly(q)).toMatchObject({ chance: 0 })
    await admin.from('bosses').update({ defeated_at: new Date().toISOString() }).eq('week_start', week)
    const r = (await q.client.rpc('boss_claim')).data as { rank: number; card: boolean; boosters: number }
    expect(r.rank).toBeGreaterThan(10)
    expect(r).toMatchObject({ card: false, boosters: 3 })
    const { data: g } = await admin.from('granted_packs').select('count').eq('player_id', q.userId).eq('pack_type_id', 'mix').single()
    expect(g!.count).toBe(3)
    await admin.from('boss_hits').delete().eq('week_start', week).in('player_id', [...ahead.map((a) => a.userId), q.userId])
    await admin.from('bosses').update({ defeated_at: null }).eq('week_start', week)
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

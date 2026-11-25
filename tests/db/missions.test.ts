import { describe, it, expect } from 'vitest'
import { admin, newPlayer } from './helpers'

type Item = { key: string; target: number; reward: number; progress: number; claimed: boolean }
type Missions = {
  day: string
  weekStart: string
  dailyResetAt: string
  weeklyResetAt: string
  streak: unknown
  first: Item[]
  daily: Item[]
  weekly: Item[]
  achievements: Item[]
  bonuses: Record<'first' | 'daily' | 'weekly', { claimed: boolean; earned: boolean }>
  claimable: number
}

const DAILY_POOL = [
  'daily_pages',
  'daily_recycle',
  'daily_open',
  'daily_pack',
  'daily_rare',
  'daily_wishlist',
  'daily_bid',
  'daily_tickets',
  'daily_games',
  'daily_challenge',
  'daily_sell',
]

async function missions(userId: string, now: string): Promise<Missions> {
  const { data, error } = await admin.rpc('_my_missions', { p_player: userId, p_now: now })
  if (error) throw error
  return data as Missions
}

function claim(userId: string, key: string, now: string) {
  return admin.rpc('_claim_mission', { p_player: userId, p_key: key, p_now: now })
}

async function dailyKeys(userId: string, day: string): Promise<string[]> {
  const { data, error } = await admin.rpc('_daily_missions', { p_player: userId, p_day: day })
  if (error) throw error
  return data as string[]
}

async function currency(userId: string): Promise<number> {
  const { data, error } = await admin.from('players').select('currency').eq('id', userId).single()
  if (error) throw error
  return data.currency as number
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

async function cardIds(filter: { rarity?: string; series?: number }, n = 1000): Promise<number[]> {
  let q = admin.from('cards').select('id').order('id').limit(n)
  if (filter.rarity) q = q.eq('rarity', filter.rarity)
  if (filter.series) q = q.eq('series_id', filter.series)
  const { data, error } = await q
  if (error) throw error
  return data!.map((c) => c.id as number)
}

async function insert(table: string, rows: Record<string, unknown>[]) {
  const { error } = await admin.from(table).insert(rows)
  if (error) throw error
}

const opening = (userId: string, at: string, cards: number[], pack = 'mix') => ({
  player_id: userId,
  pack_type_id: pack,
  card_ids: cards,
  created_at: at,
})

const view = (userId: string, at: string, ref: number) => ({
  player_id: userId,
  kind: 'view_card',
  ref: String(ref),
  created_at: at,
})

async function own(userId: string, cards: number[], firstAt: string) {
  const { error } = await admin
    .from('inventory')
    .upsert(cards.map((card_id) => ({ player_id: userId, card_id, count: 1, first_at: firstAt })), {
      onConflict: 'player_id,card_id',
    })
  if (error) throw error
}

// progress for every daily mission of the pool, at `at`
async function completeAllDailies(userId: string, at: string) {
  const [rare] = await cardIds({ rarity: 'rare' }, 1)
  const views = await cardIds({}, 3)
  await insert('pack_openings', [
    ...Array.from({ length: 4 }, () => opening(userId, at, [rare])),
    opening(userId, at, [rare], 'daily'),
  ])
  await insert('activity', [
    ...views.map((id) => view(userId, at, id)),
    { player_id: userId, kind: 'wishlist_add', ref: String(views[0]), created_at: at },
  ])
  await insert('ledger', [
    { player_id: userId, kind: 'recycle', currency_delta: 0, card_id: rare, card_delta: -10, created_at: at },
  ])
  const { data: auction, error } = await admin
    .from('auctions')
    .insert({ seller_id: userId, card_id: rare, start_price: 1, duration_h: 1, ends_at: at, status: 'cancelled' })
    .select('id')
    .single()
  if (error) throw error
  await insert('bids', [{ auction_id: auction.id, bidder_id: userId, amount: 1, created_at: at }])
  await insert('ledger', [
    { player_id: userId, kind: 'market_sale', currency_delta: 10, card_id: rare, card_delta: -1, created_at: at },
  ])
  await insert('ticket_log', [{ player_id: userId, amount: 25, source: 'duel_win', earned: true, created_at: at }])
  await insert('game_matches', [
    { player_id: userId, game: 'duel', mode: 'ai', started_at: at, finished_at: at, result: 'win' },
    { player_id: userId, game: 'duel', mode: 'ai', started_at: at, finished_at: at, result: 'loss' },
  ])
  await insert('arcade_runs', [
    { player_id: userId, game: 'daily-hand', mode: 'daily', day: at.slice(0, 10), seed: 1, started_at: at, finished_at: at },
  ])
}

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)

// first day >= from where `key` is in the player's daily set on that day and the next
async function twoDaysWith(userId: string, key: string, from: string): Promise<string> {
  for (let i = 0; i < 200; i++) {
    const d = addDays(from, i)
    if ((await dailyKeys(userId, d)).includes(key) && (await dailyKeys(userId, addDays(d, 1))).includes(key)) return d
  }
  throw new Error('no such day')
}

const item = (list: Item[], key: string) => list.find((i) => i.key === key)!

describe('claiming an achievement', () => {
  it('credits the reward once, with a ledger row', async () => {
    const { userId } = await newPlayer({ currency: 5 })
    const now = new Date().toISOString()
    const [epic] = await cardIds({ rarity: 'epic' }, 1)
    await insert('pack_openings', [opening(userId, now, [epic])])

    const first = await claim(userId, 'ach_first_epic', now)
    expect(first.error).toBeNull()
    expect(first.data).toEqual({ currency: 25, granted: null })
    expect(await currency(userId)).toBe(25)
    const { data: led } = await admin
      .from('ledger')
      .select('kind, currency_delta, ref')
      .eq('player_id', userId)
      .eq('kind', 'achievement')
    expect(led).toEqual([{ kind: 'achievement', currency_delta: 20, ref: 'ach_first_epic' }])

    const second = await claim(userId, 'ach_first_epic', now)
    expect(second.error?.message).toContain('already_claimed')
    expect(await currency(userId)).toBe(25)
    expect(item((await missions(userId, now)).achievements, 'ach_first_epic')).toEqual({
      key: 'ach_first_epic',
      target: 1,
      reward: 20,
      progress: 1,
      claimed: true,
    })
  })

  it('rejects an incomplete one with not_complete', async () => {
    const { userId } = await newPlayer()
    const now = new Date().toISOString()
    const [epic] = await cardIds({ rarity: 'epic' }, 1)
    await insert('pack_openings', [opening(userId, now, [epic])])
    const { error } = await claim(userId, 'ach_first_mythic', now)
    expect(error?.message).toContain('not_complete')
    expect(await currency(userId)).toBe(0)
  })

  it('rejects unknown keys and bonus keys', async () => {
    const { userId } = await newPlayer()
    const now = new Date().toISOString()
    expect((await claim(userId, 'nope', now)).error?.message).toContain('unknown_mission')
    expect((await claim(userId, 'daily_bonus', now)).error?.message).toContain('unknown_mission')
  })

  it('first_discord is not complete without a discord identity', async () => {
    const { userId } = await newPlayer()
    const now = new Date().toISOString()
    expect((await claim(userId, 'first_discord', now)).error?.message).toContain('not_complete')
  })

  it('credits a double claim from two tabs exactly once', async () => {
    const { userId, client } = await newPlayer()
    const results = await Promise.all([
      client.rpc('claim_mission', { p_key: 'first_username' }),
      client.rpc('claim_mission', { p_key: 'first_username' }),
    ])
    expect(results.filter((r) => r.error === null)).toHaveLength(1)
    expect(results.find((r) => r.error)?.error?.message).toContain('already_claimed')
    expect(await currency(userId)).toBe(30)
    const { data: led } = await admin.from('ledger').select('kind').eq('player_id', userId).eq('kind', 'mission')
    expect(led).toHaveLength(1)
  })

  it('is not callable by players directly', async () => {
    const { userId, client } = await newPlayer()
    const now = new Date().toISOString()
    expect((await client.rpc('_claim_mission', { p_player: userId, p_key: 'first_username', p_now: now })).error).not.toBeNull()
    expect((await client.rpc('_my_missions', { p_player: userId, p_now: now })).error).not.toBeNull()
  })
})

describe('_daily_missions', () => {
  it('is deterministic and picks 3 distinct keys from the pool', async () => {
    const { userId } = await newPlayer()
    const sets = new Set<string>()
    for (let i = 0; i < 10; i++) {
      const day = addDays('2026-01-01', i)
      const keys = await dailyKeys(userId, day)
      expect(keys).toHaveLength(3)
      expect(new Set(keys).size).toBe(3)
      for (const k of keys) expect(DAILY_POOL).toContain(k)
      expect(await dailyKeys(userId, day)).toEqual(keys)
      sets.add([...keys].sort().join())
    }
    expect(sets.size).toBeGreaterThan(1)
  })

  it('rejects a daily key that is not in today\'s set', async () => {
    const { userId } = await newPlayer()
    const now = '2026-03-10T12:00:00Z'
    await completeAllDailies(userId, '2026-03-10T11:00:00Z')
    const today = await dailyKeys(userId, '2026-03-10')
    const other = DAILY_POOL.find((k) => !today.includes(k))!
    expect((await claim(userId, other, now)).error?.message).toContain('not_today')
    expect((await missions(userId, now)).daily.map((i) => i.key).sort()).toEqual([...today].sort())
  })
})

describe('period edges (Europe/Paris)', () => {
  for (const [season, from, offsetHours] of [
    ['winter', '2026-01-05', 1],
    ['summer', '2026-06-08', 2],
  ] as const) {
    it(`${season}: a view at 23:59 counts for that day, one at 00:01 for the next`, async () => {
      const { userId } = await newPlayer()
      const day = await twoDaysWith(userId, 'daily_pages', from)
      const next = addDays(day, 1)
      const paris = (d: string, hm: string) =>
        new Date(Date.parse(`${d}T${hm}:00Z`) - offsetHours * 3600000).toISOString()
      const cards = await cardIds({}, 3)

      await insert('activity', [view(userId, paris(day, '23:59'), cards[0]), view(userId, paris(day, '23:59'), cards[1])])
      const late = await missions(userId, new Date(Date.parse(paris(day, '23:59')) + 30000).toISOString())
      expect(late.day).toBe(day)
      expect(item(late.daily, 'daily_pages').progress).toBe(2)
      expect(Date.parse(late.dailyResetAt)).toBe(Date.parse(paris(next, '00:00')))

      await insert('activity', [view(userId, paris(next, '00:01'), cards[2])])
      const early = await missions(userId, paris(next, '00:05'))
      expect(early.day).toBe(next)
      expect(item(early.daily, 'daily_pages').progress).toBe(1)
      expect(item(early.first, 'first_page').progress).toBe(1)
    })
  }

  it('reports the Paris Monday as weekStart and the next Monday as weekly reset', async () => {
    const { userId } = await newPlayer()
    // Sunday 23:30 Paris (winter) still belongs to the week starting Monday 2026-03-02
    const m = await missions(userId, '2026-03-08T22:30:00Z')
    expect(m.weekStart).toBe('2026-03-02')
    expect(Date.parse(m.weeklyResetAt)).toBe(Date.parse('2026-03-08T23:00:00Z'))
    expect((await missions(userId, '2026-03-08T23:30:00Z')).weekStart).toBe('2026-03-09')
  })
})

describe('section bonuses', () => {
  it('claiming all 3 dailies grants one mix booster, once', async () => {
    const { userId } = await newPlayer()
    const now = '2026-03-10T12:00:00Z'
    await completeAllDailies(userId, '2026-03-10T11:00:00Z')
    const keys = await dailyKeys(userId, '2026-03-10')

    const results = []
    for (const k of keys) {
      const r = await claim(userId, k, now)
      expect(r.error).toBeNull()
      results.push(r.data)
    }
    expect(results.map((r) => r.granted)).toEqual([null, null, { pack: 'mix', count: 1 }])
    expect(await currency(userId)).toBe(60)
    expect(await granted(userId, 'mix')).toBe(1)
    expect((await claim(userId, keys[2], now)).error?.message).toContain('already_claimed')
    expect(await granted(userId, 'mix')).toBe(1)

    const m = await missions(userId, now)
    expect(m.bonuses.daily).toEqual({ claimed: true, earned: true })
    expect(m.bonuses.weekly).toEqual({ claimed: false, earned: false })
    expect(m.daily.every((i) => i.claimed)).toBe(true)

    // the next day starts fresh
    const tomorrow = await missions(userId, '2026-03-11T12:00:00Z')
    expect(tomorrow.daily.every((i) => !i.claimed && i.progress === 0)).toBe(true)
    expect(tomorrow.bonuses.daily).toEqual({ claimed: false, earned: false })
  })

  it('claiming all 8 first steps grants a chest', async () => {
    const { userId } = await newPlayer()
    const now = new Date().toISOString()
    const cards = await cardIds({}, 3)
    await completeAllDailies(userId, now)
    await insert('wishlist', cards.map((card_id) => ({ player_id: userId, card_id })))
    // discord linking cannot be faked from the test client: record it as already claimed
    await insert('mission_claims', [{ player_id: userId, mission_key: 'first_discord', period: '2000-01-01' }])

    await insert('ledger', [{ player_id: userId, kind: 'custom_booster', currency_delta: -500, ref: 'new' }])

    const keys = ['first_booster', 'first_recycle', 'first_wishlist', 'first_page', 'first_username', 'first_game', 'first_custom']
    const granteds = []
    for (const k of keys) {
      const r = await claim(userId, k, now)
      expect(r.error).toBeNull()
      granteds.push(r.data.granted)
    }
    expect(granteds).toEqual([null, null, null, null, null, null, { pack: 'chest', count: 1 }])
    expect(await currency(userId)).toBe(20 * 4 + 30 + 30 + 100)
    expect(await granted(userId, 'chest')).toBe(1)
    const { data: led } = await admin.from('ledger').select('ref').eq('player_id', userId).eq('kind', 'pack_grant')
    expect(led).toEqual([{ ref: 'chest' }])
    expect((await missions(userId, now)).bonuses.first).toEqual({ claimed: true, earned: true })
  })
})

describe('weekly series_completed', () => {
  it('only counts series completed since Monday (Paris)', async () => {
    const { userId } = await newPlayer()
    const now = '2026-03-11T12:00:00Z' // Wednesday; Monday 00:00 Paris = 2026-03-08T23:00Z
    const series = await cardIds({ series: 1 })
    expect(series.length).toBeGreaterThanOrEqual(5)
    const last = series[series.length - 1]
    await own(userId, series.slice(0, -1), '2026-03-04T10:00:00Z')
    await own(userId, [last], '2026-03-08T22:30:00Z') // Sunday 23:30 Paris
    await own(userId, (await cardIds({ series: 2 })).slice(0, 4), '2026-03-10T10:00:00Z')

    let m = await missions(userId, now)
    expect(item(m.weekly, 'weekly_series').progress).toBe(0)
    expect(item(m.achievements, 'ach_series_1').progress).toBe(1)
    expect((await claim(userId, 'weekly_series', now)).error?.message).toContain('not_complete')

    await own(userId, [last], '2026-03-08T23:30:00Z') // Monday 00:30 Paris
    m = await missions(userId, now)
    expect(item(m.weekly, 'weekly_series').progress).toBe(1)
    expect((await claim(userId, 'weekly_series', now)).error).toBeNull()
    expect(await currency(userId)).toBe(200)
  })
})

describe('regressing progress', () => {
  it('an unclaimed achievement drops below target, a claimed one stays claimed', async () => {
    const now = new Date().toISOString()
    const fifty = await cardIds({}, 50)
    const a = await newPlayer()
    const b = await newPlayer()
    await own(a.userId, fifty, now)
    await own(b.userId, fifty, now)
    expect((await claim(a.userId, 'ach_own_50', now)).error).toBeNull()

    // a card leaves the collection (e.g. sold)
    for (const p of [a, b]) {
      const { error } = await admin.from('inventory').update({ count: 0 }).eq('player_id', p.userId).eq('card_id', fifty[0])
      if (error) throw error
    }

    const ma = item((await missions(a.userId, now)).achievements, 'ach_own_50')
    expect(ma).toMatchObject({ progress: 49, claimed: true })
    const mb = await missions(b.userId, now)
    expect(item(mb.achievements, 'ach_own_50')).toMatchObject({ progress: 49, claimed: false })
    expect((await claim(b.userId, 'ach_own_50', now)).error?.message).toContain('not_complete')
    expect(await currency(b.userId)).toBe(0)
  })
})

describe('my_missions', () => {
  it('counts claimable items and reports the streak', async () => {
    const { userId, client } = await newPlayer()
    const [epic] = await cardIds({ rarity: 'epic' }, 1)
    await insert('pack_openings', [opening(userId, new Date().toISOString(), [epic])])

    const { data, error } = await client.rpc('my_missions')
    expect(error).toBeNull()
    const m = data as Missions
    expect(m.streak).toMatchObject({ day: 0, claimedToday: false, loginsTotal: 0 })
    expect(m.first).toHaveLength(8)
    expect(m.daily).toHaveLength(3)
    expect(m.weekly).toHaveLength(6)
    expect(m.achievements).toHaveLength(42)
    expect(item(m.first, 'first_booster')).toEqual({ key: 'first_booster', target: 1, reward: 20, progress: 1, claimed: false })
    // first_username, first_booster, ach_first_epic
    expect(m.claimable).toBe(3)

    expect((await client.rpc('claim_mission', { p_key: 'first_username' })).error).toBeNull()
    const after = await client.rpc('my_missions')
    expect((after.data as Missions).claimable).toBe(2)
  })

  it('lets players read the mission catalog and only their own claims', async () => {
    const a = await newPlayer()
    const b = await newPlayer()
    expect((await a.client.rpc('claim_mission', { p_key: 'first_username' })).error).toBeNull()
    const { data: cat } = await b.client.from('missions').select('key')
    expect(cat!.length).toBe(8 + 11 + 6 + 42 + 3)
    const { data: claims } = await b.client.from('mission_claims').select('mission_key')
    expect(claims).toEqual([])
  })
})

describe('daily_pack without a daily pool', () => {
  it('is never picked on a day without a pool; other days keep their picks', async () => {
    const { userId } = await newPlayer()
    const days = Array.from({ length: 30 }, (_, i) => addDays('2026-01-01', i))
    const withPool = await Promise.all(days.map((d) => dailyKeys(userId, d)))
    expect(withPool.some((k) => k.includes('daily_pack'))).toBe(true)

    const { data: pools, error } = await admin.from('daily_pools').select('id, series_ids')
    if (error) throw error
    const ids = pools!.map((p) => p.id as number)
    // no series qualifies, so todays_pool() is null
    const cleared = await admin.from('daily_pools').update({ series_ids: [] }).in('id', ids)
    if (cleared.error) throw cleared.error
    try {
      for (let i = 0; i < days.length; i++) {
        const keys = await dailyKeys(userId, days[i])
        expect(keys).toHaveLength(3)
        expect(keys).not.toContain('daily_pack')
        if (!withPool[i].includes('daily_pack')) expect(keys).toEqual(withPool[i])
      }
    } finally {
      for (const p of pools!) {
        const restored = await admin.from('daily_pools').update({ series_ids: p.series_ids }).eq('id', p.id)
        if (restored.error) throw restored.error
      }
    }
  })
})

describe('pulled_* progress matches metric_value', () => {
  it('for daily, weekly and achievement periods, and claims agree', async () => {
    const { userId } = await newPlayer()
    // a Wed..Sun day in winter (Paris = UTC+1) where daily_rare is in the player's set
    let day = ''
    for (let i = 0; i < 50 && !day; i++) {
      const d = addDays('2026-01-07', i)
      const weekday = new Date(`${d}T00:00:00Z`).getUTCDay() // 0 = Sun
      if ((weekday === 0 || weekday >= 3) && (await dailyKeys(userId, d)).includes('daily_rare')) day = d
    }
    expect(day).not.toBe('')
    const weekday = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7 // 0 = Mon
    const monday = addDays(day, -weekday)
    const now = `${day}T12:00:00Z`
    const daySince = `${addDays(day, -1)}T23:00:00Z`
    const weekSince = `${addDays(monday, -1)}T23:00:00Z`

    const [legendary] = await cardIds({ rarity: 'legendary' }, 1)
    const [mythic] = await cardIds({ rarity: 'mythic' }, 1)
    const [rare] = await cardIds({ rarity: 'rare' }, 1)
    await insert('pack_openings', [
      opening(userId, `${addDays(monday, -3)}T12:00:00Z`, [legendary]), // last week (Fri)
      opening(userId, `${monday}T10:00:00Z`, [mythic]), // this week (Mon)
      opening(userId, `${day}T09:00:00Z`, [rare]), // today
    ])

    const m = await missions(userId, now)
    const cases: [Item, string, string | null][] = [
      [item(m.daily, 'daily_rare'), 'pulled_rare', daySince],
      [item(m.weekly, 'weekly_legendary'), 'pulled_legendary', weekSince],
      [item(m.weekly, 'weekly_mythic'), 'pulled_mythic', weekSince],
      [item(m.achievements, 'ach_first_legendary'), 'pulled_legendary', null],
      [item(m.achievements, 'ach_legendary_100'), 'pulled_legendary', null],
    ]
    for (const [it_, metric, since] of cases) {
      const { data, error } = await admin.rpc('metric_value', { p_player: userId, p_metric: metric, p_since: since })
      if (error) throw error
      expect(it_.progress, it_.key).toBe(Math.min(data as number, it_.target))
    }
    expect(cases.map(([i]) => i.progress)).toEqual([1, 1, 1, 1, 2])

    expect((await claim(userId, 'daily_rare', now)).error?.message).toContain('not_complete')
    expect((await claim(userId, 'weekly_legendary', now)).error).toBeNull()
    expect((await claim(userId, 'weekly_mythic', now)).error).toBeNull()
    expect((await claim(userId, 'ach_first_legendary', now)).error).toBeNull()
    expect((await claim(userId, 'ach_legendary_100', now)).error?.message).toContain('not_complete')
  })
})

describe('game room and custom booster metrics', () => {
  const metric = async (userId: string, m: string, since: string | null = null) => {
    const { data, error } = await admin.rpc('metric_value', { p_player: userId, p_metric: m, p_since: since })
    if (error) throw error
    return data as number
  }

  it('counts earned tickets, games, Duel wins, daily challenges, boss rewards and prizes', async () => {
    const { userId } = await newPlayer()
    const old = '2026-01-01T12:00:00Z'
    const now = new Date().toISOString()
    await insert('ticket_log', [
      { player_id: userId, amount: 10, source: 'duel_win', earned: true, created_at: old },
      { player_id: userId, amount: 15, source: 'arcade_memory', earned: true, created_at: now },
      { player_id: userId, amount: 40, source: 'boss', earned: false, created_at: now },
      { player_id: userId, amount: -60, source: 'prize_booster1', earned: false, created_at: now },
    ])
    await insert('game_matches', [
      { player_id: userId, game: 'duel', mode: 'ai', finished_at: now, result: 'win' },
      { player_id: userId, game: 'duel', mode: 'friend', finished_at: now, result: 'loss' },
      { player_id: userId, game: 'duel', mode: 'ai' }, // never finished
    ])
    await insert('arcade_runs', [
      { player_id: userId, game: 'memory', mode: 'practice', seed: 1, finished_at: now },
      { player_id: userId, game: 'daily-hand', mode: 'daily', day: now.slice(0, 10), seed: 1, finished_at: now },
      { player_id: userId, game: 'memory', mode: 'practice', seed: 2 }, // never finished
    ])
    const { data: boss } = await admin.from('bosses').select('week_start').limit(1)
    if (boss?.length) await insert('boss_claims', [{ week_start: boss[0].week_start, player_id: userId }])

    expect(await metric(userId, 'tickets_earned')).toBe(25)
    expect(await metric(userId, 'tickets_earned', '2026-06-01T00:00:00Z')).toBe(15)
    expect(await metric(userId, 'games_played')).toBe(4)
    expect(await metric(userId, 'duels_won')).toBe(1)
    expect(await metric(userId, 'daily_challenges')).toBe(1)
    expect(await metric(userId, 'prizes_redeemed')).toBe(1)
    expect(await metric(userId, 'boss_rewards')).toBe(boss?.length ? 1 : 0)
  })

  it('counts custom booster creations (not edits) and custom openings', async () => {
    const { userId } = await newPlayer()
    await insert('ledger', [
      { player_id: userId, kind: 'custom_booster', currency_delta: -500, ref: 'new' },
      { player_id: userId, kind: 'custom_booster', currency_delta: -150, ref: 'edit' },
    ])
    const [rare] = await cardIds({ rarity: 'rare' }, 1)
    await insert('pack_openings', [opening(userId, new Date().toISOString(), [rare], 'custom')])
    expect(await metric(userId, 'custom_created')).toBe(1)
    expect(await metric(userId, 'custom_opened')).toBe(1)
  })
})

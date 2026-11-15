import { describe, it, expect } from 'vitest'
import { admin, newPlayer, setPlayer } from './helpers'

type Claim = { claimed: boolean; day: number; reward: number; goldenNext: boolean }
type Streak = { day: number; claimedToday: boolean; rewards: number[]; forgivenThisWeek: boolean; loginsTotal: number }

// January 2027: Paris is UTC+1. Mon 4, Tue 5, Wed 6, ..., Mon 11.
const at = (day: number, time = '12:00:00') => `2027-01-${String(day).padStart(2, '0')}T${time}Z`

async function claim(userId: string, now: string): Promise<Claim> {
  const { data, error } = await admin.rpc('_claim_login', { p_player: userId, p_now: now })
  if (error) throw error
  return data as Claim
}

async function streak(userId: string, now: string): Promise<Streak> {
  const { data, error } = await admin.rpc('_my_missions', { p_player: userId, p_now: now })
  if (error) throw error
  return (data as { streak: Streak }).streak
}

async function player(userId: string) {
  const { data, error } = await admin.from('players').select('*').eq('id', userId).single()
  if (error) throw error
  return data
}

async function ledgerRows(userId: string) {
  const { data, error } = await admin.from('ledger').select('*').eq('player_id', userId).eq('kind', 'login_streak')
  if (error) throw error
  return data!
}

describe('login streak', () => {
  it('first login is day 1 for +20 and fills the streak block', async () => {
    const { userId } = await newPlayer({ currency: 0 })
    expect(await streak(userId, at(4))).toEqual({
      day: 0,
      claimedToday: false,
      rewards: [20, 30, 40, 50, 60, 80, 100],
      forgivenThisWeek: false,
      loginsTotal: 0,
    })
    expect(await claim(userId, at(4))).toEqual({ claimed: true, day: 1, reward: 20, goldenNext: false })
    expect((await player(userId)).currency).toBe(20)
    expect(await streak(userId, at(4))).toMatchObject({ day: 1, claimedToday: true, loginsTotal: 1 })
    const rows = await ledgerRows(userId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ currency_delta: 20, ref: '1' })
  })

  it('a second claim the same day does nothing', async () => {
    const { userId } = await newPlayer({ currency: 0 })
    await claim(userId, at(4, '08:00:00'))
    expect(await claim(userId, at(4, '20:00:00'))).toEqual({ claimed: false, day: 1, reward: 0, goldenNext: false })
    expect((await player(userId)).currency).toBe(20)
    expect(await ledgerRows(userId)).toHaveLength(1)
    expect((await player(userId)).logins_total).toBe(1)
  })

  it('two parallel claims credit once', async () => {
    const { userId, client } = await newPlayer({ currency: 0 })
    const results = await Promise.all([client.rpc('claim_login'), client.rpc('claim_login')])
    for (const r of results) expect(r.error).toBeNull()
    const claimed = results.filter((r) => (r.data as Claim).claimed)
    expect(claimed).toHaveLength(1)
    expect((await player(userId)).currency).toBe(20)
    expect(await ledgerRows(userId)).toHaveLength(1)
  })

  it('claim_login is not callable anonymously', async () => {
    const { createClient } = await import('@supabase/supabase-js')
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    const { error } = await anon.rpc('claim_login')
    expect(error).not.toBeNull()
  })

  it('seven consecutive days pay 380 and set golden_next; day 8 restarts at 1', async () => {
    const { userId } = await newPlayer({ currency: 0 })
    const rewards: number[] = []
    for (let d = 4; d <= 10; d++) {
      const r = await claim(userId, at(d))
      expect(r.day).toBe(d - 3)
      expect(r.goldenNext).toBe(d === 10)
      rewards.push(r.reward)
    }
    expect(rewards).toEqual([20, 30, 40, 50, 60, 80, 100])
    expect(rewards.reduce((a, b) => a + b)).toBe(380)
    const p = await player(userId)
    expect(p.currency).toBe(380)
    expect(p.golden_next).toBe(true)
    expect(p.logins_total).toBe(7)
    expect(await claim(userId, at(11))).toMatchObject({ claimed: true, day: 1, reward: 20 })
  })

  it('a gap of 2 days continues once per week and marks the week forgiven', async () => {
    const { userId } = await newPlayer({ currency: 0 })
    await claim(userId, at(4)) // Mon, day 1
    expect(await claim(userId, at(6))).toMatchObject({ day: 2, reward: 30 }) // Wed, gap 2, forgiven
    expect((await player(userId)).streak_forgiven_week).toBe('2027-01-04')
    expect(await streak(userId, at(6))).toMatchObject({ day: 2, forgivenThisWeek: true })
  })

  it('a second gap of 2 in the same week resets to day 1', async () => {
    const { userId } = await newPlayer({ currency: 0 })
    await claim(userId, at(4))
    await claim(userId, at(6)) // forgiven, day 2
    // Fri: gap 2 again; the week is already forgiven, so the page must not promise a continuation
    expect(await streak(userId, at(8))).toMatchObject({ day: 0 })
    expect(await claim(userId, at(8))).toMatchObject({ day: 1, reward: 20 })
  })

  it('a gap of 2 in the next week is forgiven again', async () => {
    const { userId } = await newPlayer({ currency: 0 })
    await claim(userId, at(4))
    await claim(userId, at(6)) // week of Jan 4 forgiven, day 2
    await claim(userId, at(7)) // day 3
    await claim(userId, at(8)) // day 4
    await claim(userId, at(9)) // day 5
    await claim(userId, at(10)) // Sun, day 6
    expect(await claim(userId, at(12))).toMatchObject({ day: 7, reward: 100 }) // Tue next week, gap 2
    expect((await player(userId)).streak_forgiven_week).toBe('2027-01-11')
  })

  it('a gap of 3 resets to day 1', async () => {
    const { userId } = await newPlayer({ currency: 0 })
    await claim(userId, at(4))
    await claim(userId, at(5))
    expect(await streak(userId, at(8))).toMatchObject({ day: 0 })
    expect(await claim(userId, at(8))).toMatchObject({ day: 1, reward: 20 })
    expect((await player(userId)).streak_forgiven_week).toBeNull()
  })

  it('shows the last claimed day while the streak is still alive', async () => {
    const { userId } = await newPlayer({ currency: 0 })
    await claim(userId, at(4))
    await claim(userId, at(5))
    expect(await streak(userId, at(6))).toMatchObject({ day: 2, claimedToday: false })
  })

  it('the day changes at Paris midnight', async () => {
    const { userId } = await newPlayer({ currency: 0 })
    await setPlayer(userId, { streak_day: 3, last_login_on: '2027-01-04' })
    // 22:59 UTC on Jan 4 is 23:59 in Paris: still the same day
    expect(await claim(userId, '2027-01-04T22:59:00Z')).toMatchObject({ claimed: false })
    // 23:01 UTC is 00:01 on Jan 5 in Paris: a new day
    expect(await claim(userId, '2027-01-04T23:01:00Z')).toMatchObject({ claimed: true, day: 4 })
  })
})

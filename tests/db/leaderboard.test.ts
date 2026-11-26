import { describe, it, expect } from 'vitest'
import { newPlayer, setPlayer, admin } from './helpers'

type Row = { rank: number; username: string; avatar: string | null; tier: number; renown: number; value: number }

async function usernameOf(id: string) {
  const { data } = await admin.from('players').select('username').eq('id', id).single()
  return data!.username as string
}

describe('leaderboard', () => {
  it('ranks by renown, excludes banned, and leaderboard_me matches the list', async () => {
    const base = 1_000_000_000 + Math.floor(Math.random() * 1_000_000)
    const a = await newPlayer()
    const b = await newPlayer()
    const banned = await newPlayer()
    await setPlayer(a.userId, { card_points: base + 500 })
    await setPlayer(b.userId, { card_points: base })
    await setPlayer(banned.userId, { card_points: base + 900, banned_at: new Date().toISOString() })
    const [ua, ub, ubanned] = await Promise.all([usernameOf(a.userId), usernameOf(b.userId), usernameOf(banned.userId)])

    const { data, error } = await a.client.rpc('leaderboard', { p_tab: 'renown' })
    expect(error).toBeNull()
    const rows = data.rows as Row[]
    const ra = rows.find((r) => r.username === ua)!
    const rb = rows.find((r) => r.username === ub)!
    expect(ra.rank).toBeLessThan(rb.rank)
    expect(ra.value).toBe(base + 500)
    expect(rows.some((r) => r.username === ubanned)).toBe(false)
    expect(data.total).toBeGreaterThanOrEqual(2)
    expect(Array.isArray(data.cohorts)).toBe(true)

    const me = await a.client.rpc('leaderboard_me', { p_tab: 'renown' })
    expect(me.error).toBeNull()
    expect(me.data.rank).toBe(ra.rank)
    const meB = await b.client.rpc('leaderboard_me', { p_tab: 'renown' })
    expect(meB.data.rank).toBe(rb.rank)
  })

  it('rebirth tab only lists tier 1+ ordered by tier', async () => {
    const hi = await newPlayer()
    const lo = await newPlayer()
    const none = await newPlayer()
    await setPlayer(hi.userId, { rebirth_tier: 999 })
    await setPlayer(lo.userId, { rebirth_tier: 998 })
    const [uh, ul, un] = await Promise.all([usernameOf(hi.userId), usernameOf(lo.userId), usernameOf(none.userId)])
    const { data } = await hi.client.rpc('leaderboard', { p_tab: 'rebirth' })
    const rows = data.rows as Row[]
    expect(rows.every((r) => r.tier >= 1)).toBe(true)
    expect(rows.find((r) => r.username === uh)!.rank).toBeLessThan(rows.find((r) => r.username === ul)!.rank)
    expect(rows.some((r) => r.username === un)).toBe(false)
    const me = await hi.client.rpc('leaderboard_me', { p_tab: 'rebirth' })
    expect(me.data.rank).toBe(rows.find((r) => r.username === uh)!.rank)
  })

  it('collection and mythics tabs rank by their own counters', async () => {
    const hi = await newPlayer()
    const lo = await newPlayer()
    const base = 1_000_000 + Math.floor(Math.random() * 1000)
    await setPlayer(hi.userId, { unique_cards: base + 5, unique_mythics: base + 5 })
    await setPlayer(lo.userId, { unique_cards: base, unique_mythics: base })
    const [uh, ul] = await Promise.all([usernameOf(hi.userId), usernameOf(lo.userId)])
    for (const tab of ['collection', 'mythics']) {
      const { data } = await hi.client.rpc('leaderboard', { p_tab: tab })
      const rows = data.rows as Row[]
      const rh = rows.find((r) => r.username === uh)!
      expect(rh.value).toBe(base + 5)
      expect(rh.rank).toBeLessThan(rows.find((r) => r.username === ul)!.rank)
      const me = await hi.client.rpc('leaderboard_me', { p_tab: tab })
      expect(me.data.rank).toBe(rh.rank)
      expect(me.data.value).toBe(base + 5)
    }
  })

  it('leaderboard_me has no rank for a banned player', async () => {
    const p = await newPlayer()
    await setPlayer(p.userId, { banned_at: new Date().toISOString() })
    const me = await p.client.rpc('leaderboard_me', { p_tab: 'renown' })
    expect(me.error).toBeNull()
    expect(me.data.rank).toBeNull()
  })

  it('p_tier filters the renown cohort', async () => {
    const p = await newPlayer()
    await setPlayer(p.userId, { rebirth_tier: 997 })
    const { data } = await p.client.rpc('leaderboard', { p_tab: 'renown', p_tier: 997 })
    expect((data.rows as Row[]).every((r) => r.tier === 997)).toBe(true)
    expect((data.rows as Row[]).length).toBeGreaterThanOrEqual(1)
  })
})

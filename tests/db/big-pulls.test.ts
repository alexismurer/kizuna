import { describe, expect, it } from 'vitest'
import { admin, newPlayer, signedInClient } from './helpers'

async function openDivine(userId: string) {
  const { data, error } = await admin.rpc('_open_pack', {
    p_player: userId,
    p_pack: 'mix',
    p_now: new Date().toISOString(),
    p_rng: [0.0001],
  })
  if (error) throw error
  return data as { card_id: number; rarity: string }[]
}

describe('recent_big_pulls', () => {
  it('shows legendary/mythic pulls with the puller username to players only', async () => {
    const a = await newPlayer()
    const rows = await openDivine(a.userId)
    const big = rows.filter((r) => r.rarity === 'legendary' || r.rarity === 'mythic')
    expect(big.length).toBeGreaterThan(0)
    const { data: me } = await admin.from('players').select('username').eq('id', a.userId).single()

    const b = await newPlayer()
    const { data, error } = await b.client.rpc('recent_big_pulls', { p_limit: 50 })
    expect(error).toBeNull()
    for (const r of data!) expect(['legendary', 'mythic']).toContain(r.rarity)
    for (const r of big) {
      expect(data!.some((d: any) => d.username === me!.username && d.card_id === r.card_id)).toBe(true)
    }

    const outsider = await signedInClient()
    const none = await outsider.client.rpc('recent_big_pulls')
    expect(none.error).toBeNull()
    expect(none.data).toHaveLength(0)
  })

  it('lists newest openings first and honours p_limit', async () => {
    const a = await newPlayer()
    await openDivine(a.userId)
    await new Promise((r) => setTimeout(r, 20))
    await openDivine(a.userId)
    const { data } = await a.client.rpc('recent_big_pulls', { p_limit: 50 })
    const times = data!.map((r: any) => Date.parse(r.pulled_at))
    expect(times.length).toBeGreaterThan(1)
    expect(times).toEqual([...times].sort((x, y) => y - x))
    expect(new Set(times).size).toBeGreaterThan(1)
    const one = await a.client.rpc('recent_big_pulls', { p_limit: 1 })
    expect(one.data).toHaveLength(1)
  })
})

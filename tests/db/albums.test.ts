import { describe, it, expect } from 'vitest'
import { admin, newPlayer, giveCards } from './helpers'

describe('my_albums', () => {
  it('counts owned cards per series with per-rarity totals', async () => {
    const { userId, client } = await newPlayer()
    const { data: cards } = await admin.from('cards').select('id, rarity, series_id').in('popularity_rank', [3, 6])
    expect(cards).toHaveLength(2)
    for (const c of cards!) await giveCards(userId, c.id, 2)
    const { data, error } = await client.from('my_albums').select('*').eq('series_id', 1).single()
    expect(error).toBeNull()
    expect(data.owned).toBe(2)
    expect(data.total).toBe(40)
    const sum = Object.values(data.by_rarity as Record<string, [number, number]>)
    expect(sum.reduce((a, [o]) => a + o, 0)).toBe(2)
    expect(sum.reduce((a, [, t]) => a + t, 0)).toBe(40)
  })

  it('isolates players and lists by_rarity keys present in the series', async () => {
    const a = await newPlayer()
    const b = await newPlayer()
    const { data: s1 } = await admin.from('cards').select('id, rarity').eq('series_id', 1)
    for (const c of s1!.slice(0, 5)) await giveCards(b.userId, c.id, 1)
    const { data: forA } = await a.client.from('my_albums').select('*').eq('series_id', 1).single()
    expect(forA.owned).toBe(0)
    const { data: forB } = await b.client.from('my_albums').select('*').eq('series_id', 1).single()
    expect(forB.owned).toBe(5)
    expect(Object.keys(forA.by_rarity).sort()).toEqual([...new Set(s1!.map((c) => c.rarity as string))].sort())
  })

  it('lists every series, with zero owned for a new player', async () => {
    const { client } = await newPlayer()
    const { data } = await client.from('my_albums').select('owned, total')
    expect(data).toHaveLength(3)
    expect(data!.every((r) => r.owned === 0 && r.total === 40)).toBe(true)
  })
})

import { describe, it, expect } from 'vitest'
import { admin, newPlayer } from './helpers'

async function someCards(n: number): Promise<number[]> {
  const { data, error } = await admin.from('cards').select('id').order('id').limit(n)
  if (error) throw error
  return data!.map((c) => c.id as number)
}

async function activityOf(userId: string, kind: string) {
  const { data, error } = await admin.from('activity').select('ref').eq('player_id', userId).eq('kind', kind)
  if (error) throw error
  return data!.map((r) => r.ref as string)
}

describe('toggle_wishlist', () => {
  it('adds then removes a card and logs the add', async () => {
    const { userId, client } = await newPlayer()
    const [card] = await someCards(1)

    const on = await client.rpc('toggle_wishlist', { p_card_id: card })
    expect(on.error).toBeNull()
    expect(on.data).toBe(true)
    const { data: rows } = await client.from('wishlist').select('card_id')
    expect(rows).toEqual([{ card_id: card }])
    expect(await activityOf(userId, 'wishlist_add')).toEqual([String(card)])

    const off = await client.rpc('toggle_wishlist', { p_card_id: card })
    expect(off.error).toBeNull()
    expect(off.data).toBe(false)
    const { data: after } = await client.from('wishlist').select('card_id')
    expect(after).toEqual([])
    expect(await activityOf(userId, 'wishlist_add')).toHaveLength(1)
  })

  it('rejects an unknown card', async () => {
    const { client } = await newPlayer()
    const { error } = await client.rpc('toggle_wishlist', { p_card_id: -1 })
    expect(error?.message).toContain('invalid_card')
  })

  it('only shows your own wishlist', async () => {
    const a = await newPlayer()
    const b = await newPlayer()
    const [card] = await someCards(1)
    await a.client.rpc('toggle_wishlist', { p_card_id: card })
    const { data } = await b.client.from('wishlist').select('card_id')
    expect(data).toEqual([])
  })
})

describe('record_card_view', () => {
  it('logs a card at most once per day', async () => {
    const { userId, client } = await newPlayer()
    const [c1, c2] = await someCards(2)
    for (const id of [c1, c1, c2]) {
      const { error } = await client.rpc('record_card_view', { p_card_id: id })
      expect(error).toBeNull()
    }
    expect((await activityOf(userId, 'view_card')).sort()).toEqual([String(c1), String(c2)].sort())
  })

  it('only shows your own activity', async () => {
    const a = await newPlayer()
    const b = await newPlayer()
    const [card] = await someCards(1)
    await a.client.rpc('record_card_view', { p_card_id: card })
    const { data } = await b.client.from('activity').select('id')
    expect(data).toEqual([])
    const { data: own } = await a.client.from('activity').select('kind')
    expect(own).toEqual([{ kind: 'view_card' }])
  })
})

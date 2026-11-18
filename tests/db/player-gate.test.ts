import { describe, expect, it } from 'vitest'
import { admin, giveCards, newPlayer, signedInClient } from './helpers'

describe('player gate', () => {
  it('a signed-in user without an invite reads no game data', async () => {
    await newPlayer() // make sure at least one player exists
    const { client } = await signedInClient()
    for (const table of ['cards', 'series', 'themes', 'card_themes', 'pack_types', 'daily_pools', 'players']) {
      const { data, error } = await client.from(table).select('*')
      expect(error, table).toBeNull()
      expect(data, table).toHaveLength(0)
    }
    const albums = await client.from('my_albums').select('*')
    expect(albums.data).toHaveLength(0)
  })

  it('a player reads the catalog but only their own players row', async () => {
    await newPlayer()
    const me = await newPlayer()
    const cards = await me.client.from('cards').select('id')
    expect(cards.error).toBeNull()
    expect(cards.data).toHaveLength(120)
    const packs = await me.client.from('pack_types').select('id').neq('kind', 'seasonal')
    expect(packs.data).toHaveLength(15)
    const players = await me.client.from('players').select('id')
    expect(players.error).toBeNull()
    expect(players.data).toEqual([{ id: me.userId }])
  })

  it('public_players lists usernames to players only', async () => {
    const other = await newPlayer()
    const me = await newPlayer()
    const { data, error } = await me.client.from('public_players').select('*')
    expect(error).toBeNull()
    expect(data!.length).toBeGreaterThanOrEqual(2)
    expect(Object.keys(data![0]).sort()).toEqual(['id', 'username'])
    expect(data!.some((p) => p.id === other.userId)).toBe(true)

    const outsider = await signedInClient()
    const hidden = await outsider.client.from('public_players').select('*')
    expect(hidden.data ?? []).toHaveLength(0)
  })

  it('deleting a player cascades to their inventory', async () => {
    const p = await newPlayer()
    await giveCards(p.userId, 1, 1)
    const del = await admin.auth.admin.deleteUser(p.userId)
    expect(del.error).toBeNull()
    const { data } = await admin.from('inventory').select('*').eq('player_id', p.userId)
    expect(data).toHaveLength(0)
  })
})

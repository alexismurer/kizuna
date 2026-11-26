import { describe, it, expect } from 'vitest'
import { admin, newPlayer, giveCards } from './helpers'

async function cardOf(rarity: string): Promise<number> {
  const { data, error } = await admin.from('cards').select('id').eq('rarity', rarity).order('id').limit(1)
  if (error) throw error
  return data![0].id as number
}

async function stats(userId: string) {
  const { data, error } = await admin
    .from('players')
    .select('card_points, unique_cards, unique_mythics')
    .eq('id', userId)
    .single()
  if (error) throw error
  return data!
}

describe('renown points trigger', () => {
  it('giving a new legendary adds 50 to card_points and 1 to unique_cards', async () => {
    const { userId } = await newPlayer()
    const before = await stats(userId)
    await giveCards(userId, await cardOf('legendary'), 1)
    const after = await stats(userId)
    expect(after.card_points - before.card_points).toBe(50)
    expect(after.unique_cards - before.unique_cards).toBe(1)
  })

  it('a second copy adds nothing', async () => {
    const { userId } = await newPlayer()
    const card = await cardOf('legendary')
    await giveCards(userId, card, 1)
    const before = await stats(userId)
    await giveCards(userId, card, 2)
    expect(await stats(userId)).toEqual(before)
  })

  it('removing the last copy subtracts it', async () => {
    const { userId } = await newPlayer()
    const card = await cardOf('legendary')
    const start = await stats(userId)
    await giveCards(userId, card, 2)
    await giveCards(userId, card, 0)
    expect(await stats(userId)).toEqual(start)

    await giveCards(userId, card, 1)
    const { error } = await admin.from('inventory').delete().eq('player_id', userId).eq('card_id', card)
    expect(error).toBeNull()
    expect(await stats(userId)).toEqual(start)
  })

  it('giving a mythic bumps unique_mythics', async () => {
    const { userId } = await newPlayer()
    const before = await stats(userId)
    await giveCards(userId, await cardOf('mythic'), 1)
    const after = await stats(userId)
    expect(after.unique_mythics - before.unique_mythics).toBe(1)
    expect(after.card_points - before.card_points).toBe(200)
  })
})

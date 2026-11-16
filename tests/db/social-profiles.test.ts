import { describe, it, expect } from 'vitest'
import { admin, giveCards, newPlayer, signedInClient } from './helpers'

type Rar = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic'
const ORDER: Rar[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic']

async function cardsOf(rarity: Rar, n: number) {
  const { data, error } = await admin
    .from('cards')
    .select('id, image_url, popularity_rank')
    .eq('rarity', rarity)
    .order('popularity_rank')
    .order('id')
    .limit(n)
  if (error) throw error
  // dev catalog may have no art; give the cards some so avatar assertions are meaningful
  for (const c of data!) {
    if (c.image_url) continue
    c.image_url = `https://img.test/${c.id}.png`
    await admin.from('cards').update({ image_url: c.image_url }).eq('id', c.id)
  }
  return data!
}

async function usernameOf(id: string) {
  const { data } = await admin.from('players').select('username').eq('id', id).single()
  return data!.username as string
}

describe('player_directory', () => {
  it('shows other players to players only', async () => {
    const a = await newPlayer()
    const b = await newPlayer()
    const { data } = await b.client.from('player_directory').select('id, username').eq('id', a.userId)
    expect(data).toEqual([{ id: a.userId, username: await usernameOf(a.userId) }])
    const outsider = await signedInClient()
    const none = await outsider.client.from('player_directory').select('id')
    expect(none.data ?? []).toEqual([])
  })

  it('avatar defaults to the rarest owned card, null with nothing', async () => {
    const a = await newPlayer()
    const viewer = await newPlayer()
    const read = async () =>
      (await viewer.client.from("player_directory").select("avatar_url").eq("id", a.userId).single()).data!.avatar_url
    expect(await read()).toBeNull()
    const [c] = await cardsOf('common', 1)
    const [e] = await cardsOf('epic', 1)
    await giveCards(a.userId, c.id, 1)
    await giveCards(a.userId, e.id, 1)
    expect(await read()).toBe(e.image_url)
  })
})

describe('set_avatar', () => {
  it('requires a copy, can choose and reset', async () => {
    const a = await newPlayer()
    const [c] = await cardsOf('common', 1)
    const [e] = await cardsOf('epic', 1)
    await giveCards(a.userId, e.id, 1)
    const bad = await a.client.rpc('set_avatar', { p_card_id: c.id })
    expect(bad.error?.message).toContain('no_copy')
    expect((await a.client.rpc('set_avatar', { p_card_id: e.id })).error).toBeNull()
    const { data } = await a.client
      .from('player_directory')
      .select('avatar_card_id, avatar_url')
      .eq('id', a.userId)
      .single()
    expect(data).toEqual({ avatar_card_id: e.id, avatar_url: e.image_url })
    expect((await a.client.rpc('set_avatar', { p_card_id: null })).error).toBeNull()
    const after = await a.client.from('player_directory').select('avatar_card_id').eq('id', a.userId).single()
    expect(after.data!.avatar_card_id).toBeNull()
  })
})

describe('set_showcase', () => {
  it('enforces limits', async () => {
    const a = await newPlayer()
    const cs = await cardsOf('common', 9)
    for (const c of cs) await giveCards(a.userId, c.id, 1)
    const ids = cs.map((c) => c.id)
    expect((await a.client.rpc('set_showcase', { p_card_ids: ids })).error?.message).toContain('invalid_showcase')
    expect((await a.client.rpc('set_showcase', { p_card_ids: [ids[0], ids[0]] })).error?.message).toContain(
      'invalid_showcase',
    )
    const [m] = await cardsOf('mythic', 1)
    expect((await a.client.rpc('set_showcase', { p_card_ids: [m.id] })).error?.message).toContain('no_copy')
    expect((await a.client.rpc('set_showcase', { p_card_ids: ids.slice(0, 8) })).error).toBeNull()
  })
})

describe('public_profile', () => {
  it('returns null for an unknown username', async () => {
    const a = await newPlayer()
    const { data, error } = await a.client.rpc('public_profile', { p_username: 'nobody-here-xyz' })
    expect(error).toBeNull()
    expect(data).toBeNull()
  })

  it('refuses non-players', async () => {
    const outsider = await signedInClient()
    const { error } = await outsider.client.rpc('public_profile', { p_username: 'x' })
    expect(error?.message).toContain('not_a_player')
  })

  it('empty player has zeros and empty arrays', async () => {
    const a = await newPlayer()
    const { count } = await admin.from('cards').select('id', { count: 'exact', head: true })
    const { data } = await a.client.rpc('public_profile', { p_username: await usernameOf(a.userId) })
    expect(data).toMatchObject({
      id: a.userId,
      avatarUrl: null,
      uniqueCards: 0,
      catalogSize: count,
      mythics: 0,
      boostersOpened: 0,
      showcase: [],
      wishlist: [],
      recentPulls: [],
      isMe: true,
      friendship: 'none',
    })
    expect(data.memberSince).toBeTruthy()
  })

  it('computes stats, default and chosen showcase, wishlist and pulls', async () => {
    const a = await newPlayer()
    const viewer = await newPlayer()
    const [m] = await cardsOf('mythic', 1)
    const legs = await cardsOf('legendary', 2)
    const eps = await cardsOf('epic', 2)
    const commons = await cardsOf('common', 6)
    const [zero] = await cardsOf('rare', 1)
    const owned = [m, ...legs, ...eps, ...commons]
    for (const c of owned) await giveCards(a.userId, c.id, 1)
    await giveCards(a.userId, zero.id, 0)

    const profile = async () =>
      (await viewer.client.rpc('public_profile', { p_username: await usernameOf(a.userId) })).data

    let p = await profile()
    expect(p.isMe).toBe(false)
    expect(p.uniqueCards).toBe(owned.length)
    expect(p.mythics).toBe(1)
    expect(p.boostersOpened).toBe(0)
    expect(p.avatarUrl).toBe(m.image_url)
    expect(p.showcase).toHaveLength(8)
    expect(p.showcase.map((c: { id: number }) => c.id)).toEqual([
      m.id,
      ...legs.map((c) => c.id),
      ...eps.map((c) => c.id),
      ...commons.slice(0, 3).map((c) => c.id),
    ])
    expect(Object.keys(p.showcase[0]).sort()).toEqual([
      'aura',
      'id',
      'imageUrl',
      'name',
      'nativeName',
      'number',
      'pow',
      'rarity',
      'seriesTitle',
    ])

    // chosen showcase keeps order
    const chosen = [commons[3].id, m.id]
    expect((await a.client.rpc('set_showcase', { p_card_ids: chosen })).error).toBeNull()
    p = await profile()
    expect(p.showcase.map((c: { id: number }) => c.id)).toEqual(chosen)
    await a.client.rpc('set_showcase', { p_card_ids: [] })
    p = await profile()
    expect(p.showcase).toHaveLength(8)

    // wishlist
    await a.client.rpc('toggle_wishlist', { p_card_id: commons[0].id })
    await a.client.rpc('toggle_wishlist', { p_card_id: commons[1].id })
    p = await profile()
    expect(p.wishlist.map((c: { id: number }) => c.id).sort()).toEqual([commons[0].id, commons[1].id].sort())

    // pulls: epic+ only, newest first, max 12
    const t = (n: number) => new Date(Date.UTC(2030, 0, 1, 0, n)).toISOString()
    const rows = [
      { player_id: a.userId, pack_type_id: 'standard', card_ids: [commons[0].id, eps[0].id], created_at: t(1) },
      { player_id: a.userId, pack_type_id: 'standard', card_ids: [m.id, commons[1].id, legs[0].id], created_at: t(2) },
    ]
    for (let i = 0; i < 12; i++)
      rows.push({ player_id: a.userId, pack_type_id: 'standard', card_ids: [eps[1].id], created_at: t(10 + i) })
    const ins = await admin.from('pack_openings').insert(rows)
    expect(ins.error).toBeNull()
    p = await profile()
    expect(p.boostersOpened).toBe(14)
    expect(p.recentPulls).toHaveLength(12)
    expect(p.recentPulls.every((r: { card: { id: number } }) => r.card.id === eps[1].id)).toBe(true)
    const times = p.recentPulls.map((r: { pulledAt: string }) => Date.parse(r.pulledAt))
    expect([...times].sort((x, y) => y - x)).toEqual(times)

    await admin.from('pack_openings').delete().eq('player_id', a.userId).gte('created_at', t(10))
    p = await profile()
    expect(p.recentPulls.map((r: { card: { id: number } }) => r.card.id)).toEqual([m.id, legs[0].id, eps[0].id])
    for (const r of p.recentPulls) expect(ORDER.indexOf(r.card.rarity)).toBeGreaterThanOrEqual(3)
  })
})

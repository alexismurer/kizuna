import { describe, it, expect } from 'vitest'
import { admin, newPlayer, giveCards, setPlayer, inventoryOf, type TestClient } from './helpers'

type Status = {
  tier: number
  renown: number
  multiplier: number
  met: number
  total: number
  ready: boolean
  rows: { key: string; have: number; need: number }[]
  checks: { noSales: boolean; discord: boolean; trusted: boolean }
  preview: { removeCopies: number; currencyGain: number; renownBank: number }
}

async function fillAlbum(userId: string) {
  const { data: cards } = await admin.from('cards').select('id')
  const { error } = await admin
    .from('inventory')
    .upsert(
      cards!.map((c) => ({ player_id: userId, card_id: c.id, count: 1 })),
      { onConflict: 'player_id,card_id' },
    )
  if (error) throw error
  await setPlayer(userId, { cycle_opened: 1500, created_at: new Date(Date.now() - 15 * 86400000).toISOString() })
}

// Rebirth is staff-only for now, so ready players are moderators unless asked otherwise
async function readyPlayer(staff = true) {
  const p = await newPlayer()
  await fillAlbum(p.userId)
  if (staff) {
    const { error } = await admin.from('admins').insert({ player_id: p.userId, role: 'moderator' })
    if (error) throw error
  }
  return p
}

async function status(client: TestClient): Promise<Status> {
  const { data, error } = await client.rpc('rebirth_status')
  expect(error).toBeNull()
  return data as Status
}

async function cardOfRarity(r: string) {
  const { data } = await admin.from('cards').select('id').eq('rarity', r).limit(1).single()
  return data!.id as number
}

describe('rebirth', () => {
  it('status lists 7 rows and 3 checks; fresh player is not ready', async () => {
    const { client } = await newPlayer()
    const s = await status(client)
    expect(s.rows).toHaveLength(7)
    expect(s.rows.map((r) => r.key)).toContain('boosters')
    expect(Object.keys(s.checks).sort()).toEqual(['discord', 'noSales', 'trusted'])
    expect(s.total).toBe(10)
    expect(s.ready).toBe(false)
    expect(s.met).toBeLessThan(s.total)
  })

  it('ready player passes status', async () => {
    const { client } = await readyPlayer()
    expect((await status(client)).ready).toBe(true)
  })

  it('refused for a ready player who is not staff', async () => {
    const { client } = await readyPlayer(false)
    expect((await status(client)).ready).toBe(true)
    expect((await client.rpc('rebirth')).error?.message).toContain('not_admin')
  })

  it('refused when one card is missing', async () => {
    const { userId, client } = await readyPlayer()
    await admin.from('inventory').delete().eq('player_id', userId).eq('card_id', await cardOfRarity('mythic'))
    const { error } = await client.rpc('rebirth')
    expect(error?.message).toContain('rebirth_not_ready')
  })

  it('refused with an open listing', async () => {
    const { userId, client } = await readyPlayer()
    const id = await cardOfRarity('common')
    await giveCards(userId, id, 2)
    const l = await client.rpc('create_listing', { p_card_id: id, p_price: 10 })
    expect(l.error).toBeNull()
    expect((await status(client)).checks.noSales).toBe(false)
    const { error } = await client.rpc('rebirth')
    expect(error?.message).toContain('rebirth_not_ready')
  })

  it('refused for a young account and for a banned player', async () => {
    const a = await readyPlayer()
    await setPlayer(a.userId, { created_at: new Date(Date.now() - 5 * 86400000).toISOString() })
    expect((await a.client.rpc('rebirth')).error?.message).toContain('rebirth_not_ready')
    const b = await readyPlayer()
    await setPlayer(b.userId, { banned_at: new Date().toISOString() })
    expect((await b.client.rpc('rebirth')).error?.message).toContain('rebirth_not_ready')
  })

  it('refused at tier 1 with 1500 boosters (needs 1750)', async () => {
    const { userId, client } = await readyPlayer()
    await setPlayer(userId, { rebirth_tier: 1 })
    const s = await status(client)
    expect(s.rows.find((r) => r.key === 'boosters')!.need).toBe(1750)
    expect((await client.rpc('rebirth')).error?.message).toContain('rebirth_not_ready')
    await setPlayer(userId, { cycle_opened: 1750 })
    expect((await client.rpc('rebirth')).error).toBeNull()
  })

  it('removes C/U/R/E including protected, keeps L/M; pays, banks renown, resets', async () => {
    const { userId, client } = await readyPlayer()
    const common = await cardOfRarity('common')
    const rare = await cardOfRarity('rare')
    await giveCards(userId, rare, 4)
    const prot = await client.rpc('set_card_protected', { p_card_id: common, p_on: true })
    expect(prot.error).toBeNull()
    await admin.from('player_showcase').insert({ player_id: userId, slot: 1, card_id: common })
    await setPlayer(userId, { avatar_card_id: common, currency: 100 })

    const before = (await admin.from('players').select('*').eq('id', userId).single()).data!
    const s = await status(client)
    const { data: cards } = await admin.from('cards').select('id, rarity')
    const worth: Record<string, number> = { common: 1, uncommon: 1, rare: 3, epic: 10 }
    let expected = 0
    for (const c of cards!) if (worth[c.rarity]) expected += worth[c.rarity] * (c.id === rare ? 4 : 1)

    const { data, error } = await client.rpc('rebirth')
    expect(error).toBeNull()
    expect(data.currencyGained).toBe(expected)
    expect(data.tier).toBe(1)
    expect(data.sealPack).toBe('seal')
    expect(s.preview.currencyGain).toBe(data.currencyGained)
    expect(s.preview.renownBank).toBe(data.renownBanked)

    const after = (await admin.from('players').select('*').eq('id', userId).single()).data!
    expect(after.currency).toBe(100 + expected)
    expect(after.card_points + after.renown_banked).toBe(before.card_points + before.renown_banked)
    expect(after.rebirth_tier).toBe(1)
    expect(after.cycle_opened).toBe(0)
    expect(after.avatar_card_id).toBeNull()
    expect(after.rebirth_at).not.toBeNull()

    const inv = await inventoryOf(userId)
    for (const c of cards!) {
      expect(inv.has(c.id)).toBe(c.rarity === 'legendary' || c.rarity === 'mythic')
    }
    const seal = await admin
      .from('granted_packs')
      .select('count')
      .eq('player_id', userId)
      .eq('pack_type_id', 'seal')
      .single()
    expect(seal.data!.count).toBe(1)
    expect((await admin.from('rebirths').select('*').eq('player_id', userId)).data).toHaveLength(1)
    expect((await admin.from('player_showcase').select('*').eq('player_id', userId)).data).toHaveLength(0)

    const again = await client.rpc('rebirth')
    expect(again.error?.message).toContain('rebirth_not_ready')
  })
})

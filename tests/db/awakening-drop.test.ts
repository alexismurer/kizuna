import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { admin, newPlayer, setPlayer, inventoryOf } from './helpers'

const AW = 'test-awakening'
const FILLER = 'test-filler'

type Row = { slot: number; card_id: number; rarity: string; awakening_id: string | null; awakening_serial: number | null }

let baseCard: number
let otherActive: string[] = []

// p_rng[1] = divine roll (0.5 = no divine), slot rolls after it, p_rng[50] = awakening roll, p_rng[51] = pick
function rng(roll: number) {
  const r = Array(51).fill(0)
  r[0] = 0.5
  r[49] = roll
  return r
}

async function open(userId: string, roll = 0) {
  await admin.rpc('_grant_pack', { p_player: userId, p_pack: 'seal', p_count: 1 })
  const { data, error } = await admin.rpc('_open_pack', {
    p_player: userId,
    p_pack: 'seal',
    p_now: new Date().toISOString(),
    p_rng: rng(roll),
  })
  if (error) throw error
  return data as Row[]
}

async function trustedTier1() {
  const p = await newPlayer()
  await setPlayer(p.userId, { rebirth_tier: 1, created_at: new Date(Date.now() - 30 * 86400000).toISOString() })
  return p
}

async function clearCopies(awakeningId: string) {
  const { data: copies } = await admin.from('awakening_copies').select('id').eq('awakening_id', awakeningId)
  const ids = (copies ?? []).map((c) => c.id as number)
  if (ids.length) await admin.from('awakening_listings').delete().in('copy_id', ids)
  await admin.from('awakening_copies').delete().eq('awakening_id', awakeningId)
}

async function copiesOf(awakeningId: string) {
  const { data, error } = await admin
    .from('awakening_copies')
    .select('serial, owner_id, first_owner_id')
    .eq('awakening_id', awakeningId)
    .order('serial')
  if (error) throw error
  return data!
}

async function weekCount() {
  const now = new Date()
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7)))
  const { count } = await admin
    .from('awakening_copies')
    .select('id', { count: 'exact', head: true })
    .gte('drawn_at', monday.toISOString())
  return count ?? 0
}

describe('awakening drop', () => {
  beforeAll(async () => {
    const { data: card } = await admin.from('cards').select('id').eq('rarity', 'legendary').order('id').limit(1).single()
    baseCard = card!.id as number
    // only the test awakening can be picked while this file runs
    const { data: active } = await admin.from('awakenings').select('id').eq('active', true).not('id', 'in', `(${AW},${FILLER})`)
    otherActive = (active ?? []).map((a) => a.id as string)
    if (otherActive.length) await admin.from('awakenings').update({ active: false }).in('id', otherActive)
    await clearCopies(AW)
    await clearCopies(FILLER)
    await admin.from('awakenings').upsert([
      { id: AW, base_card_id: baseCard, title: 'Test', form: 'Test form', effect: 'sun', accent: '#ffcc00', total: 2, sort: 0, active: true },
      { id: FILLER, base_card_id: baseCard, title: 'Filler', form: 'Filler', effect: 'void', accent: '#000000', total: 100, sort: 1, active: false },
    ])
    await admin.from('awakening_meta').update({ reveal_at: new Date(Date.now() - 7 * 86400000).toISOString() }).eq('id', 1)
  })

  afterAll(async () => {
    await clearCopies(AW)
    await clearCopies(FILLER)
    await admin.from('awakenings').delete().in('id', [AW, FILLER])
    if (otherActive.length) await admin.from('awakenings').update({ active: true }).in('id', otherActive)
  })

  it('tier-0 player never awakens with roll 0', async () => {
    const { userId } = await newPlayer()
    await setPlayer(userId, { created_at: new Date(Date.now() - 30 * 86400000).toISOString() })
    const rows = await open(userId, 0)
    expect(rows.every((r) => r.awakening_id === null)).toBe(true)
    expect(await copiesOf(AW)).toHaveLength(0)
  })

  it('untrusted tier-1 player never awakens', async () => {
    const { userId } = await newPlayer()
    await setPlayer(userId, { rebirth_tier: 1 })
    const rows = await open(userId, 0)
    expect(rows.every((r) => r.awakening_id === null)).toBe(true)
    expect(await copiesOf(AW)).toHaveLength(0)
  })

  it('tier-1 trusted with roll 0 gets copy serial 1, last slot = base card, base card in inventory', async () => {
    const { userId } = await trustedTier1()
    const rows = await open(userId, 0)
    const last = rows[rows.length - 1]
    expect(last.card_id).toBe(baseCard)
    expect(last.rarity).toBe('legendary')
    expect(last.awakening_id).toBe(AW)
    expect(last.awakening_serial).toBe(1)
    expect(rows.slice(0, -1).every((r) => r.awakening_id === null)).toBe(true)
    expect((await inventoryOf(userId)).get(baseCard)?.count).toBeGreaterThanOrEqual(1)
    expect(await copiesOf(AW)).toEqual([{ serial: 1, owner_id: userId, first_owner_id: userId }])
  })

  it('a roll above the chance gives nothing', async () => {
    const { userId } = await trustedTier1()
    const rows = await open(userId, 0.0021)
    expect(rows.every((r) => r.awakening_id === null)).toBe(true)
  })

  it('stock 1 left: two forced hits give one copy only', async () => {
    await clearCopies(AW)
    const { userId: first } = await trustedTier1()
    await admin.from('awakening_copies').insert({ awakening_id: AW, serial: 1, owner_id: first, first_owner_id: first })
    const { userId } = await trustedTier1()
    const a = await open(userId, 0)
    const b = await open(userId, 0)
    expect(a[a.length - 1].awakening_serial).toBe(2)
    expect(b.every((r) => r.awakening_id === null)).toBe(true)
    const copies = await copiesOf(AW)
    expect(copies.map((c) => c.serial)).toEqual([1, 2])
    expect(copies[1].owner_id).toBe(userId)
  })

  it('opening increments cycle_opened', async () => {
    const { userId } = await newPlayer()
    await open(userId, 0.9)
    await open(userId, 0.9)
    const { data } = await admin.from('players').select('cycle_opened').eq('id', userId).single()
    expect(data!.cycle_opened).toBe(2)
  })

  it('awakening_catalog issued matches copies, left = 20 - thisWeek', async () => {
    const { client } = await newPlayer()
    const { data, error } = await client.rpc('awakening_catalog')
    expect(error).toBeNull()
    const thisWeek = await weekCount()
    expect(data.weekly).toBe(12)
    expect(data.weeklyMax).toBe(20)
    expect(data.thisWeek).toBe(thisWeek)
    expect(data.left).toBe(Math.max(0, 20 - thisWeek))
    expect(typeof data.nextAt).toBe('string')
    const card = data.cards.find((c: { id: string }) => c.id === AW)
    expect(card).toMatchObject({ id: AW, baseCardId: baseCard, title: 'Test', form: 'Test form', effect: 'sun', total: 2 })
    expect(card.issued).toBe((await copiesOf(AW)).length)
  })

  it('weekly cap: with 20 copies drawn_at this week, forced roll gives nothing', async () => {
    await clearCopies(AW)
    const { userId: filler } = await newPlayer()
    const missing = Math.max(0, 20 - (await weekCount()))
    if (missing) {
      const { error } = await admin.from('awakening_copies').insert(
        Array.from({ length: missing }, (_, i) => ({ awakening_id: FILLER, serial: i + 1, owner_id: filler, first_owner_id: filler })),
      )
      if (error) throw error
    }
    expect(await weekCount()).toBeGreaterThanOrEqual(20)
    const { userId } = await trustedTier1()
    const rows = await open(userId, 0)
    expect(rows.every((r) => r.awakening_id === null)).toBe(true)
    expect(await copiesOf(AW)).toHaveLength(0)
    await clearCopies(FILLER)
  })
})

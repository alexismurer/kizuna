import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { admin, newPlayer } from './helpers'

type P = Awaited<ReturnType<typeof newPlayer>>
type Side = { card: { id: number; rarity: string } | null; hp: number | null; damage: number; defeatedAt: string | null; claims: number }
type Status = { weekStart: string; autoHp: number; weekly: Side; secret: Side & { appearedAt: string | null } }

let a: P
let plain: P
let week: string
let saved: Record<string, unknown>
let cardA: number
let cardB: number

const status = async () => (await a.client.rpc('admin_boss')).data as Status
const save = (kind: string, card: number | null, hp: number | null, damage: number) =>
  a.client.rpc('admin_save_boss', { p_kind: kind, p_card_id: card, p_hp: hp, p_damage: damage })

beforeAll(async () => {
  ;[a, plain] = await Promise.all([newPlayer(), newPlayer()])
  await admin.from('admins').insert({ player_id: a.userId, role: 'admin' })
  const s = await status()
  week = s.weekStart
  const { data: row } = await admin.from('bosses').select('*').eq('week_start', week).single()
  saved = row!
  const { data: cards } = await admin.from('cards').select('id').limit(2)
  ;[cardA, cardB] = cards!.map((c) => c.id)
  // start from a fresh, standing boss with no secret set up
  await admin
    .from('bosses')
    .update({ defeated_at: null, damage: 0, secret_at: null, secret_hp: null, secret_card_id: null, secret_damage: 0, secret_defeated_at: null })
    .eq('week_start', week)
})

afterAll(async () => {
  await admin.from('bosses').update(saved).eq('week_start', week)
})

describe('admin bosses', () => {
  it('is for admins only', async () => {
    expect((await plain.client.rpc('admin_boss')).error?.message).toContain('not_admin')
    expect((await plain.client.rpc('admin_save_boss', { p_kind: 'weekly', p_card_id: cardA, p_hp: 10, p_damage: 0 })).error?.message).toContain('not_admin')
  })

  it('rejects bad values', async () => {
    expect((await save('weekly', cardA, 0, 0)).error?.message).toContain('invalid_boss_hp')
    expect((await save('weekly', cardA, 10, -1)).error?.message).toContain('invalid_boss_damage')
    expect((await save('weekly', null, 10, 0)).error?.message).toContain('invalid_boss')
    expect((await save('weekly', -5, 10, 0)).error?.message).toContain('card_not_found')
    expect((await save('nope', cardA, 10, 0)).error?.message).toContain('invalid_kind')
  })

  it('sets up the secret boss ahead, knocks the weekly one out, and brings it back', async () => {
    // secret boss set up before it appears: stays hidden
    let r = await save('secret', cardB, 77, 0)
    expect(r.error).toBeNull()
    let s = r.data as Status
    expect(s.secret).toMatchObject({ hp: 77, appearedAt: null })
    expect(s.secret.card!.id).toBe(cardB)
    const room = (await plain.client.rpc('game_room_status')).data as { secret: unknown }
    expect(room.secret).toBeNull()

    // weekly card/health change, still standing
    s = (await save('weekly', cardA, 500, 100)).data as Status
    expect(s.weekly).toMatchObject({ hp: 500, damage: 100, defeatedAt: null })
    expect(s.weekly.card!.id).toBe(cardA)

    // damage reaches health: down, and the prepared secret boss appears
    s = (await save('weekly', cardA, 500, 500)).data as Status
    expect(s.weekly.defeatedAt).not.toBeNull()
    expect(s.secret.appearedAt).not.toBeNull()
    expect(s.secret).toMatchObject({ hp: 77, damage: 0 })
    expect(s.secret.card!.id).toBe(cardB)

    // secret boss knocked out, then revived
    s = (await save('secret', cardB, 77, 80)).data as Status
    expect(s.secret.defeatedAt).not.toBeNull()
    s = (await save('secret', cardB, 200, 80)).data as Status
    expect(s.secret.defeatedAt).toBeNull()

    // weekly revived: the secret boss leaves, its setup stays
    s = (await save('weekly', cardA, 500, 10)).data as Status
    expect(s.weekly.defeatedAt).toBeNull()
    expect(s.secret).toMatchObject({ appearedAt: null, damage: 0, hp: 200 })
  })

  it('falls back to a random Mythic with 3x health when nothing is set', async () => {
    await save('secret', null, null, 0)
    const s = (await save('weekly', cardA, 300, 300)).data as Status
    expect(s.secret.hp).toBe(900)
    expect(s.secret.card!.rarity).toBe('mythic')
  })
})

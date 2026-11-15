import { describe, it, expect } from 'vitest'
import { admin, newPlayer } from './helpers'

const ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic']
type Row = { slot: number; card_id: number; rarity: string; is_new: boolean }

const openAt = (userId: string, now: string) =>
  admin.rpc('_open_pack', { p_player: userId, p_pack: 'daily', p_now: now, p_rng: null })

describe('daily pack', () => {
  it('opens at 23:59 Paris, themed, epic+ last slot, standard_opened untouched', async () => {
    const { userId } = await newPlayer({ standardOpened: 3 })
    const { data, error } = await openAt(userId, '2026-11-15T22:59:00Z')
    expect(error).toBeNull()
    const rows = data as Row[]
    expect(rows).toHaveLength(5)
    expect(ORDER.indexOf(rows[4].rarity)).toBeGreaterThanOrEqual(ORDER.indexOf('epic'))
    const { data: cards } = await admin.from('cards').select('series_id').in('id', rows.map((r) => r.card_id))
    expect(cards!.every((c) => c.series_id === 1)).toBe(true)
    const { data: p } = await admin.from('players').select('*').eq('id', userId).single()
    expect(p!.standard_opened).toBe(3)
    expect(p!.free_stock).toBe(10)
    expect(p!.daily_opened_on).toBe('2026-11-15')
    const { data: ledger } = await admin.from('ledger').select('*').eq('player_id', userId)
    expect(ledger).toHaveLength(5)
  })

  it('refuses a second open the same Paris day', async () => {
    const { userId } = await newPlayer()
    expect((await openAt(userId, '2026-11-15T22:59:00Z')).error).toBeNull()
    const { error } = await openAt(userId, '2026-11-15T22:59:30Z')
    expect(error?.message).toContain('daily_already_opened')
  })

  it('allows opening again after Paris midnight', async () => {
    const { userId } = await newPlayer()
    expect((await openAt(userId, '2026-11-15T22:59:00Z')).error).toBeNull()
    const { error } = await openAt(userId, '2026-11-15T23:01:00Z')
    expect(error).toBeNull()
  })

  it('todays_pool returns the pool', async () => {
    const { data, error } = await admin.rpc('todays_pool', { p_now: '2026-11-15T12:00:00Z' })
    expect(error).toBeNull()
    expect(data.name).toBe('Test Pool')
  })
})

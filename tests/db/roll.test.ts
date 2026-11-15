import { describe, it, expect } from 'vitest'
import { admin } from './helpers'

async function roll(floor: string, r: number, mult: Record<string, number> = {}) {
  const { data, error } = await admin.rpc('roll_rarity', { p_floor: floor, p_multipliers: mult, p_r: r })
  expect(error).toBeNull()
  return data
}

describe('roll_rarity', () => {
  it('floor common', async () => {
    expect(await roll('common', 0)).toBe('common')
    expect(await roll('common', 0.6199)).toBe('common')
    expect(await roll('common', 0.6202)).toBe('uncommon')
    expect(await roll('common', 0.99999)).toBe('mythic')
  })
  it('floor rare', async () => {
    expect(await roll('rare', 0)).toBe('rare')
  })
  it('floor epic top is mythic', async () => {
    expect(await roll('epic', 0.999999)).toBe('mythic')
  })
  it('prestige multipliers widen legendary 2.7x', async () => {
    const w = [62, 25, 11.4, 1.4, 0.15 * 2.7, 0.025 * 2.7]
    const total = w.reduce((a, b) => a + b, 0)
    const start = w.slice(0, 4).reduce((a, b) => a + b, 0) / total
    const end = w.slice(0, 5).reduce((a, b) => a + b, 0) / total
    const m = { legendary: 2.7, mythic: 2.7 }
    expect(await roll('common', start - 1e-6, m)).toBe('epic')
    expect(await roll('common', start + 1e-6, m)).toBe('legendary')
    expect(await roll('common', end - 1e-6, m)).toBe('legendary')
    expect(await roll('common', end + 1e-6, m)).toBe('mythic')
  })
})

import { describe, expect, it } from 'vitest'
import { MAX_LIMIT, effectiveLimit, poolsToCreate } from '../../scripts/import-anilist/plan'

describe('effectiveLimit', () => {
  it('passes values within the cap', () => {
    expect(effectiveLimit(100)).toBe(100)
    expect(effectiveLimit(5000)).toBe(5000)
  })
  it('clamps larger values to 5000', () => {
    expect(MAX_LIMIT).toBe(5000)
    expect(effectiveLimit(6700)).toBe(5000)
  })
})

describe('poolsToCreate', () => {
  const s = (id: number, cards: number, epicPlus: number) => ({
    id,
    title: `S${id}`,
    cards,
    epicOrBetter: epicPlus,
  })
  it('selects series with >=10 cards and >=1 epic+ card', () => {
    const out = poolsToCreate([s(1, 10, 1), s(2, 9, 3), s(3, 50, 0)], new Set())
    expect(out).toEqual([{ name: 'S1', series_ids: [1] }])
  })
  it('skips series already in a pool', () => {
    expect(poolsToCreate([s(1, 10, 1), s(2, 12, 2)], new Set([1]))).toEqual([
      { name: 'S2', series_ids: [2] },
    ])
  })
})

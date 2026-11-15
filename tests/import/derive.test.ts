import { describe, expect, it } from 'vitest'
import { rarityForRank, statsForRank, themesFor } from '../../scripts/import-anilist/derive'

describe('rarityForRank', () => {
  const T = 6736
  it.each([
    [1, 'mythic'], [203, 'mythic'], [204, 'legendary'], [674, 'legendary'],
    [675, 'epic'], [1684, 'epic'], [1685, 'rare'], [3368, 'rare'],
    [3369, 'uncommon'], [5052, 'uncommon'], [5053, 'common'],
  ])('rank %i -> %s', (rank, expected) => {
    expect(rarityForRank(rank, T)).toBe(expected)
  })
})

describe('statsForRank', () => {
  it('top and bottom', () => {
    expect(statsForRank(1, 6736)).toEqual({ pow: 99, aura: 86 })
    expect(statsForRank(6736, 6736)).toEqual({ pow: 41, aura: 38 })
  })
})

describe('themesFor', () => {
  it('maps tags, genres, gender', () => {
    expect(themesFor({ genres: ['Sports'], tags: [{ name: 'Shounen' }] }, 'Male')).toEqual(['shonen', 'sports', 'male'])
  })
})

import { describe, expect, it } from 'vitest'
import { genreFor, rarityForRank, statsForRank, themesFor } from '../../scripts/import-anilist/derive'

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

function tag(name: string, rank: number, spoiler: { isMediaSpoiler?: boolean; isGeneralSpoiler?: boolean } = {}) {
  return { name, rank, isMediaSpoiler: false, isGeneralSpoiler: false, ...spoiler }
}

describe('themesFor', () => {
  it('maps tags, genres, gender', () => {
    expect(themesFor({ genres: ['Sports'], tags: [tag('Shounen', 95)] }, 'Male')).toEqual(['shonen', 'sports', 'male'])
  })

  it('ignores tags below 70% relevance (Bleach is tagged Isekai at 50%)', () => {
    expect(themesFor({ genres: [], tags: [tag('Shounen', 95), tag('Isekai', 50)] }, null)).toEqual(['shonen'])
    expect(themesFor({ genres: [], tags: [tag('Isekai', 70)] }, null)).toEqual(['isekai'])
  })

  it('ignores spoiler tags', () => {
    expect(themesFor({ genres: [], tags: [tag('Isekai', 90, { isMediaSpoiler: true })] }, null)).toEqual([])
    expect(themesFor({ genres: [], tags: [tag('Isekai', 90, { isGeneralSpoiler: true })] }, null)).toEqual([])
  })
})

describe('genreFor', () => {
  it.each([
    [['Action', 'Sports'], 'scifi_sport'],
    [['Action', 'Mecha', 'Sci-Fi'], 'scifi_sport'],
    [['Action', 'Mystery', 'Psychological'], 'battle'],
    [['Mystery', 'Psychological', 'Thriller'], 'thrills'],
    [['Action', 'Sci-Fi'], 'scifi_sport'],
    [['Action', 'Supernatural', 'Fantasy'], 'battle'],
    [['Drama', 'Romance'], 'romance'],
    [['Action', 'Romance'], 'battle'],
    [['Comedy', 'Slice of Life'], 'slice_of_life'],
    [['Comedy', 'Fantasy'], 'fantasy'],
    [['Comedy', 'Romance'], 'romance'],
    [['Sci-Fi', 'Drama'], 'scifi_sport'],
    [['Supernatural', 'Drama'], 'fantasy'],
    [['Action', 'Adventure', 'Fantasy'], 'battle'],
    [['Adventure', 'Fantasy', 'Romance'], 'romance'],
    [['Action', 'Adventure'], 'battle'],
    [['Music'], 'slice_of_life'],
    [[], 'slice_of_life'],
  ])('%j -> %s', (genres, expected) => {
    expect(genreFor(genres as string[])).toBe(expected)
  })
})

import { describe, expect, it } from 'vitest'
import { franchiseRoot } from '../../scripts/import-anilist/franchise'
import type { Media } from '../../scripts/import-anilist/anilist'

const m = (id: number, rels: [string, number][] = []): Media => ({
  id,
  title: { english: `T${id}`, romaji: `R${id}` },
  coverImage: { large: `c${id}` },
  genres: [],
  tags: [],
  relations: { edges: rels.map(([relationType, n]) => ({ relationType, node: { id: n } })) },
})

const fake = (list: Media[]) => async (ids: number[]) => list.filter((x) => ids.includes(x.id))

describe('franchiseRoot', () => {
  it('follows prequel chain', async () => {
    const g = fake([m(3, [['PREQUEL', 2]]), m(2, [['PREQUEL', 1], ['SEQUEL', 3]]), m(1, [['SEQUEL', 2]])])
    expect((await franchiseRoot(3, g)).id).toBe(1)
  })
  it('follows parent for spin-offs', async () => {
    const g = fake([m(10, [['PARENT', 2]]), m(2, [['PREQUEL', 1]]), m(1)])
    expect((await franchiseRoot(10, g)).id).toBe(1)
  })
  it('cycle resolves to lowest id', async () => {
    const g = fake([m(7, [['PREQUEL', 5]]), m(5, [['PREQUEL', 7]])])
    expect((await franchiseRoot(7, g)).id).toBe(5)
  })
})

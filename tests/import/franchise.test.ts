import { describe, expect, it } from 'vitest'
import { createMediaStore, franchiseRoot } from '../../scripts/import-anilist/franchise'
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

describe('missing media', () => {
  it('uses last fetched media as root and does not throw', async () => {
    const g = fake([m(4, [['PREQUEL', 99]])])
    expect((await franchiseRoot(4, g)).id).toBe(4)
  })
})

describe('createMediaStore', () => {
  it('batches 120 ids into 3 calls of <=50', async () => {
    const calls: number[][] = []
    const store = createMediaStore(async (ids) => {
      calls.push(ids)
      return ids.map((i) => m(i))
    })
    await store.prefetch(Array.from({ length: 120 }, (_, i) => i + 1000))
    expect(calls.map((c) => c.length)).toEqual([50, 50, 20])
  })
  it('resolves a 3-level prequel chain with one call per level', async () => {
    const list = [m(3, [['PREQUEL', 2]]), m(2, [['PREQUEL', 1]]), m(1)]
    const calls: number[][] = []
    const store = createMediaStore(async (ids) => {
      calls.push(ids)
      return list.filter((x) => ids.includes(x.id))
    })
    await store.prefetch([3])
    expect(calls).toEqual([[3], [2], [1]])
    expect((await franchiseRoot(3, store.getMedia)).id).toBe(1)
    expect(calls).toHaveLength(3)
  })
})

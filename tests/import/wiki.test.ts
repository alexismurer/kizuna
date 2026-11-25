import { describe, expect, it, vi } from 'vitest'
import { fetchCharacterWiki } from '../../src/lib/anilist/wiki'
import { toWikiRow } from '../../scripts/import-anilist/wiki'
import type { CharacterDetails } from '../../scripts/import-anilist/anilist'

const edge = (
  type: 'ANIME' | 'MANGA',
  english: string | null,
  romaji: string | null,
  va?: string,
) => ({
  voiceActors: va ? [{ name: { full: va } }] : [],
  node: { type, title: { english, romaji } },
})

const tatsumaki: CharacterDetails = {
  id: 1,
  favourites: 12345,
  age: '28',
  media: {
    edges: [
      edge('ANIME', 'One-Punch Man', 'One Punch Man', 'Aoi Yuuki'),
      edge('ANIME', null, 'One Punch Man 2', 'Aoi Yuuki'),
      edge('MANGA', 'One-Punch Man', 'One Punch Man'),
      edge('MANGA', null, null),
      edge('MANGA', null, 'Mob Psycho 100'),
      edge('MANGA', 'Mob Psycho 100', 'Mob Psycho 100'),
    ],
  },
}

describe('toWikiRow', () => {
  it('maps a character with appearances in order and drops untitled edges', () => {
    const row = toWikiRow(tatsumaki)
    expect(row.favourites).toBe(12345)
    expect(row.age).toBe('28')
    expect(row.voice_actor).toBe('Aoi Yuuki')
    expect(row.appearances).toEqual([
      { position: 1, media_type: 'ANIME', title: 'One-Punch Man' },
      { position: 2, media_type: 'ANIME', title: 'One Punch Man 2' },
      { position: 3, media_type: 'MANGA', title: 'One-Punch Man' },
      { position: 4, media_type: 'MANGA', title: 'Mob Psycho 100' },
      { position: 5, media_type: 'MANGA', title: 'Mob Psycho 100' },
    ])
  })

  it('takes the first voice actor of the first edge that has one', () => {
    const row = toWikiRow({
      ...tatsumaki,
      media: { edges: [edge('MANGA', 'A', null), edge('ANIME', 'B', null, 'Second VA')] },
    })
    expect(row.voice_actor).toBe('Second VA')
  })

  it('turns a blank age into null', () => {
    expect(toWikiRow({ ...tatsumaki, age: ' ' }).age).toBeNull()
    expect(toWikiRow({ ...tatsumaki, age: null }).age).toBeNull()
  })
})

describe('fetchCharacterWiki', () => {
  it('asks AniList for one character and returns its wiki row, or null when AniList has none', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    try {
      spy.mockResolvedValueOnce(new Response(JSON.stringify({ data: { Page: { characters: [tatsumaki] } } })))
      expect(await fetchCharacterWiki(1)).toEqual(toWikiRow(tatsumaki))
      expect(JSON.parse(String(spy.mock.calls[0][1]?.body)).variables).toEqual({ ids: [1] })
      spy.mockResolvedValueOnce(new Response(JSON.stringify({ data: { Page: { characters: [] } } })))
      expect(await fetchCharacterWiki(2)).toBeNull()
      spy.mockResolvedValueOnce(new Response('busy', { status: 429 }))
      await expect(fetchCharacterWiki(3)).rejects.toThrow('anilist_429')
    } finally {
      spy.mockRestore()
    }
  })
})

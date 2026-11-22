import type { CharacterDetails } from './anilist'

export type WikiRow = {
  favourites: number
  age: string | null
  voice_actor: string | null
  appearances: { position: number; media_type: 'ANIME' | 'MANGA'; title: string }[]
}

export function toWikiRow(c: CharacterDetails): WikiRow {
  const edges = c.media.edges
  const appearances: WikiRow['appearances'] = []
  for (const e of edges) {
    const title = e.node.title.english ?? e.node.title.romaji
    if (!title) continue
    appearances.push({ position: appearances.length + 1, media_type: e.node.type, title })
  }
  return {
    favourites: c.favourites,
    age: c.age?.trim() || null,
    voice_actor: edges.find((e) => e.voiceActors.length > 0)?.voiceActors[0].name.full ?? null,
    appearances,
  }
}

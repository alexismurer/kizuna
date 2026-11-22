import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export type Media = {
  id: number
  popularity: number | null
  title: { english: string | null; romaji: string | null }
  coverImage: { large: string | null }
  genres: string[]
  tags: { name: string }[]
  relations: { edges: { relationType: string; node: { id: number } }[] }
}

export type CharacterNode = {
  id: number
  name: { full: string; native: string | null }
  image: { large: string | null }
  gender: string | null
  favourites: number
  media: { nodes: Media[] }
}

const ENDPOINT = 'https://graphql.anilist.co'
const MIN_INTERVAL_MS = 60_000 / 25
const CACHE_DIR = path.join(__dirname, '.cache')

const MEDIA_FIELDS = `
  id
  popularity
  title { english romaji }
  coverImage { large }
  genres
  tags { name }
  relations { edges { relationType node { id } } }
`

let last = 0
async function throttle() {
  const wait = last + MIN_INTERVAL_MS - Date.now()
  last = Math.max(Date.now(), last + MIN_INTERVAL_MS)
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
}

async function request<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const key = createHash('sha1').update(query + JSON.stringify(variables)).digest('hex')
  const file = path.join(CACHE_DIR, `${key}.json`)
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as T

  for (;;) {
    await throttle()
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }),
    })
    if (res.status === 429) {
      const secs = Number(res.headers.get('Retry-After') ?? 60)
      await new Promise((r) => setTimeout(r, secs * 1000))
      continue
    }
    if (!res.ok) throw new Error(`AniList ${res.status}: ${await res.text()}`)
    const json = (await res.json()) as { data: T | null; errors?: unknown }
    if (json.errors || !json.data) throw new Error(`AniList error: ${JSON.stringify(json.errors ?? json)}`)
    mkdirSync(CACHE_DIR, { recursive: true })
    writeFileSync(file, JSON.stringify(json.data))
    return json.data
  }
}

export async function fetchCharacterPage(page: number): Promise<CharacterNode[]> {
  const query = `query ($page: Int) {
    Page(page: $page, perPage: 50) {
      characters(sort: FAVOURITES_DESC) {
        id
        name { full native }
        image { large }
        gender
        favourites
        media(sort: POPULARITY_DESC, perPage: 1) { nodes { ${MEDIA_FIELDS} } }
      }
    }
  }`
  const data = await request<{ Page: { characters: CharacterNode[] } }>(query, { page })
  return data.Page.characters
}

export async function fetchMedia(ids: number[]): Promise<Media[]> {
  if (ids.length > 50) throw new Error('fetchMedia: at most 50 ids')
  const query = `query ($ids: [Int]) {
    Page(page: 1, perPage: 50) { media(id_in: $ids) { ${MEDIA_FIELDS} } }
  }`
  const data = await request<{ Page: { media: Media[] } }>(query, { ids })
  return data.Page.media
}

export type CharacterDetails = {
  id: number
  favourites: number
  age: string | null
  media: {
    edges: {
      voiceActors: { name: { full: string } }[]
      node: { type: 'ANIME' | 'MANGA'; title: { english: string | null; romaji: string | null } }
    }[]
  }
}

export async function fetchCharacterDetails(ids: number[]): Promise<CharacterDetails[]> {
  if (ids.length > 50) throw new Error('fetchCharacterDetails: at most 50 ids')
  const query = `query ($ids: [Int]) {
    Page(page: 1, perPage: 50) {
      characters(id_in: $ids) {
        id
        favourites
        age
        media(sort: POPULARITY_DESC, perPage: 25) {
          edges {
            voiceActors(language: JAPANESE, sort: RELEVANCE) { name { full } }
            node { type title { english romaji } }
          }
        }
      }
    }
  }`
  const data = await request<{ Page: { characters: CharacterDetails[] } }>(query, { ids })
  return data.Page.characters
}

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import {
  fetchMedia,
  fetchMediaByMal,
  fetchMediaCharacters,
  searchCharacters,
  type MalMedia,
  type Media,
  type MediaCharacter,
} from '../import-anilist/anilist'
import { rarityForRank, statsForRank, themesFor } from '../import-anilist/derive'
import { albumDisplay, createMediaStore, franchiseRoot } from '../import-anilist/franchise'
import { characterPictures, topCharacters } from './mal'
import { estimateRank, pickMatch, type TopRow } from './parse'

// `npm run mal:sync -- --top 10000 [--pictures 500] [--skip-pictures]`
//  1. reads MyAnimeList's most favourited characters (50 per page)
//  2. finds each one on AniList (the catalog's source): through its first anime/manga, else by name search
//  3. links it to its card when the catalog has it, otherwise stores it as a new-card candidate
//  4. fetches galleries for linked cards (best ranked first) and candidates (most favourited first)
// Staff choices (reviewed pictures, candidate status) are never overwritten.

dotenv.config({ path: '.env.local', quiet: true })

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(name)
  const n = i >= 0 ? Number(process.argv[i + 1]) : fallback
  if (!Number.isInteger(n) || n < 0) throw new Error(`invalid ${name}`)
  return n
}

async function readAll<T>(db: SupabaseClient, table: string, columns: string, order: string): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(columns).order(order).range(from, from + 999)
    if (error) throw error
    out.push(...(data as T[]))
    if (data.length < 1000) break
  }
  return out
}

type Card = { id: number; source: string | null; source_id: number | null; favourites: number | null }
type Matched = { row: TopRow; character: MediaCharacter; media: MalMedia }

async function resolve(rows: TopRow[]): Promise<{ matched: Matched[]; unmatched: TopRow[] }> {
  // AniList media for each character's first anime (else first manga)
  const ref = (r: TopRow) => (r.anime[0] ? { type: 'ANIME' as const, id: r.anime[0] } : r.manga[0] ? { type: 'MANGA' as const, id: r.manga[0] } : null)
  const byMal = new Map<string, MalMedia>()
  for (const type of ['ANIME', 'MANGA'] as const) {
    const wanted = [...new Set(rows.map(ref).filter((x) => x?.type === type).map((x) => x!.id))]
    for (let i = 0; i < wanted.length; i += 50) {
      for (const m of await fetchMediaByMal(wanted.slice(i, i + 50), type)) byMal.set(`${type}:${m.idMal}`, m)
    }
    console.log(`AniList ${type.toLowerCase()} resolved: ${[...byMal.keys()].filter((k) => k.startsWith(type)).length}/${wanted.length}`)
  }
  const mediaIds = [...new Set([...byMal.values()].map((m) => m.id))]
  const casts = new Map<number, MediaCharacter[]>()
  for (let i = 0; i < mediaIds.length; i += 10) {
    for (const [id, list] of await fetchMediaCharacters(mediaIds.slice(i, i + 10))) casts.set(id, list)
    if ((i / 10) % 50 === 0) console.log(`AniList casts ${Math.min(i + 10, mediaIds.length)}/${mediaIds.length}`)
  }

  const matched: Matched[] = []
  const unmatched: TopRow[] = []
  let searched = 0
  for (const row of rows) {
    const r = ref(row)
    const media = r ? byMal.get(`${r.type}:${r.id}`) : undefined
    if (!media) {
      unmatched.push(row)
      continue
    }
    let character: MediaCharacter | null = pickMatch(row, casts.get(media.id) ?? [])
    if (!character) {
      // not among the 25 most favourited of that media: search AniList by name, keep hits from the same works
      const [last, first] = row.name.split(', ')
      const found = await searchCharacters(first ? `${first} ${last}` : row.name)
      const works = new Set([...row.anime, ...row.manga])
      character = pickMatch(row, found.filter((c) => c.media.nodes.some((n) => n.idMal && works.has(n.idMal))))
      if (++searched % 100 === 0) console.log(`AniList name searches: ${searched}`)
    }
    if (character) matched.push({ row, character, media })
    else unmatched.push(row)
  }
  return { matched, unmatched }
}

async function main() {
  const top = arg('--top', 10000)
  const pictureLimit = arg('--pictures', Number.MAX_SAFE_INTEGER)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing')
  const db = createClient(url, key, { auth: { persistSession: false } })

  const cards = await readAll<Card>(db, 'cards', 'id, source, source_id, favourites', 'id')
  const cardByAniList = new Map(cards.filter((c) => c.source === 'anilist').map((c) => [c.source_id!, c.id]))
  const links = await readAll<{ card_id: number; mal_id: number | null }>(db, 'mal_links', 'card_id, mal_id', 'card_id')
  const linkedCards = new Set(links.filter((l) => l.mal_id !== null).map((l) => l.card_id))
  const usedMal = new Set(links.map((l) => l.mal_id).filter((x): x is number => x !== null))
  const candidates = await readAll<{ mal_id: number; anilist_id: number }>(db, 'mal_candidates', 'mal_id, anilist_id', 'mal_id')
  const knownCandidate = new Set(candidates.flatMap((c) => [`m${c.mal_id}`, `a${c.anilist_id}`]))

  // 1. MAL ranking
  const rows: TopRow[] = []
  const seen = new Set<number>()
  for (let offset = 0; offset < top; offset += 50) {
    const page = await topCharacters(offset)
    if (page.length === 0) break
    for (const r of page) {
      if (seen.has(r.malId)) continue
      seen.add(r.malId)
      rows.push(r)
    }
    if ((offset / 50) % 20 === 0) console.log(`MAL ranking: ${rows.length}`)
  }

  // 2. AniList
  const { matched, unmatched } = await resolve(rows)
  console.log(`matched ${matched.length} MAL characters to AniList, ${unmatched.length} not found`)

  // 3a. links to existing cards
  const newLinks: { card_id: number; mal_id: number; mal_favorites: number }[] = []
  const fresh: Matched[] = []
  for (const m of matched) {
    const cardId = cardByAniList.get(m.character.id)
    if (cardId === undefined) {
      fresh.push(m)
      continue
    }
    if (linkedCards.has(cardId) || usedMal.has(m.row.malId)) continue
    linkedCards.add(cardId)
    usedMal.add(m.row.malId)
    newLinks.push({ card_id: cardId, mal_id: m.row.malId, mal_favorites: m.row.favorites })
  }
  for (let i = 0; i < newLinks.length; i += 500) {
    // cards staff already reviewed without a MAL match keep their row; only fill the MAL id in
    const { error } = await db.from('mal_links').upsert(newLinks.slice(i, i + 500), { onConflict: 'card_id' })
    if (error) throw error
  }
  console.log(`linked ${newLinks.length} cards (${linkedCards.size} linked in total)`)

  // 3b. new-card candidates
  const catalogFavs = cards.map((c) => c.favourites).filter((f): f is number => f !== null)
  const total = cards.length
  const newOnes = fresh.filter((m) => !knownCandidate.has(`m${m.row.malId}`) && !knownCandidate.has(`a${m.character.id}`))
  const store = createMediaStore(fetchMedia)
  store.seed(newOnes.map((m) => m.media))
  await store.prefetch(newOnes.map((m) => m.media.id))
  const memo = new Map<number, Media>()
  const visited = new Map<number, Map<number, Media>>()
  const toInsert = []
  for (const m of newOnes) {
    // two MAL characters can match one AniList character; the more favourited one (earlier) wins
    if (knownCandidate.has(`m${m.row.malId}`) || knownCandidate.has(`a${m.character.id}`)) continue
    const root = await franchiseRoot(m.media.id, store.getMedia, memo, (r, v) => {
      const pool = visited.get(r.id) ?? new Map<number, Media>()
      for (const n of v) pool.set(n.id, n)
      visited.set(r.id, pool)
    })
    const pool = visited.get(root.id) ?? new Map<number, Media>()
    pool.set(m.media.id, m.media)
    visited.set(root.id, pool)
    const album = albumDisplay(root, [...pool.values()])
    const rank = estimateRank(m.character.favourites, catalogFavs)
    const capped = Math.min(rank, total)
    const { pow, aura } = statsForRank(capped, total)
    knownCandidate.add(`m${m.row.malId}`).add(`a${m.character.id}`)
    toInsert.push({
      mal_id: m.row.malId,
      anilist_id: m.character.id,
      name: m.character.name.full,
      native_name: m.character.name.native,
      gender: m.character.gender,
      favorites: m.row.favorites,
      series_source_id: root.id,
      series_title: album.title,
      series_cover: album.cover_url,
      themes: themesFor(m.media, m.character.gender),
      popularity_rank: rank,
      rarity: rarityForRank(capped, total),
      pow,
      aura,
      default_url: m.row.image,
    })
  }
  for (let i = 0; i < toInsert.length; i += 500) {
    const { error } = await db.from('mal_candidates').upsert(toInsert.slice(i, i + 500), { onConflict: 'mal_id', ignoreDuplicates: true })
    if (error) throw error
  }
  console.log(`added ${toInsert.length} new-card candidates`)

  // 4. galleries
  if (process.argv.includes('--skip-pictures')) return
  const linkQueue = (
    await readAll<{ mal_id: number | null; pictures: string[] | null; cards: { popularity_rank: number } }>(
      db,
      'mal_links',
      'mal_id, pictures, cards!inner(popularity_rank)',
      'card_id',
    )
  )
    .filter((l) => l.mal_id !== null && l.pictures === null)
    .sort((a, b) => a.cards.popularity_rank - b.cards.popularity_rank)
    .map((l) => l.mal_id!)
  const candQueue = (await readAll<{ mal_id: number; pictures: string[] | null; favorites: number; status: string }>(
    db,
    'mal_candidates',
    'mal_id, pictures, favorites, status',
    'mal_id',
  ))
    .filter((c) => c.pictures === null && c.status !== 'rejected')
    .sort((a, b) => b.favorites - a.favorites)
    .map((c) => c.mal_id)
  // alternate so both tabs of the panel fill up together
  const queue: number[] = []
  for (let i = 0; i < Math.max(linkQueue.length, candQueue.length); i++) {
    if (i < linkQueue.length) queue.push(linkQueue[i])
    if (i < candQueue.length) queue.push(candQueue[i])
  }
  const todo = queue.slice(0, pictureLimit)
  console.log(`fetching ${todo.length} galleries (~${Math.round((todo.length * 2) / 60)} min)`)
  let done = 0
  for (const malId of [...new Set(todo)]) {
    const pictures = await characterPictures(malId)
    const [a, b] = await Promise.all([
      db.from('mal_links').update({ pictures }).eq('mal_id', malId),
      db.from('mal_candidates').update({ pictures }).eq('mal_id', malId),
    ])
    if (a.error) throw a.error
    if (b.error) throw b.error
    if (++done % 100 === 0) console.log(`galleries ${done}/${todo.length}`)
  }
  console.log(`fetched ${done} galleries`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

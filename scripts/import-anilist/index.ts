import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fetchCharacterPage, fetchMedia, type CharacterNode, type Media } from './anilist'
import { rarityForRank, statsForRank, themesFor } from './derive'
import { createMediaStore, franchiseRoot } from './franchise'

dotenv.config({ path: '.env.local', quiet: true })

const SOURCE = 'anilist'

function parseLimit(): number {
  const i = process.argv.indexOf('--limit')
  const n = i >= 0 ? Number(process.argv[i + 1]) : NaN
  if (!Number.isInteger(n) || n < 1) throw new Error('usage: npm run import -- --limit <n>')
  return n
}

async function main() {
  const limit = parseLimit()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in .env.local')
  const db = createClient(url, key, { auth: { persistSession: false } })

  // Collect characters in rank order (favourites desc), skipping ones with no media.
  const ranked: CharacterNode[] = []
  const seenIds = new Set<number>()
  for (let page = 1; ranked.length < limit; page++) {
    const chars = await fetchCharacterPage(page)
    if (chars.length === 0) break
    for (const c of chars) {
      if (ranked.length >= limit) break
      if (seenIds.has(c.id) || c.media.nodes.length === 0) continue
      seenIds.add(c.id)
      ranked.push(c)
    }
  }
  const total = limit

  // Existing catalog is frozen: read it, never modify it.
  const existing = new Set<number>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('cards')
      .select('source_id')
      .eq('source', SOURCE)
      .order('number')
      .range(from, from + 999)
    if (error) throw error
    for (const r of data) existing.add(r.source_id)
    if (data.length < 1000) break
  }
  const { data: top, error: topErr } = await db
    .from('cards')
    .select('number')
    .order('number', { ascending: false })
    .limit(1)
  if (topErr) throw topErr
  let maxNumber: number = top[0]?.number ?? 0

  const store = createMediaStore(fetchMedia)
  const fresh = ranked.filter((c) => !existing.has(c.id))
  store.seed(fresh.map((c) => c.media.nodes[0]))
  await store.prefetch(fresh.map((c) => c.media.nodes[0].id))
  const memo = new Map<number, Media>()
  const seriesIds = new Map<number, number>()
  let inserted = 0

  for (let i = 0; i < ranked.length; i++) {
    const c = ranked[i]
    if (existing.has(c.id)) continue
    const rank = i + 1
    const media = c.media.nodes[0]
    const root = await franchiseRoot(media.id, store.getMedia, memo)

    let seriesId = seriesIds.get(root.id)
    if (seriesId === undefined) {
      const { data, error } = await db
        .from('series')
        .upsert(
          {
            source: SOURCE,
            source_id: root.id,
            title: root.title.english ?? root.title.romaji ?? `#${root.id}`,
            cover_url: root.coverImage.large,
          },
          { onConflict: 'source,source_id', ignoreDuplicates: true },
        )
        .select('id')
      if (error) throw error
      if (data.length > 0) {
        seriesId = data[0].id as number
      } else {
        const found = await db.from('series').select('id').eq('source', SOURCE).eq('source_id', root.id).single()
        if (found.error) throw found.error
        seriesId = found.data.id as number
      }
      seriesIds.set(root.id, seriesId)
    }

    const { pow, aura } = statsForRank(rank, total)
    const { data: card, error } = await db
      .from('cards')
      .insert({
        number: ++maxNumber,
        source: SOURCE,
        source_id: c.id,
        name: c.name.full,
        native_name: c.name.native,
        image_url: c.image.large,
        series_id: seriesId,
        gender: c.gender,
        popularity_rank: rank,
        rarity: rarityForRank(rank, total),
        pow,
        aura,
      })
      .select('id')
      .single()
    if (error) throw error

    const themes = themesFor(media, c.gender)
    if (themes.length > 0) {
      const { error: tErr } = await db
        .from('card_themes')
        .insert(themes.map((theme_id) => ({ card_id: card.id, theme_id })))
      if (tErr) throw tErr
    }
    inserted++
  }

  console.log(`inserted ${inserted} cards, ${new Set(seriesIds.values()).size} series`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

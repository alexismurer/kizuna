import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fetchCharacterThemeSources } from './anilist'
import { themesFor } from './derive'

dotenv.config({ path: '.env.local', quiet: true })

const BATCH = 50

// Re-derives card_themes for every AniList card from fresh AniList data.
// Pass --dry-run to print what would change without writing.
async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in .env.local')
  const db = createClient(url, key, { auth: { persistSession: false } })

  const cards: { id: number; source_id: number }[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('cards').select('id, source_id').eq('source', 'anilist').order('id').range(from, from + 999)
    if (error) throw error
    cards.push(...data)
    if (data.length < 1000) break
  }
  const current = new Map<number, Set<string>>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('card_themes').select('card_id, theme_id').order('card_id').order('theme_id').range(from, from + 999)
    if (error) throw error
    for (const r of data) current.set(r.card_id, (current.get(r.card_id) ?? new Set()).add(r.theme_id))
    if (data.length < 1000) break
  }

  const batches = Math.ceil(cards.length / BATCH)
  console.log(`${cards.length} cards to retheme in ${batches} batches${dryRun ? ' (dry run)' : ''}`)
  const added = new Map<string, number>()
  const removed = new Map<string, number>()
  let changed = 0
  let missing = 0
  for (let b = 0; b < batches; b++) {
    const chunk = cards.slice(b * BATCH, (b + 1) * BATCH)
    const sources = new Map((await fetchCharacterThemeSources(chunk.map((c) => c.source_id))).map((s) => [s.id, s]))
    for (const card of chunk) {
      const src = sources.get(card.source_id)
      const media = src?.media.nodes[0]
      if (!src || !media) {
        missing++
        continue
      }
      const next = new Set(themesFor(media, src.gender))
      const prev = current.get(card.id) ?? new Set<string>()
      const plus = [...next].filter((t) => !prev.has(t))
      const minus = [...prev].filter((t) => !next.has(t))
      if (plus.length === 0 && minus.length === 0) continue
      changed++
      for (const t of plus) added.set(t, (added.get(t) ?? 0) + 1)
      for (const t of minus) removed.set(t, (removed.get(t) ?? 0) + 1)
      if (dryRun) continue
      if (minus.length > 0) {
        const { error } = await db.from('card_themes').delete().eq('card_id', card.id).in('theme_id', minus)
        if (error) throw error
      }
      if (plus.length > 0) {
        const { error } = await db.from('card_themes').insert(plus.map((theme_id) => ({ card_id: card.id, theme_id })))
        if (error) throw error
      }
    }
    console.log(`batch ${b + 1}/${batches} done`)
  }
  console.log(`${changed} cards changed, ${missing} not returned by AniList (left as is)`)
  console.log('added:', Object.fromEntries(added))
  console.log('removed:', Object.fromEntries(removed))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

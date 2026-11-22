import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fetchCharacterDetails } from './anilist'
import { toWikiRow } from './wiki'

dotenv.config({ path: '.env.local', quiet: true })

const BATCH = 50

async function main() {
  const all = process.argv.includes('--all')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in .env.local')
  const db = createClient(url, key, { auth: { persistSession: false } })

  const cards: { id: number; source_id: number }[] = []
  for (let from = 0; ; from += 1000) {
    let q = db.from('cards').select('id, source_id').eq('source', 'anilist')
    if (!all) q = q.is('favourites', null)
    const { data, error } = await q.order('id').range(from, from + 999)
    if (error) throw error
    cards.push(...data)
    if (data.length < 1000) break
  }
  const batches = Math.ceil(cards.length / BATCH)
  console.log(`${cards.length} cards to backfill in ${batches} batches`)

  let updated = 0
  let missing = 0
  for (let b = 0; b < batches; b++) {
    const chunk = cards.slice(b * BATCH, (b + 1) * BATCH)
    const details = new Map((await fetchCharacterDetails(chunk.map((c) => c.source_id))).map((d) => [d.id, d]))
    const found = chunk.flatMap((card) => {
      const detail = details.get(card.source_id)
      return detail ? [{ card, row: toWikiRow(detail) }] : []
    })
    missing += chunk.length - found.length

    // Appearances first; favourites (the "needs backfill" marker) is written last.
    const { error: dErr } = await db.from('card_appearances').delete().in('card_id', found.map((f) => f.card.id))
    if (dErr) throw dErr
    const rows = found.flatMap(({ card, row }) => row.appearances.map((a) => ({ card_id: card.id, ...a })))
    if (rows.length > 0) {
      const { error: iErr } = await db.from('card_appearances').insert(rows)
      if (iErr) throw iErr
    }
    for (const { card, row } of found) {
      const { error } = await db
        .from('cards')
        .update({ favourites: row.favourites, age: row.age, voice_actor: row.voice_actor })
        .eq('id', card.id)
      if (error) throw error
      updated++
    }
    console.log(`batch ${b + 1}/${batches} done (${Math.min((b + 1) * BATCH, cards.length)}/${cards.length})`)
  }
  console.log(`${updated} cards updated, ${missing} not returned by AniList`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

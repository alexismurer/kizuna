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

  for (let b = 0; b < batches; b++) {
    const chunk = cards.slice(b * BATCH, (b + 1) * BATCH)
    const details = new Map((await fetchCharacterDetails(chunk.map((c) => c.source_id))).map((d) => [d.id, d]))
    for (const card of chunk) {
      const detail = details.get(card.source_id)
      if (!detail) continue
      const { appearances, ...columns } = toWikiRow(detail)
      const { error } = await db.from('cards').update(columns).eq('id', card.id)
      if (error) throw error
      const { error: dErr } = await db.from('card_appearances').delete().eq('card_id', card.id)
      if (dErr) throw dErr
      if (appearances.length > 0) {
        const { error: iErr } = await db
          .from('card_appearances')
          .insert(appearances.map((a) => ({ card_id: card.id, ...a })))
        if (iErr) throw iErr
      }
    }
    console.log(`batch ${b + 1}/${batches} done (${Math.min((b + 1) * BATCH, cards.length)}/${cards.length})`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

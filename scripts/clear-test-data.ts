import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local', quiet: true })

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in .env.local')
  const host = new URL(url).hostname
  if (host !== 'localhost' && host !== '127.0.0.1') throw new Error(`refusing to clear test data on non-local ${host}`)
  const db = createClient(url, key, { auth: { persistSession: false } })

  const { data: cards, error: cErr } = await db.from('cards').select('id').eq('source', 'test')
  if (cErr) throw cErr
  const ids = cards.map((c) => c.id as number)
  if (ids.length > 0) {
    const { error: tErr } = await db.from('card_themes').delete().in('card_id', ids)
    if (tErr) throw tErr
    const { error } = await db.from('cards').delete().in('id', ids)
    if (error) throw error
  }

  const { data: series, error: sErr } = await db.from('series').select('id').eq('source', 'test')
  if (sErr) throw sErr
  const testIds = new Set<number>(series.map((s) => s.id as number))
  const { data: pools, error: pErr } = await db.from('daily_pools').select('id, series_ids')
  if (pErr) throw pErr
  const dead = pools.filter((p) => (p.series_ids as number[]).every((i) => testIds.has(i))).map((p) => p.id as number)
  if (dead.length > 0) {
    const { error } = await db.from('daily_pools').delete().in('id', dead)
    if (error) throw error
  }
  if (testIds.size > 0) {
    const { error } = await db.from('series').delete().in('id', [...testIds])
    if (error) throw error
  }
  console.log(`removed ${ids.length} test cards, ${testIds.size} test series, ${dead.length} test pools`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

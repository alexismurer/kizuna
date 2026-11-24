import { readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fetchMedia } from './anilist'
import { genreFor } from './derive'

// Fills series.genre from AniList genres for AniList series that have none.
//   tsx backfill-genre.ts [--env .env.test]          read and write a project with its service key
//   tsx backfill-genre.ts --from series.json --sql out.sql
//                                                    no key: read [{id, source_id}] from a file and
//                                                    write UPDATEs to apply with `supabase db query`
const arg = (name: string) => {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function genresOf(rows: { id: number; source_id: number }[]): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  for (let b = 0; b < rows.length; b += 50) {
    const chunk = rows.slice(b, b + 50)
    const media = new Map((await fetchMedia(chunk.map((r) => r.source_id))).map((m) => [m.id, m]))
    for (const r of chunk) {
      const m = media.get(r.source_id)
      if (m) out.set(r.id, genreFor(m.genres))
    }
    console.log(`${Math.min(b + 50, rows.length)}/${rows.length}`)
  }
  return out
}

async function main() {
  const from = arg('--from')
  if (from) {
    const rows = JSON.parse(readFileSync(from, 'utf8')) as { id: number; source_id: number }[]
    const genres = await genresOf(rows)
    const sql = [...genres].map(([id, g]) => `update series set genre = '${g}' where id = ${Number(id)} and genre is null;`).join('\n')
    writeFileSync(arg('--sql') ?? 'genres.sql', sql + '\n')
    console.log(`${genres.size} of ${rows.length} series got a genre`)
    return
  }
  dotenv.config({ path: arg('--env') ?? '.env.local', quiet: true })
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data, error } = await db.from('series').select('id, source_id').eq('source', 'anilist').is('genre', null)
  if (error) throw error
  const genres = await genresOf(data as { id: number; source_id: number }[])
  for (const [id, genre] of genres) {
    const { error: e } = await db.from('series').update({ genre }).eq('id', id)
    if (e) throw e
  }
  console.log(`${genres.size} of ${data.length} series got a genre`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

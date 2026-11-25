import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, parse } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// Fills the Blind test bank from a local copy of the AnimeThemes backup (their FAQ asks
// bulk users to take the backup rather than hammer the site). Metadata (which file is
// which song) comes from their API, one throttled call per series.
//
//   npm run blind:import -- --dir D:/animethemes [--env .env.local] [--top 400] [--dry]
//
// For our most popular AniList series: up to 3 openings and 2 endings each, cut to 30 s
// from the start (ffmpeg, AAC 128k in m4a, tags stripped so nothing names the song), uploaded under random names to the private "blind"
// bucket, with a blind_clips row. Levels: OP of the top 60 = easy, the rest of the top
// 250 = medium, beyond = hard. Re-runs skip themes already imported; nothing is deleted.
const arg = (name: string) => {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Theme = { id: number; type: string; sequence: number | null; song?: { title?: string; artists?: { name: string }[] }; animethemeentries?: { videos?: { basename: string; audio?: { basename: string } }[] }[] }

function indexFiles(dir: string, out = new Map<string, string>()): Map<string, string> {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) indexFiles(full, out)
    else out.set(parse(name).name.toLowerCase(), full)
  }
  return out
}

async function themesOf(anilistId: number): Promise<{ year: number | null; themes: Theme[] } | null> {
  const url = `https://api.animethemes.moe/anime?filter[has]=resources&filter[site]=AniList&filter[external_id]=${anilistId}&include=animethemes.song.artists,animethemes.animethemeentries.videos.audio`
  for (let tries = 0; tries < 3; tries++) {
    const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'kizuna-blind-import' } })
    if (res.status === 429) {
      await sleep(30_000)
      continue
    }
    if (!res.ok) return null
    const body = (await res.json()) as { anime?: { year: number | null; animethemes: Theme[] }[] }
    const a = body.anime?.[0]
    return a ? { year: a.year, themes: a.animethemes } : null
  }
  return null
}

async function main() {
  const dir = arg('--dir')
  if (!dir) throw new Error('--dir <folder of the AnimeThemes backup> is required')
  const dry = process.argv.includes('--dry')
  if (!dry && spawnSync('ffmpeg', ['-version']).status !== 0) throw new Error('ffmpeg is not on the PATH')
  dotenv.config({ path: arg('--env') ?? '.env.local', quiet: true })
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const top = Number(arg('--top') ?? 400)

  // series by popularity (their best card's rank)
  const best = new Map<number, number>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('cards').select('series_id, popularity_rank').order('id').range(from, from + 999)
    if (error) throw error
    for (const c of data) best.set(c.series_id, Math.min(best.get(c.series_id) ?? Infinity, c.popularity_rank ?? Infinity))
    if (data.length < 1000) break
  }
  const { data: series, error } = await db.from('series').select('id, title, source, source_id').eq('source', 'anilist')
  if (error) throw error
  const ranked = series.filter((s) => best.has(s.id)).sort((a, b) => best.get(a.id)! - best.get(b.id)!).slice(0, top)

  // page through: PostgREST returns at most 1000 rows a call
  const done = new Set<number>()
  for (let from = 0; ; from += 1000) {
    const { data, error: e } = await db.from('blind_clips').select('theme_id').order('theme_id').range(from, from + 999)
    if (e) throw e
    for (const r of data) done.add(r.theme_id)
    if (data.length < 1000) break
  }
  const files = indexFiles(dir)
  console.log(`${files.size} files in the backup, ${ranked.length} series to look up`)
  const tmp = mkdtempSync(join(tmpdir(), 'blind-'))
  let added = 0
  let missing = 0

  for (const [rank, s] of ranked.entries()) {
    const found = await themesOf(s.source_id)
    await sleep(800) // their API allows 90 calls a minute
    if (!found) continue
    const pick = [...found.themes.filter((t) => t.type === 'OP').slice(0, 3), ...found.themes.filter((t) => t.type === 'ED').slice(0, 2)]
    for (const t of pick) {
      if (done.has(t.id) || !t.song?.title) continue
      const video = t.animethemeentries?.[0]?.videos?.[0]
      const file = [video?.audio?.basename, video?.basename].map((b) => b && files.get(parse(b).name.toLowerCase())).find(Boolean)
      if (!file) {
        missing++
        continue
      }
      const level = rank < 60 && t.type === 'OP' ? 1 : rank < 250 ? 2 : 3
      const row = { series_id: s.id, theme_id: t.id, kind: t.type, seq: t.sequence ?? 1, song: t.song.title, artist: t.song.artists?.map((a) => a.name).join(', ') || null, year: found.year, level }
      if (dry) {
        console.log('would add', s.title, row.kind + row.seq, row.song, '←', file)
        continue
      }
      const out = join(tmp, `${randomUUID()}.m4a`)
      const cut = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '0', '-t', '30', '-i', file, '-vn', '-map_metadata', '-1', '-map_chapters', '-1', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out])
      if (cut.status !== 0) {
        console.warn('ffmpeg failed on', file)
        continue
      }
      const path = parse(out).base
      const up = await db.storage.from('blind').upload(path, readFileSync(out), { contentType: 'audio/mp4' })
      rmSync(out)
      if (up.error) throw up.error
      const ins = await db.from('blind_clips').insert({ ...row, path })
      if (ins.error) {
        // no orphan clips in storage
        await db.storage.from('blind').remove([path])
        throw ins.error
      }
      done.add(t.id)
      added++
    }
    if (rank % 20 === 19) console.log(`${rank + 1}/${ranked.length} series, ${added} clips added, ${missing} not in the backup`)
  }
  rmSync(tmp, { recursive: true, force: true })
  console.log(`done: ${added} clips added, ${missing} themes not found in the backup`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { MAL_HEADERS, parsePictures, picturesPageUrl } from '../../src/lib/mal/pictures'
import { parseTopPage, type TopRow } from './parse'

// Polite reads of MyAnimeList's public pages: one request every 2 s, cached on disk.
const MIN_INTERVAL_MS = 2000
const CACHE_DIR = path.join(__dirname, '.cache')

let last = 0
async function throttle() {
  const wait = last + MIN_INTERVAL_MS - Date.now()
  last = Math.max(Date.now(), last + MIN_INTERVAL_MS)
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
}

async function page(url: string, cache: boolean): Promise<string | null> {
  const file = path.join(CACHE_DIR, `${createHash('sha1').update(url).digest('hex')}.html`)
  if (cache && existsSync(file)) return readFileSync(file, 'utf8')
  for (let attempt = 1; ; attempt++) {
    await throttle()
    let res: Response
    try {
      res = await fetch(url, { headers: MAL_HEADERS })
    } catch (e) {
      if (attempt >= 5) throw e
      await new Promise((r) => setTimeout(r, 30_000 * attempt))
      continue
    }
    if (res.status === 404) return null
    if (res.status === 429 || res.status === 403 || res.status >= 500) {
      if (attempt >= 5) throw new Error(`MAL ${res.status} for ${url}`)
      await new Promise((r) => setTimeout(r, 60_000 * attempt))
      continue
    }
    if (!res.ok) throw new Error(`MAL ${res.status} for ${url}`)
    const html = await res.text()
    if (cache) {
      mkdirSync(CACHE_DIR, { recursive: true })
      writeFileSync(file, html)
    }
    return html
  }
}

export async function topCharacters(offset: number): Promise<TopRow[]> {
  const html = await page(`https://myanimelist.net/character.php?limit=${offset}`, true)
  return html ? parseTopPage(html) : []
}

export async function characterPictures(malId: number): Promise<string[]> {
  const html = await page(picturesPageUrl(malId), false)
  return html ? parsePictures(html) : []
}

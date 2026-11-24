import { fullSizeUrl } from '../../src/lib/mal/pictures'

export type TopRow = {
  malId: number
  name: string
  kanji: string | null
  anime: number[]
  manga: number[]
  favorites: number
  image: string | null
}

const decode = (s: string) =>
  s
    .replace(/&#0*39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim()

const between = (s: string, from: string, to: string) => {
  const i = s.indexOf(from)
  if (i < 0) return ''
  const j = s.indexOf(to, i + from.length)
  return s.slice(i + from.length, j < 0 ? undefined : j)
}

const ids = (s: string, kind: 'anime' | 'manga') => [...s.matchAll(new RegExp(`myanimelist\\.net/${kind}/(\\d+)`, 'g'))].map((m) => Number(m[1]))

// one page of https://myanimelist.net/character.php?limit=<offset> (50 characters, most favourited first)
export function parseTopPage(html: string): TopRow[] {
  const rows: TopRow[] = []
  for (const chunk of html.split('<tr class="ranking-list">').slice(1)) {
    const link = chunk.match(/<a href="https:\/\/myanimelist\.net\/character\/(\d+)\/[^"]*" class="fs14 fw-b">([^<]*)<\/a>/)
    if (!link) continue
    const kanji = chunk.match(/<div class="fs12 fn-grey6 text-ellipsis">\(([^<]*)\)<\/div>/)
    const img = chunk.match(/data-src="([^"]+)"/)
    const fav = chunk.match(/<td class="favorites">\s*([\d,]+)\s*<\/td>/)
    rows.push({
      malId: Number(link[1]),
      name: decode(link[2]),
      kanji: kanji ? decode(kanji[1]) || null : null,
      anime: ids(between(chunk, 'class="animeography"', 'class="mangaography"'), 'anime'),
      manga: ids(between(chunk, 'class="mangaography"', 'class="favorites"'), 'manga'),
      favorites: fav ? Number(fav[1].replace(/,/g, '')) : 0,
      image: img ? fullSizeUrl(img[1]) : null,
    })
  }
  return rows
}

// "Hinata, Shouyou" and "Shoyo Hinata" give the same key
export function nameKey(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((t) => t.replace(/ou/g, 'o').replace(/uu/g, 'u').replace(/oo/g, 'o'))
    .sort()
    .join(' ')
}

const nativeKey = (s: string) => s.replace(/[\s・･·=＝]/g, '')

type AniListName = { id: number; name: { full: string; native: string | null; alternative?: string[] | null } }

// the single AniList character that is this MAL character, or null when none or several fit
export function pickMatch<T extends AniListName>(mal: { name: string; kanji: string | null }, list: T[]): T | null {
  if (mal.kanji) {
    const k = nativeKey(mal.kanji)
    const hits = list.filter((c) => c.name.native && nativeKey(c.name.native) === k)
    if (hits.length === 1) return hits[0]
    if (hits.length > 1) return null
  }
  const key = nameKey(mal.name)
  if (!key) return null
  const hits = list.filter((c) => [c.name.full, ...(c.name.alternative ?? [])].some((n) => n && nameKey(n) === key))
  return hits.length === 1 ? hits[0] : null
}

// the catalog was ranked by AniList favourites; a newcomer goes right after every card with more
export function estimateRank(favourites: number, catalogFavourites: number[]): number {
  return 1 + catalogFavourites.filter((f) => f > favourites).length
}

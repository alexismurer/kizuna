import type { Media } from './anilist'

const UP = new Set(['PREQUEL', 'PARENT'])

export async function franchiseRoot(
  mediaId: number,
  getMedia: (ids: number[]) => Promise<Media[]>,
  memo: Map<number, Media> = new Map(),
): Promise<Media> {
  const cached = memo.get(mediaId)
  if (cached) return cached

  const seen = new Map<number, Media>()
  let id = mediaId
  let root: Media | undefined
  while (!root) {
    const [media] = await getMedia([id])
    if (!media) {
      if (seen.size === 0) throw new Error(`AniList media ${id} not found`)
      console.warn(`AniList media ${id} not found; using last fetched media as franchise root`)
      root = [...seen.values()].at(-1)
      break
    }
    seen.set(id, media)
    const ups = media.relations.edges.filter((e) => UP.has(e.relationType)).map((e) => e.node.id)
    if (ups.length === 0) {
      root = media
      break
    }
    const next = Math.min(...ups)
    const known = memo.get(next)
    if (known) {
      root = known
    } else if (seen.has(next)) {
      root = seen.get(Math.min(...seen.keys()))
    } else {
      id = next
    }
  }
  const found = root as Media
  for (const k of seen.keys()) memo.set(k, found)
  return found
}

const BATCH = 50

function upIds(m: Media): number[] {
  return m.relations.edges.filter((e) => UP.has(e.relationType)).map((e) => e.node.id)
}

/** In-memory media store that batches fetches (<=50 ids per call). */
export function createMediaStore(fetchMedia: (ids: number[]) => Promise<Media[]>) {
  const map = new Map<number, Media>()
  const tried = new Set<number>()

  async function load(ids: number[]) {
    const missing = [...new Set(ids)].filter((i) => !tried.has(i))
    for (let i = 0; i < missing.length; i += BATCH) {
      const chunk = missing.slice(i, i + BATCH)
      for (const id of chunk) tried.add(id)
      for (const m of await fetchMedia(chunk)) map.set(m.id, m)
    }
  }

  /** Fetch ids, then follow PREQUEL/PARENT hops level by level. */
  async function prefetch(ids: number[]) {
    let frontier = [...new Set(ids)]
    while (frontier.length > 0) {
      await load(frontier)
      const next = new Set<number>()
      for (const id of frontier) {
        const m = map.get(id)
        if (m) for (const u of upIds(m)) if (!tried.has(u)) next.add(u)
      }
      frontier = [...next]
    }
  }

  async function getMedia(ids: number[]): Promise<Media[]> {
    await load(ids)
    return ids.map((i) => map.get(i)).filter((m): m is Media => !!m)
  }

  /** Pre-load media nodes already in hand so they are never refetched. */
  function seed(nodes: Media[]) {
    for (const m of nodes) {
      map.set(m.id, m)
      tried.add(m.id)
    }
  }

  return { prefetch, getMedia, seed }
}

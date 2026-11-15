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
    if (!media) throw new Error(`AniList media ${id} not found`)
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
  for (const k of seen.keys()) memo.set(k, root)
  return root
}

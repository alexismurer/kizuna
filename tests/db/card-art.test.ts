import { afterAll, describe, expect, it } from 'vitest'
import { admin, newPlayer } from './helpers'

type P = Awaited<ReturnType<typeof newPlayer>>

async function withRole(role: 'admin' | 'moderator'): Promise<P> {
  const p = await newPlayer()
  const { error } = await admin.from('admins').insert({ player_id: p.userId, role })
  if (error) throw error
  return p
}

const PIC = (n: number) => `https://cdn.myanimelist.net/images/characters/1/${n}.jpg`
const malId = () => 900_000_000 + Math.floor(Math.random() * 90_000_000)

type CardRow = { id: number; malId: number | null; pictures: string[] | null; imageUrl: string | null; originalUrl: string | null; reviewedBy: string | null }

const restore: { id: number; image_url: string | null }[] = []
afterAll(async () => {
  for (const c of restore) {
    await admin.from('cards').update({ image_url: c.image_url }).eq('id', c.id)
    await admin.from('mal_links').delete().eq('card_id', c.id)
    await admin.from('card_art_log').delete().eq('card_id', c.id)
  }
})

async function pickCard(offset: number) {
  const { data, error } = await admin.from('cards').select('id, name, image_url').order('id', { ascending: false }).range(offset, offset).single()
  if (error) throw error
  await admin.from('mal_links').delete().eq('card_id', data.id)
  await admin.from('card_art_log').delete().eq('card_id', data.id)
  restore.push({ id: data.id, image_url: data.image_url })
  return data as { id: number; name: string; image_url: string | null }
}

describe('card art gate', () => {
  it('players get not_admin; moderators cannot accept', async () => {
    const [p, m] = await Promise.all([newPlayer(), withRole('moderator')])
    const calls: [string, Record<string, unknown>][] = [
      ['art_cards', { p_filter: 'all', p_query: null, p_offset: 0 }],
      ['art_candidates', { p_filter: 'new', p_query: null, p_offset: 0 }],
      ['art_save_pictures', { p_mal_id: 1, p_pictures: [] }],
      ['art_link', { p_card: 1, p_mal_id: 1, p_pictures: [] }],
      ['art_set_image', { p_card: 1, p_url: 'x' }],
      ['art_propose', { p_mal_id: 1, p_url: 'x' }],
      ['art_reject', { p_mal_id: 1 }],
      ['art_accept', { p_mal_id: 1, p_url: 'x' }],
    ]
    for (const [fn, args] of calls) expect((await p.client.rpc(fn, args)).error?.message, fn).toContain('not_admin')
    expect((await m.client.rpc('art_accept', { p_mal_id: 1, p_url: 'x' })).error?.message).toContain('not_admin')
    expect((await p.client.from('mal_candidates').select('*')).data ?? []).toEqual([])
  })
})

describe('existing cards', { timeout: 30_000 }, () => {
  it('a moderator links a card, saves its gallery and picks a picture; the old one stays selectable', async () => {
    const m = await withRole('moderator')
    const card = await pickCard(0)
    const id = malId()

    expect((await m.client.rpc('art_link', { p_card: card.id, p_mal_id: id, p_pictures: ['https://evil.example/x.jpg'] })).error?.message).toContain('invalid_image')
    expect((await m.client.rpc('art_link', { p_card: card.id, p_mal_id: id, p_pictures: [PIC(1)] })).error).toBeNull()
    expect((await m.client.rpc('art_save_pictures', { p_mal_id: id, p_pictures: [PIC(1), PIC(2)] })).error).toBeNull()

    const list = await m.client.rpc('art_cards', { p_filter: 'todo', p_query: card.name, p_offset: 0 })
    const row = (list.data as { rows: CardRow[] }).rows.find((r) => r.id === card.id)!
    expect(row.malId).toBe(id)
    expect(row.pictures).toEqual([PIC(1), PIC(2)])

    expect((await m.client.rpc('art_set_image', { p_card: card.id, p_url: PIC(9) })).error?.message).toContain('invalid_image')
    expect((await m.client.rpc('art_set_image', { p_card: card.id, p_url: PIC(2) })).error).toBeNull()
    const after = await admin.from('cards').select('image_url').eq('id', card.id).single()
    expect(after.data!.image_url).toBe(PIC(2))
    const log = await admin.from('card_art_log').select('old_url, new_url').eq('card_id', card.id)
    expect(log.data).toEqual([{ old_url: card.image_url, new_url: PIC(2) }])

    const reviewed = await m.client.rpc('art_cards', { p_filter: 'reviewed', p_query: card.name, p_offset: 0 })
    const r2 = (reviewed.data as { rows: CardRow[] }).rows.find((r) => r.id === card.id)!
    expect(r2.originalUrl).toBe(card.image_url)
    expect(r2.reviewedBy).toBeTruthy()

    // back to the original picture
    expect((await m.client.rpc('art_set_image', { p_card: card.id, p_url: card.image_url })).error).toBeNull()
    expect((await admin.from('cards').select('image_url').eq('id', card.id).single()).data!.image_url).toBe(card.image_url)
  })

  it('an unlinked card can be marked fine as it is; a MAL id cannot be linked twice', async () => {
    const m = await withRole('moderator')
    const [a, b] = [await pickCard(1), await pickCard(2)]
    expect((await m.client.rpc('art_set_image', { p_card: a.id, p_url: a.image_url })).error).toBeNull()
    const link = await admin.from('mal_links').select('mal_id, reviewed_at').eq('card_id', a.id).single()
    expect(link.data!.mal_id).toBeNull()
    expect(link.data!.reviewed_at).toBeTruthy()

    const id = malId()
    expect((await m.client.rpc('art_link', { p_card: a.id, p_mal_id: id, p_pictures: [] })).error).toBeNull()
    expect((await m.client.rpc('art_link', { p_card: b.id, p_mal_id: id, p_pictures: [] })).error?.message).toContain('mal_taken')
  })
})

describe('new cards', { timeout: 30_000 }, () => {
  async function candidate(seriesSourceId: number) {
    const id = malId()
    const anilistId = malId()
    const { error } = await admin.from('mal_candidates').insert({
      mal_id: id,
      anilist_id: anilistId,
      name: `Test ${id}`,
      native_name: 'テスト',
      gender: 'Female',
      favorites: 10,
      series_source_id: seriesSourceId,
      series_title: `Album ${id}`,
      series_cover: null,
      themes: ['female', 'no-such-theme'],
      popularity_rank: 6000,
      rarity: 'common',
      pow: 41,
      aura: 38,
      default_url: PIC(10),
      pictures: [PIC(11)],
    })
    if (error) throw error
    return { id, anilistId }
  }

  it('moderator proposes, admin accepts: the card, its album and themes appear', async () => {
    const [m, a] = await Promise.all([withRole('moderator'), withRole('admin')])
    const { id, anilistId } = await candidate(malId())

    expect((await m.client.rpc('art_propose', { p_mal_id: id, p_url: PIC(99) })).error?.message).toContain('invalid_image')
    expect((await m.client.rpc('art_propose', { p_mal_id: id, p_url: PIC(11) })).error).toBeNull()
    const listed = await a.client.rpc('art_candidates', { p_filter: 'proposed', p_query: `Test ${id}`, p_offset: 0 })
    const row = (listed.data as { rows: { malId: number; imageUrl: string; proposedBy: string; newSeries: boolean }[] }).rows[0]
    expect(row).toMatchObject({ malId: id, imageUrl: PIC(11), newSeries: true })
    expect(row.proposedBy).toBeTruthy()

    const { data: max } = await admin.from('cards').select('number').order('number', { ascending: false }).limit(1).single()
    const accepted = await a.client.rpc('art_accept', { p_mal_id: id, p_url: PIC(10) })
    expect(accepted.error).toBeNull()
    const cardId = accepted.data as number
    const card = await admin.from('cards').select('number, source, source_id, image_url, rarity, series(title)').eq('id', cardId).single()
    expect(card.data).toMatchObject({ number: max!.number + 1, source: 'anilist', source_id: anilistId, image_url: PIC(10), rarity: 'common', series: { title: `Album ${id}` } })
    const themes = await admin.from('card_themes').select('theme_id').eq('card_id', cardId)
    expect(themes.data).toEqual([{ theme_id: 'female' }])
    expect((await a.client.rpc('art_accept', { p_mal_id: id, p_url: PIC(10) })).error?.message).toContain('invalid_status')
    expect((await m.client.rpc('art_reject', { p_mal_id: id })).error?.message).toContain('invalid_status')

    // clean the catalog up again
    await admin.from('mal_links').delete().eq('card_id', cardId)
    await admin.from('mal_candidates').delete().eq('mal_id', id)
    await admin.from('card_themes').delete().eq('card_id', cardId)
    const sid = (await admin.from('cards').select('series_id').eq('id', cardId).single()).data!.series_id
    await admin.from('cards').delete().eq('id', cardId)
    await admin.from('series').delete().eq('id', sid)
  })

  it('rejected candidates can be proposed again', async () => {
    const m = await withRole('moderator')
    const { id } = await candidate(malId())
    expect((await m.client.rpc('art_reject', { p_mal_id: id })).error).toBeNull()
    expect((await admin.from('mal_candidates').select('status').eq('mal_id', id).single()).data!.status).toBe('rejected')
    expect((await m.client.rpc('art_propose', { p_mal_id: id, p_url: PIC(10) })).error).toBeNull()
    await admin.from('mal_candidates').delete().eq('mal_id', id)
  })
})

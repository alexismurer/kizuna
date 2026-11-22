import { describe, expect, it } from 'vitest'
import { admin, newPlayer, signedInClient } from './helpers'

type WikiRow = { id: number; name: string; series_title: string; unlocked: boolean }
type WikiIndex = { total: number; unlocked: number; matches: number; rows: WikiRow[] }

async function cardIdByNumber(n: number): Promise<number> {
  const { data, error } = await admin.from('cards').select('id').eq('number', n).single()
  if (error) throw error
  return data!.id as number
}

async function resetSales(cardId: number, sales: { price: number; daysAgo: number }[]) {
  const del = await admin.from('market_sales').delete().eq('card_id', cardId)
  if (del.error) throw del.error
  if (!sales.length) return
  const rows = sales.map((s) => ({
    card_id: cardId,
    price: s.price,
    source: 'listing',
    sold_at: new Date(Date.now() - s.daysAgo * 86_400_000).toISOString(),
  }))
  const { error } = await admin.from('market_sales').insert(rows)
  if (error) throw error
}

describe('wiki_index', () => {
  it('wiki_index counts total, unlocked and matches', async () => {
    const p = await newPlayer()
    const ids = [await cardIdByNumber(5), await cardIdByNumber(77)]
    const ins = await admin.from('inventory').insert(ids.map((card_id) => ({ player_id: p.userId, card_id, count: 1 })))
    expect(ins.error).toBeNull()
    const { count: total } = await admin.from('cards').select('id', { count: 'exact', head: true })

    const all = await p.client.rpc('wiki_index', {})
    expect(all.error).toBeNull()
    const a = all.data as WikiIndex
    expect(a.total).toBe(total)
    expect(a.unlocked).toBe(2)
    expect(a.matches).toBe(total)

    const mine = await p.client.rpc('wiki_index', { p_unlocked_only: true })
    expect(mine.error).toBeNull()
    const m = mine.data as WikiIndex
    expect(m.matches).toBe(2)
    expect(m.rows.map((r) => r.id).sort()).toEqual([...ids].sort())
    expect(m.rows.every((r) => r.unlocked)).toBe(true)
  })

  it('wiki_index search escapes wildcards', async () => {
    const p = await newPlayer()
    const pct = await p.client.rpc('wiki_index', { p_query: '%' })
    expect(pct.error).toBeNull()
    expect((pct.data as WikiIndex).matches).toBe(0)

    const q = await p.client.rpc('wiki_index', { p_query: '  card 1 ', p_limit: 120 })
    expect(q.error).toBeNull()
    const names = (q.data as WikiIndex).rows.map((r) => r.name)
    expect(names).toContain('Card 1')
    expect(names).toContain('Card 10')
    expect(names).not.toContain('Card 2')

    const quote = await p.client.rpc('wiki_index', { p_query: "'" })
    expect(quote.error).toBeNull()
  })

  it('wiki_index searches series title', async () => {
    const p = await newPlayer()
    const { data: s } = await admin.from('series').select('id, title').eq('title', 'Test Series 2').single()
    const { count } = await admin.from('cards').select('id', { count: 'exact', head: true }).eq('series_id', s!.id)
    const r = await p.client.rpc('wiki_index', { p_query: 'Test Series 2', p_limit: 120 })
    expect(r.error).toBeNull()
    const d = r.data as WikiIndex
    expect(d.matches).toBe(count)
    expect(d.rows.every((row) => row.series_title === 'Test Series 2')).toBe(true)
  })

  it('wiki_index gives non-players nothing', async () => {
    const { client } = await signedInClient()
    const r = await client.rpc('wiki_index', {})
    expect(r.error).toBeNull()
    expect((r.data as WikiIndex).rows).toEqual([])
  })
})

describe('card_market_stats', () => {
  it('card_market_stats medians and counts', async () => {
    const p = await newPlayer()
    const card = await cardIdByNumber(115)
    await resetSales(card, [
      { price: 100, daysAgo: 0 },
      { price: 200, daysAgo: 0 },
      { price: 300, daysAgo: 0 },
      { price: 1000, daysAgo: 40 },
    ])
    const r = await p.client.rpc('card_market_stats', { p_card_id: card })
    expect(r.error).toBeNull()
    expect(r.data).toMatchObject({ median7: 200, median30: 200, sales30: 3 })

    const empty = await cardIdByNumber(116)
    await resetSales(empty, [])
    const e = await p.client.rpc('card_market_stats', { p_card_id: empty })
    expect(e.error).toBeNull()
    expect(e.data).toMatchObject({ median7: null, median30: null, sales30: 0 })
  })
})

describe('card_sales_history', () => {
  it('card_sales_history groups by day', async () => {
    const p = await newPlayer()
    const card = await cardIdByNumber(117)
    await resetSales(card, [
      { price: 100, daysAgo: 0 },
      { price: 300, daysAgo: 0 },
      { price: 50, daysAgo: 3 },
    ])
    const r = await p.client.rpc('card_sales_history', { p_card_id: card, p_days: 7 })
    expect(r.error).toBeNull()
    const rows = r.data as { day: string; median: number; sales: number }[]
    expect(rows).toHaveLength(2)
    expect(rows[0].day < rows[1].day).toBe(true)
    expect(rows[1]).toMatchObject({ median: 200, sales: 2 })
    expect(rows[0]).toMatchObject({ median: 50, sales: 1 })

    const bad = await p.client.rpc('card_sales_history', { p_card_id: card, p_days: 5 })
    expect(bad.error?.message).toContain('invalid_duration')
  })
})

describe('card_appearances', () => {
  it('card_appearances readable by players only', async () => {
    const card = await cardIdByNumber(118)
    await admin.from('card_appearances').delete().eq('card_id', card)
    const ins = await admin
      .from('card_appearances')
      .insert({ card_id: card, position: 0, media_type: 'ANIME', title: 'Some Show' })
    expect(ins.error).toBeNull()

    const p = await newPlayer()
    const mine = await p.client.from('card_appearances').select('*').eq('card_id', card)
    expect(mine.error).toBeNull()
    expect(mine.data).toHaveLength(1)

    const { client } = await signedInClient()
    const other = await client.from('card_appearances').select('*').eq('card_id', card)
    expect(other.data ?? []).toHaveLength(0)
  })
})

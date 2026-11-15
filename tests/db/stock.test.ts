import { describe, it, expect } from 'vitest'
import { admin, signedInClient } from './helpers'

const t = new Date('2026-01-01T00:00:00Z')
const plus = (min: number) => new Date(t.getTime() + min * 60_000)

async function stockAt(stock: number, min: number) {
  const { data, error } = await admin.rpc('free_stock_at', {
    p_stock: stock,
    p_at: t.toISOString(),
    p_now: plus(min).toISOString(),
  })
  expect(error).toBeNull()
  const row = Array.isArray(data) ? data[0] : data
  return { stock: row.stock, next_at: row.next_at ? new Date(row.next_at).getTime() : null }
}

describe('free_stock_at', () => {
  it('stays at cap with no next time', async () => {
    expect(await stockAt(10, 300)).toEqual({ stock: 10, next_at: null })
  })
  it('gains one per 10 minutes', async () => {
    expect(await stockAt(3, 25)).toEqual({ stock: 5, next_at: plus(30).getTime() })
  })
  it('caps at 10', async () => {
    expect(await stockAt(0, 200)).toEqual({ stock: 10, next_at: null })
  })
})

describe('my_status', () => {
  it('rejects a user who is not a player', async () => {
    const { client } = await signedInClient()
    const { error } = await client.rpc('my_status')
    expect(error?.message).toContain('not_a_player')
  })
})

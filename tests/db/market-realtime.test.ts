import { describe, it, expect } from 'vitest'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { admin, newPlayer, giveCards, type TestClient } from './helpers'

type Row = Record<string, unknown>

// Subscribes `client` to changes on `table`; `ready` resolves once Realtime
// reports the database listener is up (on a cold start that is after SUBSCRIBED).
function watch(client: TestClient, table: string) {
  const events: RealtimePostgresChangesPayload<Row>[] = []
  let listening: () => void = () => {}
  const ready = new Promise<void>((resolve) => (listening = resolve))
  const channel = client
    .channel(`test-${table}-${Math.random()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table }, (p) => events.push(p))
    .on('system', {}, (p: { extension?: string; status?: string }) => {
      if (p.extension === 'postgres_changes' && p.status === 'ok') listening()
    })
  // the client retries on its own; if it never connects, `ready` times the test out
  channel.subscribe()
  return { events, ready, stop: () => client.removeChannel(channel) }
}

async function until(check: () => boolean, ms = 10_000) {
  const end = Date.now() + ms
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 100))
  }
}

describe('market realtime', () => {
  it('broadcasts auction changes to other players and notifications only to their owner', async () => {
    const { data: cards } = await admin.from('cards').select('id').order('id').limit(1)
    const card = cards![0].id as number
    const seller = await newPlayer()
    const bidder = await newPlayer({ currency: 1000 })
    const other = await newPlayer()
    await giveCards(seller.userId, card, 1)

    const auctions = watch(other.client, 'auctions')
    const sellerNotes = watch(seller.client, 'notifications')
    const otherNotes = watch(other.client, 'notifications')
    try {
      await Promise.all([auctions.ready, sellerNotes.ready, otherNotes.ready])

      const { data: id, error } = await seller.client.rpc('create_auction', {
        p_card_id: card,
        p_start_price: 10,
        p_duration_h: 1,
      })
      expect(error).toBeNull()
      await until(() => auctions.events.some((e) => e.eventType === 'INSERT' && (e.new as Row).id === id))

      const bid = await bidder.client.rpc('place_bid', { p_id: id, p_amount: 10 })
      expect(bid.error).toBeNull()
      await until(() => auctions.events.some((e) => e.eventType === 'UPDATE' && (e.new as Row).bid_count === 1))

      // the auction expires and settles: the seller is notified, nobody else
      await admin.from('auctions').update({ ends_at: new Date(Date.now() - 1000).toISOString() }).eq('id', id)
      const settled = await admin.rpc('_settle_market', { p_now: new Date().toISOString() })
      expect(settled.error).toBeNull()
      await until(() => sellerNotes.events.some((e) => e.eventType === 'INSERT'))
      await new Promise((r) => setTimeout(r, 1000))
      expect(otherNotes.events).toHaveLength(0)
    } finally {
      await Promise.all([auctions.stop(), sellerNotes.stop(), otherNotes.stop()])
    }
  }, 30_000)
})

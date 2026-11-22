import { describe, it, expect } from 'vitest'
import { admin, newPlayer, setPlayer, type TestClient } from './helpers'

const MIN = 60_000
const at = (iso: string, ms = 0) => new Date(Date.parse(iso) + ms).toISOString()

async function subscribe(client: TestClient, timezone = 'Europe/Paris') {
  const { error } = await client.rpc('save_push_subscription', {
    p_endpoint: `https://push.test/${Math.random().toString(36).slice(2)}`,
    p_p256dh: 'key',
    p_auth: 'secret',
    p_locale: 'en',
    p_timezone: timezone,
  })
  if (error) throw error
}

async function category(kind: string) {
  const { data, error } = await admin.rpc('_push_category', { p_kind: kind })
  if (error) throw error
  return data
}

async function noteFor(userId: string, kind = 'sold'): Promise<number> {
  const { data, error } = await admin.from('notifications').insert({ player_id: userId, kind, payload: {} }).select('id').single()
  if (error) throw error
  return data.id as number
}

async function wanted(id: number, now = new Date().toISOString()) {
  const { data, error } = await admin.rpc('_push_wanted', { p_notification_id: id, p_now: now })
  if (error) throw error
  return data as boolean
}

async function targets(now: string): Promise<string[]> {
  const { data, error } = await admin.rpc('_booster_push_targets', { p_now: now })
  if (error) throw error
  return (data as (string | { _booster_push_targets: string })[]).map((r) => (typeof r === 'string' ? r : Object.values(r)[0] as string))
}

describe('_push_category', () => {
  it('maps kinds to categories', async () => {
    expect(await category('sold')).toBe('market')
    expect(await category('trade_received')).toBe('market')
    expect(await category('referral_joined')).toBe('social')
    expect(await category('admin_card')).toBe('social')
    expect(await category('chat_message')).toBeNull()
  })
})

describe('_push_wanted', () => {
  it('is true for a fresh sale of a subscribed player', async () => {
    const { userId, client } = await newPlayer()
    await subscribe(client)
    expect(await wanted(await noteFor(userId))).toBe(true)
  })

  it('respects the category pref', async () => {
    const { userId, client } = await newPlayer()
    await subscribe(client)
    await client.rpc('set_push_prefs', { p_prefs: { market: false } })
    expect(await wanted(await noteFor(userId))).toBe(false)
    expect(await wanted(await noteFor(userId, 'friend_request'))).toBe(true)
  })

  it('is false without a subscription', async () => {
    const { userId } = await newPlayer()
    expect(await wanted(await noteFor(userId))).toBe(false)
  })

  it('is false while the player is in the game', async () => {
    const { userId, client } = await newPlayer()
    await subscribe(client)
    const now = new Date().toISOString()
    await setPlayer(userId, { last_active_at: at(now, -1 * MIN) })
    expect(await wanted(await noteFor(userId), now)).toBe(false)
    await setPlayer(userId, { last_active_at: at(now, -3 * MIN) })
    expect(await wanted(await noteFor(userId), now)).toBe(true)
  })

  it('is false for an unknown kind', async () => {
    const { userId, client } = await newPlayer()
    await subscribe(client)
    expect(await wanted(await noteFor(userId, 'mystery'))).toBe(false)
  })
})

describe('_booster_push_targets', () => {
  const noon = '2030-06-01T10:00:00Z' // 12:00 in Paris

  async function fullPlayer(now = noon, tz = 'Europe/Paris') {
    const p = await newPlayer()
    await subscribe(p.client, tz)
    await setPlayer(p.userId, { free_stock: 0, stock_at: at(now, -100 * MIN) })
    return p
  }

  it('includes a full, idle, subscribed player in daytime', async () => {
    const { userId } = await fullPlayer()
    expect(await targets(noon)).toContain(userId)
  })

  it('skips a stock that is not full yet', async () => {
    const { userId } = await fullPlayer()
    await setPlayer(userId, { stock_at: at(noon, -90 * MIN) })
    expect(await targets(noon)).not.toContain(userId)
  })

  it('skips a fill already alerted', async () => {
    const { userId } = await fullPlayer()
    await setPlayer(userId, { booster_push_for: at(noon, -100 * MIN) })
    expect(await targets(noon)).not.toContain(userId)
  })

  it('waits 4 hours between alerts', async () => {
    const { userId } = await fullPlayer()
    await setPlayer(userId, { booster_pushed_at: at(noon, -3 * 60 * MIN) })
    expect(await targets(noon)).not.toContain(userId)
    await setPlayer(userId, { booster_pushed_at: at(noon, -(4 * 60 + 1) * MIN) })
    expect(await targets(noon)).toContain(userId)
  })

  it('skips a player active in the last 5 minutes', async () => {
    const { userId } = await fullPlayer()
    await setPlayer(userId, { last_active_at: at(noon, -4 * MIN) })
    expect(await targets(noon)).not.toContain(userId)
  })

  it('skips a player who turned booster alerts off', async () => {
    const { userId, client } = await fullPlayer()
    await client.rpc('set_push_prefs', { p_prefs: { boosters: false } })
    expect(await targets(noon)).not.toContain(userId)
  })

  it('skips a player without a subscription', async () => {
    const { userId } = await newPlayer()
    await setPlayer(userId, { free_stock: 0, stock_at: at(noon, -100 * MIN) })
    expect(await targets(noon)).not.toContain(userId)
  })

  it("follows the player's night and morning", async () => {
    const night = '2030-06-01T21:30:00Z' // 23:30 in Paris
    const morning = '2030-06-01T06:00:00Z' // 08:00 in Paris
    const a = await fullPlayer(night)
    expect(await targets(night)).not.toContain(a.userId)
    const b = await fullPlayer(morning)
    expect(await targets(morning)).toContain(b.userId)
  })

  it('a bad time zone in one row does not break the others', async () => {
    const bad = await fullPlayer()
    await admin.from('push_subscriptions').update({ timezone: 'Mars/Base' }).eq('player_id', bad.userId)
    const good = await fullPlayer()
    expect(await targets(noon)).toContain(good.userId)
  })

  it('after opening one booster, the refill waits for the 4-hour gap', async () => {
    const { userId } = await fullPlayer()
    const { data: sent, error } = await admin.rpc('_booster_push', { p_now: noon })
    expect(error).toBeNull()
    expect(sent).toBeGreaterThanOrEqual(1)
    const { data: row } = await admin.from('players').select('booster_push_for, booster_pushed_at').eq('id', userId).single()
    expect(Date.parse(row!.booster_push_for)).toBe(Date.parse(at(noon, -100 * MIN)))
    expect(Date.parse(row!.booster_pushed_at)).toBe(Date.parse(noon))
    expect(await targets(noon)).not.toContain(userId)
    // opened one booster a minute later: 9 left, refill restarts
    await setPlayer(userId, { free_stock: 9, stock_at: at(noon, 1 * MIN) })
    expect(await targets(at(noon, 11 * MIN))).not.toContain(userId)
    expect(await targets(at(noon, (4 * 60 + 1) * MIN))).toContain(userId)
  })
})

describe('push_config', () => {
  it('is not readable by players', async () => {
    const { client } = await newPlayer()
    const { data } = await client.from('push_config').select('*')
    expect(data ?? []).toHaveLength(0)
  })
})

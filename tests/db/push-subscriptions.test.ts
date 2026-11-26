import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { admin, anonKey, newPlayer, url, type TestClient } from './helpers'

const endpoint = () => `https://push.test/${Math.random().toString(36).slice(2)}`

function save(client: TestClient, ep: string, locale = 'fr', timezone = 'Europe/Paris') {
  return client.rpc('save_push_subscription', {
    p_endpoint: ep,
    p_p256dh: 'key',
    p_auth: 'secret',
    p_locale: locale,
    p_timezone: timezone,
  })
}

async function subOf(ep: string) {
  const { data, error } = await admin.from('push_subscriptions').select('*').eq('endpoint', ep)
  if (error) throw error
  return data!
}

describe('push subscriptions', () => {
  it('saves a subscription for the caller', async () => {
    const { userId, client } = await newPlayer()
    const ep = endpoint()
    expect((await save(client, ep)).error).toBeNull()
    const rows = await subOf(ep)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ player_id: userId, locale: 'fr', timezone: 'Europe/Paris', p256dh: 'key', auth: 'secret' })
  })

  it("re-assigns an endpoint to the account that saves it last", async () => {
    const a = await newPlayer()
    const b = await newPlayer()
    const ep = endpoint()
    await save(a.client, ep)
    expect((await save(b.client, ep, 'de')).error).toBeNull()
    const rows = await subOf(ep)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ player_id: b.userId, locale: 'de' })
  })

  it('falls back to en and UTC', async () => {
    const { client } = await newPlayer()
    const ep = endpoint()
    expect((await save(client, ep, 'it', 'Mars/Base')).error).toBeNull()
    expect((await subOf(ep))[0]).toMatchObject({ locale: 'en', timezone: 'UTC' })
  })

  it("deletes only the caller's own subscription", async () => {
    const a = await newPlayer()
    const b = await newPlayer()
    const ep = endpoint()
    await save(a.client, ep)
    await b.client.rpc('delete_push_subscription', { p_endpoint: ep })
    expect(await subOf(ep)).toHaveLength(1)
    await a.client.rpc('delete_push_subscription', { p_endpoint: ep })
    expect(await subOf(ep)).toHaveLength(0)
  })

  it('is not readable by players', async () => {
    const { client } = await newPlayer()
    const ep = endpoint()
    await save(client, ep)
    const { data } = await client.from('push_subscriptions').select('*')
    expect(data ?? []).toHaveLength(0)
  })
})

describe('push prefs and presence', () => {
  it('prefs default to all on and ignore unknown keys', async () => {
    const { client } = await newPlayer()
    const before = await client.rpc('my_push_prefs')
    expect(before.data).toEqual({ boosters: true, market: true, social: true })
    const { data, error } = await client.rpc('set_push_prefs', { p_prefs: { market: false, foo: true, social: 'x' } })
    expect(error).toBeNull()
    expect(data).toEqual({ boosters: true, market: false, social: true })
    expect((await client.rpc('my_push_prefs')).data).toEqual({ boosters: true, market: false, social: true })
  })

  it('touch_active stamps last_active_at', async () => {
    const { userId, client } = await newPlayer()
    expect((await client.rpc('touch_active')).error).toBeNull()
    const { data } = await admin.from('players').select('last_active_at').eq('id', userId).single()
    expect(Math.abs(Date.parse(data!.last_active_at) - Date.now())).toBeLessThan(5000)
  })

  it('touch_active writes at most once per 90 s (several tabs share one write)', async () => {
    const { userId, client } = await newPlayer()
    const minuteAgo = new Date(Date.now() - 60_000).toISOString()
    await admin.from('players').update({ last_active_at: minuteAgo }).eq('id', userId)
    await client.rpc('touch_active')
    let { data } = await admin.from('players').select('last_active_at').eq('id', userId).single()
    expect(Date.parse(data!.last_active_at)).toBe(Date.parse(minuteAgo))
    await admin.from('players').update({ last_active_at: new Date(Date.now() - 120_000).toISOString() }).eq('id', userId)
    await client.rpc('touch_active')
    ;({ data } = await admin.from('players').select('last_active_at').eq('id', userId).single())
    expect(Math.abs(Date.parse(data!.last_active_at) - Date.now())).toBeLessThan(5000)
  })

  it('anon cannot call any of them', async () => {
    const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    expect((await save(anon, endpoint())).error).not.toBeNull()
    expect((await anon.rpc('delete_push_subscription', { p_endpoint: 'x' })).error).not.toBeNull()
    expect((await anon.rpc('my_push_prefs')).error).not.toBeNull()
    expect((await anon.rpc('set_push_prefs', { p_prefs: {} })).error).not.toBeNull()
    expect((await anon.rpc('touch_active')).error).not.toBeNull()
  })
})

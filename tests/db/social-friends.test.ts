import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { admin, giveCards, newPlayer, signedInClient, type TestClient } from './helpers'

type P = { userId: string; client: TestClient }

async function usernameOf(id: string) {
  const { data } = await admin.from('players').select('username').eq('id', id).single()
  return data!.username as string
}

async function player(): Promise<P & { name: string }> {
  const p = await newPlayer()
  return { ...p, name: await usernameOf(p.userId) }
}

async function notes(userId: string) {
  const { data, error } = await admin.from('notifications').select('kind, payload').eq('player_id', userId).order('id')
  if (error) throw error
  return data!
}

async function friends(p: P) {
  const { data, error } = await p.client.rpc('my_friends')
  if (error) throw error
  return data as {
    friends: { id: string; username: string; avatarUrl: string | null; since: string; unread: number }[]
    incoming: { username: string; avatarUrl: string | null; at: string }[]
    outgoing: { username: string; avatarUrl: string | null; at: string }[]
  }
}

async function befriend(a: P & { name: string }, b: P & { name: string }) {
  expect((await a.client.rpc('send_friend_request', { p_username: b.name })).error).toBeNull()
  expect((await b.client.rpc('respond_friend_request', { p_username: a.name, p_accept: true })).error).toBeNull()
}

async function aCard(rarity = 'common', offset = 0) {
  const { data, error } = await admin
    .from('cards')
    .select('id')
    .eq('rarity', rarity)
    .order('id')
    .range(offset, offset)
  if (error) throw error
  return data![0].id as number
}

async function friendshipOf(viewer: P, name: string) {
  const { data, error } = await viewer.client.rpc('public_profile', { p_username: name })
  if (error) throw error
  return data.friendship as string
}

describe('friend requests', () => {
  it('request is pending and visible to both sides only', async () => {
    const a = await player()
    const b = await player()
    const c = await player()
    expect((await a.client.rpc('send_friend_request', { p_username: b.name })).error).toBeNull()
    const fa = await friends(a)
    const fb = await friends(b)
    expect(fa.friends).toEqual([])
    expect(fa.outgoing.map((r) => r.username)).toEqual([b.name])
    expect(fa.incoming).toEqual([])
    expect(fb.incoming.map((r) => r.username)).toEqual([a.name])
    expect(fb.outgoing).toEqual([])
    expect(fb.incoming[0].at).toBeTruthy()
    // RLS: parties see the row, third player sees nothing
    expect((await a.client.from('friendships').select('status')).data).toEqual([{ status: 'pending' }])
    expect((await b.client.from('friendships').select('status')).data).toEqual([{ status: 'pending' }])
    expect((await c.client.from('friendships').select('status')).data).toEqual([])
    const fc = await friends(c)
    expect(fc).toEqual({ friends: [], incoming: [], outgoing: [] })
    // notification
    expect(await notes(b.userId)).toEqual([{ kind: 'friend_request', payload: { from_username: a.name } }])
  })

  it('errors: unknown, self, already requested, already friends; case-insensitive lookup', async () => {
    const a = await player()
    const b = await player()
    const err = async (name: string) => (await a.client.rpc('send_friend_request', { p_username: name })).error?.message
    expect(await err('nobody-here-xyz')).toContain('unknown_player')
    expect(await err(a.name)).toContain('self')
    expect(await err(b.name.toUpperCase())).toBeUndefined()
    expect(await err(b.name)).toContain('already_requested')
    expect((await b.client.rpc('respond_friend_request', { p_username: a.name, p_accept: true })).error).toBeNull()
    expect(await err(b.name)).toContain('already_friends')
    expect((await b.client.rpc('send_friend_request', { p_username: a.name })).error?.message).toContain(
      'already_friends',
    )
  })

  it('refuses non-players', async () => {
    const b = await player()
    const outsider = await signedInClient()
    const { error } = await outsider.client.rpc('send_friend_request', { p_username: b.name })
    expect(error?.message).toContain('not_a_player')
    expect((await outsider.client.rpc('my_friends')).error?.message).toContain('not_a_player')
  })

  it('reverse request auto-accepts and notifies', async () => {
    const a = await player()
    const b = await player()
    await a.client.rpc('send_friend_request', { p_username: b.name })
    expect((await b.client.rpc('send_friend_request', { p_username: a.name })).error).toBeNull()
    const fa = await friends(a)
    expect(fa.friends.map((f) => [f.id, f.username, f.unread])).toEqual([[b.userId, b.name, 0]])
    expect(fa.friends[0].since).toBeTruthy()
    expect(fa.outgoing).toEqual([])
    expect((await friends(b)).friends.map((f) => f.username)).toEqual([a.name])
    expect(await notes(a.userId)).toEqual([{ kind: 'friend_accepted', payload: { username: b.name } }])
  })

  it('parallel reverse requests resolve to one accepted friendship', async () => {
    for (let i = 0; i < 3; i++) {
      const a = await player()
      const b = await player()
      const [ra, rb] = await Promise.all([
        a.client.rpc('send_friend_request', { p_username: b.name }),
        b.client.rpc('send_friend_request', { p_username: a.name }),
      ])
      expect(ra.error).toBeNull()
      expect(rb.error).toBeNull()
      const { data } = await admin.from('friendships').select('status').or(`a.eq.${a.userId},b.eq.${a.userId}`)
      expect(data).toEqual([{ status: 'accepted' }])
    }
  })

  it('only the recipient can accept or decline', async () => {
    const a = await player()
    const b = await player()
    const c = await player()
    await a.client.rpc('send_friend_request', { p_username: b.name })
    expect((await a.client.rpc('respond_friend_request', { p_username: b.name, p_accept: true })).error?.message).toContain(
      'no_request',
    )
    expect((await c.client.rpc('respond_friend_request', { p_username: a.name, p_accept: true })).error?.message).toContain(
      'no_request',
    )
    expect((await b.client.rpc('respond_friend_request', { p_username: a.name, p_accept: true })).error).toBeNull()
    expect(await notes(a.userId)).toEqual([{ kind: 'friend_accepted', payload: { username: b.name } }])
    // accepting again: nothing pending
    expect((await b.client.rpc('respond_friend_request', { p_username: a.name, p_accept: true })).error?.message).toContain(
      'no_request',
    )
  })

  it('decline deletes the request without notifying', async () => {
    const a = await player()
    const b = await player()
    await a.client.rpc('send_friend_request', { p_username: b.name })
    expect((await b.client.rpc('respond_friend_request', { p_username: a.name, p_accept: false })).error).toBeNull()
    expect(await friends(a)).toEqual({ friends: [], incoming: [], outgoing: [] })
    expect(await friends(b)).toEqual({ friends: [], incoming: [], outgoing: [] })
    expect(await notes(a.userId)).toEqual([])
    // can request again after a decline
    expect((await a.client.rpc('send_friend_request', { p_username: b.name })).error).toBeNull()
  })

  it('either side can remove (friends or pending)', async () => {
    const a = await player()
    const b = await player()
    await befriend(a, b)
    expect((await b.client.rpc('remove_friend', { p_username: a.name })).error).toBeNull()
    expect((await friends(a)).friends).toEqual([])
    expect((await friends(b)).friends).toEqual([])
    // cancel an outgoing request
    await a.client.rpc('send_friend_request', { p_username: b.name })
    expect((await a.client.rpc('remove_friend', { p_username: b.name })).error).toBeNull()
    expect((await friends(b)).incoming).toEqual([])
  })
})

describe('direct messages', () => {
  it('only between friends', async () => {
    const a = await player()
    const b = await player()
    const send = () => a.client.rpc('send_dm', { p_username: b.name, p_body: 'hi' })
    expect((await send()).error?.message).toContain('not_friends')
    await a.client.rpc('send_friend_request', { p_username: b.name })
    expect((await send()).error?.message).toContain('not_friends')
    await b.client.rpc('respond_friend_request', { p_username: a.name, p_accept: true })
    const r = await send()
    expect(r.error).toBeNull()
    expect(typeof r.data).toBe('number')
    expect((await a.client.rpc('send_dm', { p_username: 'nobody-here-xyz', p_body: 'x' })).error?.message).toContain(
      'unknown_player',
    )
    // no bell notification for DMs
    expect((await notes(b.userId)).map((n) => n.kind)).toEqual(['friend_request'])
  })

  it('body, tag and card rules', async () => {
    const a = await player()
    const b = await player()
    await befriend(a, b)
    const owned = await aCard('common', 0)
    const notOwned = await aCard('common', 1)
    await giveCards(a.userId, owned, 1)
    await giveCards(a.userId, notOwned, 0)
    const send = async (p_body: string | null, p_card_id?: number, p_tag?: string) =>
      (await a.client.rpc('send_dm', { p_username: b.name, p_body, p_card_id, p_tag })).error?.message
    expect(await send('x'.repeat(300))).toBeUndefined()
    expect(await send('x'.repeat(301))).toContain('invalid_message')
    expect(await send('   ')).toContain('invalid_message')
    expect(await send('')).toContain('invalid_message')
    expect(await send(null)).toContain('invalid_message')
    expect(await send('', owned)).toContain('invalid_message') // card without tag
    expect(await send('hi', undefined, 'looking')).toContain('invalid_message') // tag without card
    expect(await send('hi', owned, 'selling')).toContain('invalid_message')
    expect(await send('hi', 999999999, 'looking')).toContain('invalid_message')
    expect(await send('', notOwned, 'trading')).toContain('no_copy')
    expect(await send('', owned, 'trading')).toBeUndefined()
    expect(await send('  want this  ', notOwned, 'looking')).toBeUndefined()
    const { data } = await admin
      .from('direct_messages')
      .select('body, card_id, tag')
      .eq('from_id', a.userId)
      .order('id')
    expect(data).toEqual([
      { body: 'x'.repeat(300), card_id: null, tag: null },
      { body: '', card_id: owned, tag: 'trading' },
      { body: 'want this', card_id: notOwned, tag: 'looking' },
    ])
  })

  it('6th message within 10 s is rate limited', async () => {
    const a = await player()
    const b = await player()
    await befriend(a, b)
    for (let i = 0; i < 5; i++) {
      expect((await a.client.rpc('send_dm', { p_username: b.name, p_body: `m${i}` })).error).toBeNull()
    }
    expect((await a.client.rpc('send_dm', { p_username: b.name, p_body: 'm5' })).error?.message).toContain('rate_limited')
    // the other side is not affected
    expect((await b.client.rpc('send_dm', { p_username: a.name, p_body: 'ok' })).error).toBeNull()
    // older messages fall out of the window
    await admin
      .from('direct_messages')
      .update({ created_at: new Date(Date.now() - 11_000).toISOString() })
      .eq('from_id', a.userId)
    expect((await a.client.rpc('send_dm', { p_username: b.name, p_body: 'later' })).error).toBeNull()
  })

  it('thread shape, paging, privacy', async () => {
    const a = await player()
    const b = await player()
    const c = await player()
    await befriend(a, b)
    await befriend(a, c)
    const card = await aCard('epic')
    await a.client.rpc('send_dm', { p_username: b.name, p_body: 'one' })
    await b.client.rpc('send_dm', { p_username: a.name, p_body: '<script>x</script>', p_card_id: card, p_tag: 'looking' })
    await a.client.rpc('send_dm', { p_username: b.name, p_body: 'three' })
    await a.client.rpc('send_dm', { p_username: c.name, p_body: 'to c' })

    const { data: t, error } = await a.client.rpc('dm_thread', { p_username: b.name })
    expect(error).toBeNull()
    expect(t.map((m: { body: string }) => m.body)).toEqual(['one', '<script>x</script>', 'three'])
    expect(t[0]).toMatchObject({ fromId: a.userId, mine: true, card: null, tag: null, readAt: null })
    expect(t[1]).toMatchObject({ fromId: b.userId, mine: false, tag: 'looking' })
    expect(t[1].card).toMatchObject({ id: card, rarity: 'epic' })
    expect(Object.keys(t[1]).sort()).toEqual(['body', 'card', 'createdAt', 'fromId', 'id', 'mine', 'missing', 'readAt', 'tag'])
    // same thread from the other side
    const tb = (await b.client.rpc('dm_thread', { p_username: a.name.toUpperCase() })).data
    expect(tb.map((m: { id: number }) => m.id)).toEqual(t.map((m: { id: number }) => m.id))
    expect(tb[0].mine).toBe(false)
    // paging: newest page first, returned oldest→newest
    const page = (await a.client.rpc('dm_thread', { p_username: b.name, p_limit: 2 })).data
    expect(page.map((m: { body: string }) => m.body)).toEqual(['<script>x</script>', 'three'])
    const older = (await a.client.rpc('dm_thread', { p_username: b.name, p_before: page[0].id, p_limit: 2 })).data
    expect(older.map((m: { body: string }) => m.body)).toEqual(['one'])

    // c can't see the a-b thread: RLS and RPC
    const rows = (await c.client.from('direct_messages').select('body')).data!.map((r) => r.body)
    expect(rows).toEqual(['to c'])
    expect((await c.client.rpc('dm_thread', { p_username: b.name })).data).toEqual([])
    expect((await c.client.rpc('dm_thread', { p_username: 'nobody-here-xyz' })).data).toEqual([])
    const outsider = await signedInClient()
    expect((await outsider.client.rpc('dm_thread', { p_username: a.name })).error?.message).toContain('not_a_player')
    expect((await outsider.client.from('direct_messages').select('id')).data).toEqual([])
  })

  it('unread counts and mark read', async () => {
    const a = await player()
    const b = await player()
    const c = await player()
    await befriend(a, b)
    await befriend(a, c)
    await b.client.rpc('send_dm', { p_username: a.name, p_body: 'b1' })
    await b.client.rpc('send_dm', { p_username: a.name, p_body: 'b2' })
    await c.client.rpc('send_dm', { p_username: a.name, p_body: 'c1' })
    await a.client.rpc('send_dm', { p_username: b.name, p_body: 'mine' })
    expect((await a.client.rpc('dm_unread_total')).data).toBe(3)
    expect((await b.client.rpc('dm_unread_total')).data).toBe(1)
    const unread = Object.fromEntries((await friends(a)).friends.map((f) => [f.username, f.unread]))
    expect(unread).toEqual({ [b.name]: 2, [c.name]: 1 })
    expect((await a.client.rpc('mark_dm_read', { p_username: b.name })).error).toBeNull()
    expect((await a.client.rpc('dm_unread_total')).data).toBe(1)
    expect((await b.client.rpc('dm_unread_total')).data).toBe(1) // b's incoming untouched
    const t = (await a.client.rpc('dm_thread', { p_username: b.name })).data
    expect(t.filter((m: { mine: boolean }) => !m.mine).every((m: { readAt: string | null }) => m.readAt)).toBe(true)
    expect(t.find((m: { mine: boolean }) => m.mine).readAt).toBeNull()
  })

  it('after remove: sending fails, thread stays readable to both', async () => {
    const a = await player()
    const b = await player()
    await befriend(a, b)
    await a.client.rpc('send_dm', { p_username: b.name, p_body: 'before' })
    await a.client.rpc('remove_friend', { p_username: b.name })
    expect((await a.client.rpc('send_dm', { p_username: b.name, p_body: 'after' })).error?.message).toContain(
      'not_friends',
    )
    expect((await b.client.rpc('send_dm', { p_username: a.name, p_body: 'after' })).error?.message).toContain(
      'not_friends',
    )
    for (const [p, other] of [
      [a, b],
      [b, a],
    ] as const) {
      const t = (await p.client.rpc('dm_thread', { p_username: other.name })).data
      expect(t.map((m: { body: string }) => m.body)).toEqual(['before'])
    }
  })
})

describe('public_profile friendship', () => {
  it('none, pending_out, pending_in, friends', async () => {
    const a = await player()
    const b = await player()
    expect(await friendshipOf(a, b.name)).toBe('none')
    await a.client.rpc('send_friend_request', { p_username: b.name })
    expect(await friendshipOf(a, b.name)).toBe('pending_out')
    expect(await friendshipOf(b, a.name)).toBe('pending_in')
    await b.client.rpc('respond_friend_request', { p_username: a.name, p_accept: true })
    expect(await friendshipOf(a, b.name)).toBe('friends')
    expect(await friendshipOf(b, a.name)).toBe('friends')
    expect(await friendshipOf(a, a.name)).toBe('none')
  })

  it('chosen showcase only shows cards still owned (no fallback)', async () => {
    const a = await player()
    const viewer = await player()
    const c1 = await aCard('common', 0)
    const c2 = await aCard('common', 1)
    const r = await aCard('rare', 0)
    for (const id of [c1, c2, r]) await giveCards(a.userId, id, 1)
    expect((await a.client.rpc('set_showcase', { p_card_ids: [c1, c2] })).error).toBeNull()
    await giveCards(a.userId, c1, 0)
    const show = async () =>
      ((await viewer.client.rpc('public_profile', { p_username: a.name })).data.showcase as { id: number }[]).map(
        (c) => c.id,
      )
    expect(await show()).toEqual([c2])
    await giveCards(a.userId, c2, 0)
    expect(await show()).toEqual([])
  })
})

describe('final review fixes', () => {
  it('friendships is not published over Realtime', () => {
    const sql = "select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'"
    const out = execFileSync('docker', ['exec', 'supabase_db_kizuna', 'psql', '-U', 'postgres', '-At', '-c', sql]).toString()
    const tables = out.split(/\r?\n/).filter(Boolean)
    expect(tables).not.toContain('friendships')
    expect(tables).toEqual(expect.arrayContaining(['chat_messages', 'direct_messages']))
  })

  it('dm_thread flags an attached card the viewer does not own', async () => {
    const a = await player()
    const b = await player()
    await befriend(a, b)
    const card = await aCard('common', 2)
    await giveCards(a.userId, card, 1)
    expect((await a.client.rpc('send_dm', { p_username: b.name, p_body: 'x', p_card_id: card, p_tag: 'trading' })).error).toBeNull()
    expect((await a.client.rpc('send_dm', { p_username: b.name, p_body: 'plain' })).error).toBeNull()
    const sender = (await a.client.rpc('dm_thread', { p_username: b.name })).data
    const recipient = (await b.client.rpc('dm_thread', { p_username: a.name })).data
    expect(sender.map((m: { missing: boolean }) => m.missing)).toEqual([false, false])
    expect(recipient.map((m: { missing: boolean }) => m.missing)).toEqual([true, false])
    await giveCards(b.userId, card, 1)
    expect((await b.client.rpc('dm_thread', { p_username: a.name })).data[0].missing).toBe(false)
  })

  it('send_friend_request allows 20 new requests per rolling hour, the 21st is rate limited', async () => {
    const a = await player()
    const others = await Promise.all(Array.from({ length: 21 }, () => player()))
    for (const o of others.slice(0, 20)) {
      expect((await a.client.rpc('send_friend_request', { p_username: o.name })).error).toBeNull()
    }
    expect((await a.client.rpc('send_friend_request', { p_username: others[20].name })).error?.message).toContain('rate_limited')
    // cancelling doesn't reset it
    await a.client.rpc('remove_friend', { p_username: others[0].name })
    expect((await a.client.rpc('send_friend_request', { p_username: others[20].name })).error?.message).toContain('rate_limited')
    // accepting someone's request is not a new request
    const z = await player()
    expect((await z.client.rpc('send_friend_request', { p_username: a.name })).error).toBeNull()
    expect((await a.client.rpc('send_friend_request', { p_username: z.name })).data).toBe('accepted')
    // an older request no longer counts
    await admin
      .from('notifications')
      .update({ created_at: new Date(Date.now() - 3_700_000).toISOString() })
      .eq('kind', 'friend_request')
      .eq('payload->>from_username', a.name)
    expect((await a.client.rpc('send_friend_request', { p_username: others[20].name })).error).toBeNull()
  })
})

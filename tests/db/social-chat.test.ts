import { describe, it, expect } from 'vitest'
import { admin, giveCards, newPlayer, signedInClient, type TestClient } from './helpers'

type P = { userId: string; client: TestClient }

async function usernameOf(id: string) {
  const { data } = await admin.from('players').select('username').eq('id', id).single()
  return data!.username as string
}

async function aCard(offset = 0) {
  const { data, error } = await admin.from('cards').select('id').eq('rarity', 'common').order('id').range(offset, offset)
  if (error) throw error
  return data![0].id as number
}

const send = async (p: P, body: string | null, card?: number, tag?: string, room = 'en') =>
  p.client.rpc('send_chat_message', { p_room: room, p_body: body, p_card_id: card, p_tag: tag })

async function befriend(a: P, b: P) {
  const bn = await usernameOf(b.userId)
  const an = await usernameOf(a.userId)
  expect((await a.client.rpc('send_friend_request', { p_username: bn })).error).toBeNull()
  expect((await b.client.rpc('respond_friend_request', { p_username: an, p_accept: true })).error).toBeNull()
}

type ChatMsg = { id: number; author: { id: string; username: string }; card: { id: number; rarity: string } | null; tag: string | null; missing: boolean; mine: boolean; room: string; body: string }

const daysAgo = (d: number) => new Date(Date.now() - d * 86400_000).toISOString()

describe('chat rooms and sending', () => {
  it('seeds rooms, readable by players', async () => {
    const a = await newPlayer()
    const { data } = await a.client.from('chat_rooms').select('id, sort').order('sort')
    expect(data).toEqual([
      { id: 'en', sort: 1 },
      { id: 'intl', sort: 2 },
    ])
  })

  it('unknown room and non-players are refused', async () => {
    const a = await newPlayer()
    expect((await send(a, 'hi', undefined, undefined, 'nope')).error?.message).toContain('unknown_room')
    const outsider = await signedInClient()
    expect((await send(outsider, 'hi')).error?.message).toContain('not_a_player')
    expect((await outsider.client.rpc('chat_history', { p_room: 'en' })).error?.message).toContain('not_a_player')
    expect((await outsider.client.from('chat_messages').select('id')).data ?? []).toEqual([])
  })

  it('300 characters ok, 301 refused; counts characters not bytes', async () => {
    const a = await newPlayer()
    expect((await send(a, 'x'.repeat(300))).error).toBeNull()
    expect((await send(a, 'x'.repeat(301))).error?.message).toContain('invalid_message')
    const b = await newPlayer()
    expect((await send(b, '😀'.repeat(300))).error).toBeNull()
    expect((await send(b, '😀'.repeat(301))).error?.message).toContain('invalid_message')
  })

  it('body, tag and card rules', async () => {
    const a = await newPlayer()
    const owned = await aCard(0)
    const notOwned = await aCard(1)
    await giveCards(a.userId, owned, 1)
    const err = async (body: string | null, card?: number, tag?: string) =>
      (await send(a, body, card, tag)).error?.message
    expect(await err('')).toContain('invalid_message')
    expect(await err('   ')).toContain('invalid_message')
    expect(await err(null)).toContain('invalid_message')
    expect(await err('', owned)).toContain('invalid_message')
    expect(await err('hi', undefined, 'looking')).toContain('invalid_message')
    expect(await err('hi', owned, 'selling')).toContain('invalid_message')
    expect(await err('', notOwned, 'trading')).toContain('no_copy')
    expect(await err('', owned, 'trading')).toBeUndefined()
    expect(await err('  want this  ', notOwned, 'looking')).toBeUndefined()
    const { data } = await admin.from('chat_messages').select('body, card_id, tag').eq('author_id', a.userId).order('id')
    expect(data).toEqual([
      { body: '', card_id: owned, tag: 'trading' },
      { body: 'want this', card_id: notOwned, tag: 'looking' },
    ])
  })
})

describe('chat rate limit', () => {
  it('6th message in 10 s refused; window slides', async () => {
    const a = await newPlayer()
    for (let i = 0; i < 5; i++) expect((await send(a, `m${i}`)).error).toBeNull()
    expect((await send(a, 'm5')).error?.message).toContain('rate_limited')
    await admin.from('chat_messages').update({ created_at: new Date(Date.now() - 11_000).toISOString() }).eq('author_id', a.userId)
    expect((await send(a, 'later')).error).toBeNull()
  })

  it('shared with DMs', async () => {
    const a = await newPlayer()
    const b = await newPlayer()
    await befriend(a, b)
    const bn = await usernameOf(b.userId)
    for (let i = 0; i < 3; i++) expect((await a.client.rpc('send_dm', { p_username: bn, p_body: `d${i}` })).error).toBeNull()
    for (let i = 0; i < 2; i++) expect((await send(a, `c${i}`)).error).toBeNull()
    expect((await send(a, 'over')).error?.message).toContain('rate_limited')
    expect((await a.client.rpc('send_dm', { p_username: bn, p_body: 'over' })).error?.message).toContain('rate_limited')
  })

  it('parallel sends cannot exceed 5 per 10 s', async () => {
    const a = await newPlayer()
    const b = await newPlayer()
    await befriend(a, b)
    const bn = await usernameOf(b.userId)
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        i % 2 ? send(a, `p${i}`) : a.client.rpc('send_dm', { p_username: bn, p_body: `p${i}` }),
      ),
    )
    expect(results.filter((r) => !r.error)).toHaveLength(5)
    expect(results.filter((r) => r.error && !r.error.message.includes('rate_limited'))).toEqual([])
    const [dm, ch] = await Promise.all([
      admin.from('direct_messages').select('*', { count: 'exact', head: true }).eq('from_id', a.userId),
      admin.from('chat_messages').select('*', { count: 'exact', head: true }).eq('author_id', a.userId),
    ])
    expect((dm.count ?? 0) + (ch.count ?? 0)).toBe(5)
  })
})

describe('chat history', () => {
  it('shape: author, card, missing per viewer, paging oldest to newest', async () => {
    const a = await newPlayer()
    const b = await newPlayer()
    const card = await aCard(2)
    await giveCards(a.userId, card, 1)
    const id1 = (await send(a, 'first')).data as number
    const id2 = (await send(a, '', card, 'trading')).data as number
    const id3 = (await send(a, 'third')).data as number
    const an = await usernameOf(a.userId)

    const asB = (await b.client.rpc('chat_history', { p_room: 'en', p_limit: 100 })).data as ChatMsg[]
    const mine = asB.filter((m) => m.author.id === a.userId)
    expect(mine.map((m) => m.id)).toEqual([id1, id2, id3])
    expect(mine[0]).toMatchObject({ body: 'first', card: null, tag: null, missing: false, mine: false, room: 'en' })
    expect(mine[0].author).toMatchObject({ id: a.userId, username: an })
    expect(mine[1].card).toMatchObject({ id: card, rarity: 'common' })
    expect(mine[1]).toMatchObject({ tag: 'trading', missing: true })

    const asA = (await a.client.rpc('chat_history', { p_room: 'en', p_limit: 100 })).data as ChatMsg[]
    expect(asA.find((m) => m.id === id2)).toMatchObject({ missing: false, mine: true })

    const page = (await b.client.rpc('chat_history', { p_room: 'en', p_before: id3, p_limit: 2 })).data as ChatMsg[]
    expect(page.map((m) => m.id)).toEqual([id1, id2])
    const intl = (await b.client.rpc('chat_history', { p_room: 'intl', p_limit: 100 })).data as ChatMsg[]
    expect(intl.find((m) => m.id === id1)).toBeUndefined()
  })

  it('chat_message returns one message; unknown id is null', async () => {
    const a = await newPlayer()
    const b = await newPlayer()
    const card = await aCard(3)
    const id = (await send(a, 'solo', card, 'looking')).data as number
    const one = (await b.client.rpc('chat_message', { p_id: id })).data
    expect(one).toMatchObject({ id, body: 'solo', tag: 'looking', missing: true, author: { id: a.userId } })
    expect((await b.client.rpc('chat_message', { p_id: 999999999 })).data).toBeNull()
  })

  it('7-day window: old rows hidden from RLS, history and chat_message', async () => {
    const a = await newPlayer()
    const ins = (days: number, body: string) =>
      admin.from('chat_messages').insert({ room: 'en', author_id: a.userId, body, created_at: daysAgo(days) }).select('id').single()
    const oldId = (await ins(8, 'old')).data!.id as number
    const freshId = (await ins(6, 'fresh')).data!.id as number
    expect((await a.client.from('chat_messages').select('id').in('id', [oldId, freshId])).data).toEqual([{ id: freshId }])
    const hist = (await a.client.rpc('chat_history', { p_room: 'en', p_limit: 100 })).data as ChatMsg[]
    expect(hist.some((m) => m.id === oldId)).toBe(false)
    expect(hist.some((m) => m.id === freshId)).toBe(true)
    expect((await a.client.rpc('chat_message', { p_id: oldId })).data).toBeNull()
  })

  it('deleted rows are hidden', async () => {
    const a = await newPlayer()
    const id = (await send(a, 'oops')).data as number
    await admin.from('chat_messages').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    expect((await a.client.from('chat_messages').select('id').eq('id', id)).data).toEqual([])
    const hist = (await a.client.rpc('chat_history', { p_room: 'en', p_limit: 100 })).data as ChatMsg[]
    expect(hist.some((m) => m.id === id)).toBe(false)
    expect((await a.client.rpc('chat_message', { p_id: id })).data).toBeNull()
  })

  it('retention deletes rows older than 7 days only; players cannot call it', async () => {
    const a = await newPlayer()
    const ins = (days: number, body: string) =>
      admin.from('chat_messages').insert({ room: 'en', author_id: a.userId, body, created_at: daysAgo(days) }).select('id').single()
    const oldId = (await ins(8, 'old')).data!.id as number
    const freshId = (await ins(6, 'fresh')).data!.id as number
    expect((await a.client.rpc('_chat_retention')).error).not.toBeNull()
    expect((await admin.rpc('_chat_retention')).error).toBeNull()
    expect((await admin.from('chat_messages').select('id').in('id', [oldId, freshId])).data).toEqual([{ id: freshId }])
  })
})

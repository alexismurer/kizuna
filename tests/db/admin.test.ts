import { describe, expect, it } from 'vitest'
import { admin, newPlayer, signedInClient } from './helpers'

type P = Awaited<ReturnType<typeof newPlayer>>

async function newAdmin(): Promise<P> {
  const p = await newPlayer()
  const { error } = await admin.from('admins').insert({ player_id: p.userId })
  if (error) throw error
  return p
}

async function usernameOf(id: string): Promise<string> {
  const { data } = await admin.from('players').select('username').eq('id', id).single()
  return data!.username as string
}

function uname() {
  return `u${Math.random().toString(36).slice(2, 12)}`
}

type InviteRow = { code: string; createdAt: string; usedBy: string | null; usedAt: string | null }

describe('admin gate', () => {
  it('non-admin gets not_admin from every RPC and is_admin() is false', async () => {
    const { client } = await newPlayer()
    expect((await client.rpc('is_admin')).data).toBe(false)
    const calls: [string, Record<string, unknown>][] = [
      ['admin_create_invites', { p_count: 1 }],
      ['admin_invites', {}],
      ['admin_revoke_invite', { p_code: 'AAAAAAAA' }],
      ['admin_grant_currency', { p_username: 'x', p_amount: 5 }],
      ['admin_pools', {}],
      ['admin_save_pool', { p_id: null, p_name: 'x', p_series_ids: [1] }],
      ['admin_delete_pool', { p_id: 1 }],
      ['admin_series_search', { p_query: 'a' }],
      ['admin_chat_recent', {}],
      ['admin_delete_chat', { p_id: 1 }],
      ['admin_players', {}],
    ]
    for (const [fn, args] of calls) {
      const { error } = await client.rpc(fn, args)
      expect(error?.message, fn).toContain('not_admin')
    }
  })

  it('is_admin() is true once in admins; the table is invisible to clients', async () => {
    const a = await newAdmin()
    expect((await a.client.rpc('is_admin')).data).toBe(true)
    const { data } = await a.client.from('admins').select('*')
    expect(data ?? []).toEqual([])
  })
})

describe('admin invites', () => {
  it('creates distinct 8-char codes that redeem_invite accepts; lists them with usage', async () => {
    const a = await newAdmin()
    const { data, error } = await a.client.rpc('admin_create_invites', { p_count: 3 })
    expect(error).toBeNull()
    const codes = data as string[]
    expect(new Set(codes).size).toBe(3)
    for (const c of codes) expect(c).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/)
    const list = (await a.client.rpc('admin_invites')).data as InviteRow[]
    expect(list.length).toBeLessThanOrEqual(100)
    expect(list.map((r) => r.code)).toEqual(expect.arrayContaining(codes))
    const { client } = await signedInClient()
    const name = uname()
    expect((await client.rpc('redeem_invite', { p_code: codes[0], p_username: name })).error).toBeNull()
    const after = (await a.client.rpc('admin_invites')).data as InviteRow[]
    expect(after.find((r) => r.code === codes[0])!.usedBy).toBe(name)
  })

  it('rejects counts outside 1-20', async () => {
    const a = await newAdmin()
    expect((await a.client.rpc('admin_create_invites', { p_count: 0 })).error).not.toBeNull()
    expect((await a.client.rpc('admin_create_invites', { p_count: 21 })).error).not.toBeNull()
  })

  it('revoke deletes unused, rejects used and missing', async () => {
    const a = await newAdmin()
    const [fresh, used] = (await a.client.rpc('admin_create_invites', { p_count: 2 })).data as string[]
    expect((await a.client.rpc('admin_revoke_invite', { p_code: fresh })).error).toBeNull()
    expect((await a.client.rpc('admin_revoke_invite', { p_code: fresh })).error?.message).toContain('invite_not_found')
    const { client } = await signedInClient()
    await client.rpc('redeem_invite', { p_code: used, p_username: uname() })
    expect((await a.client.rpc('admin_revoke_invite', { p_code: used })).error?.message).toContain('invite_used')
  })
})

describe('admin grant currency', () => {
  it('adds currency, writes ledger and notification', async () => {
    const a = await newAdmin()
    const target = await newPlayer()
    await admin.from('players').update({ currency: 100 }).eq('id', target.userId)
    const name = await usernameOf(target.userId)
    const { data, error } = await a.client.rpc('admin_grant_currency', { p_username: name, p_amount: 250, p_note: 'thanks' })
    expect(error).toBeNull()
    expect(data).toBe(350)
    const { data: led } = await admin.from('ledger').select('currency_delta, ref').eq('player_id', target.userId).eq('kind', 'admin_grant')
    expect(led).toHaveLength(1)
    expect(led![0].currency_delta).toBe(250)
    expect(JSON.stringify(led![0].ref)).toContain('thanks')
    const { data: n } = await admin.from('notifications').select('payload').eq('player_id', target.userId).eq('kind', 'admin_grant')
    expect(n).toHaveLength(1)
    expect(n![0].payload).toMatchObject({ amount: 250 })
  })

  it('credits exactly the matching player when usernames differ only by case', async () => {
    const a = await newAdmin()
    const t1 = await newPlayer()
    const t2 = await newPlayer()
    const base = `cb${Math.random().toString(36).slice(2, 8)}`
    await admin.from('players').update({ username: `${base}Bob`, currency: 100 }).eq('id', t1.userId)
    await admin.from('players').update({ username: `${base}bob`, currency: 100 }).eq('id', t2.userId)
    expect((await a.client.rpc('admin_grant_currency', { p_username: `${base}bob`, p_amount: 50 })).data).toBe(150)
    const bal = async (id: string) => (await admin.from('players').select('currency').eq('id', id).single()).data!.currency
    expect(await bal(t2.userId)).toBe(150)
    expect(await bal(t1.userId)).toBe(100)
    // ambiguous case-insensitive match is refused
    expect((await a.client.rpc('admin_grant_currency', { p_username: `${base}BOB`, p_amount: 50 })).error?.message).toContain('player_not_found')
  })

  it('validates player and amount', async () => {
    const a = await newAdmin()
    expect((await a.client.rpc('admin_grant_currency', { p_username: 'nobody_here', p_amount: 5 })).error?.message).toContain('player_not_found')
    const name = await usernameOf(a.userId)
    for (const amt of [0, 1000001]) {
      expect((await a.client.rpc('admin_grant_currency', { p_username: name, p_amount: amt })).error?.message).toContain('invalid_amount')
    }
  })
})

describe('admin pools', () => {
  it('rejects empty or unknown series', async () => {
    const a = await newAdmin()
    expect((await a.client.rpc('admin_save_pool', { p_id: null, p_name: 'p', p_series_ids: [] })).error?.message).toContain('invalid_pool')
    expect((await a.client.rpc('admin_save_pool', { p_id: null, p_name: 'p', p_series_ids: [999999999] })).error?.message).toContain('invalid_pool')
  })

  it('create / rename / list / delete round-trip', async () => {
    const a = await newAdmin()
    const id = (await a.client.rpc('admin_save_pool', { p_id: null, p_name: 'Test pool', p_series_ids: [1] })).data as number
    expect(id).toBeGreaterThan(0)
    const find = async () =>
      ((await a.client.rpc('admin_pools')).data as { id: number; name: string; seriesIds: number[]; series: { id: number; title: string }[] }[]).find((p) => p.id === id)
    expect(await find()).toMatchObject({ name: 'Test pool', seriesIds: [1] })
    expect((await find())!.series[0].id).toBe(1)
    expect((await a.client.rpc('admin_save_pool', { p_id: id, p_name: 'Renamed', p_series_ids: [1] })).data).toBe(id)
    expect((await find())!.name).toBe('Renamed')
    expect((await a.client.rpc('admin_delete_pool', { p_id: id })).error).toBeNull()
    expect(await find()).toBeUndefined()
  })

  it('series search returns id/title/cards', async () => {
    const a = await newAdmin()
    const { data: s } = await admin.from('series').select('title').eq('id', 1).single()
    const res = (await a.client.rpc('admin_series_search', { p_query: (s!.title as string).slice(0, 4) })).data as { id: number; title: string; cards: number }[]
    expect(res.length).toBeLessThanOrEqual(20)
    expect(res.some((r) => r.id === 1)).toBe(true)
    expect(typeof res[0].cards).toBe('number')
  })
})

describe('admin chat moderation', () => {
  it('lists recent and delete hides from normal reads', async () => {
    const a = await newAdmin()
    const author = await newPlayer()
    const { data: row } = await admin.from('chat_messages').insert({ room: 'en', author_id: author.userId, body: 'spam here' }).select('id').single()
    const id = row!.id as number
    const recent = (await a.client.rpc('admin_chat_recent')).data as { id: number; author: string; body: string }[]
    expect(recent.length).toBeLessThanOrEqual(50)
    expect(recent.find((m) => m.id === id)).toMatchObject({ body: 'spam here', author: await usernameOf(author.userId) })
    expect((await a.client.rpc('admin_delete_chat', { p_id: id })).error).toBeNull()
    expect((await author.client.from('chat_messages').select('id').eq('id', id)).data).toEqual([])
    const after = (await a.client.rpc('admin_chat_recent')).data as { id: number }[]
    expect(after.some((m) => m.id === id)).toBe(false)
  })
})

describe('admin lookups and card grant', () => {
  it('player search returns prefix matches first with an avatar field', async () => {
    const a = await newAdmin()
    const t1 = await newPlayer()
    const t2 = await newPlayer()
    const base = `ps${Math.random().toString(36).slice(2, 8)}`
    await admin.from('players').update({ username: `x${base}` }).eq('id', t1.userId)
    await admin.from('players').update({ username: `${base}z` }).eq('id', t2.userId)
    const { data, error } = await a.client.rpc('admin_player_search', { p_query: base.toUpperCase() })
    expect(error).toBeNull()
    const rows = data as { username: string; avatarUrl: string | null }[]
    expect(rows.map((r) => r.username)).toEqual([`${base}z`, `x${base}`])
    expect(rows[0]).toHaveProperty('avatarUrl')
    expect((await a.client.rpc('admin_player_search', { p_query: '  ' })).data).toEqual([])
  })

  it('card search finds by number and by name', async () => {
    const a = await newAdmin()
    const { data: card } = await admin.from('cards').select('id, number, name').order('id').limit(1).single()
    const byNum = (await a.client.rpc('admin_card_search', { p_query: String(card!.number) })).data as { id: number }[]
    expect(byNum[0].id).toBe(card!.id)
    const byName = (await a.client.rpc('admin_card_search', { p_query: card!.name })).data as { id: number; imageUrl: string }[]
    expect(byName.some((c) => c.id === card!.id)).toBe(true)
  })

  it('grants copies of a card with ledger and notification', async () => {
    const a = await newAdmin()
    const target = await newPlayer()
    const name = await usernameOf(target.userId)
    const { data: card } = await admin.from('cards').select('id').order('id').limit(1).single()
    expect((await a.client.rpc('admin_grant_card', { p_username: name, p_card_id: card!.id, p_count: 2 })).data).toBe(2)
    expect((await a.client.rpc('admin_grant_card', { p_username: name, p_card_id: card!.id, p_count: 1, p_note: 'gift' })).data).toBe(3)
    const { data: led } = await admin.from('ledger').select('card_id, card_delta').eq('player_id', target.userId).eq('kind', 'admin_grant')
    expect(led).toHaveLength(2)
    const { data: n } = await admin.from('notifications').select('payload').eq('player_id', target.userId).eq('kind', 'admin_card')
    expect(n![0].payload).toMatchObject({ card_id: card!.id })
    expect((await a.client.rpc('admin_grant_card', { p_username: name, p_card_id: card!.id, p_count: 0 })).error?.message).toContain('invalid_copies')
    expect((await a.client.rpc('admin_grant_card', { p_username: name, p_card_id: -1, p_count: 1 })).error?.message).toContain('card_not_found')
    expect((await a.client.rpc('admin_grant_card', { p_username: 'nobody_here', p_card_id: card!.id, p_count: 1 })).error?.message).toContain('player_not_found')
  })

  it('new RPCs are admin-only', async () => {
    const { client } = await newPlayer()
    for (const [fn, args] of [
      ['admin_player_search', { p_query: 'a' }],
      ['admin_card_search', { p_query: 'a' }],
      ['admin_grant_card', { p_username: 'x', p_card_id: 1, p_count: 1 }],
    ] as const) {
      expect((await client.rpc(fn, args)).error?.message, fn).toContain('not_admin')
    }
  })
})

describe('admin players', () => {
  it('lists every player with progress and referral counts', async () => {
    const a = await newAdmin()
    const inviter = await newPlayer()
    const invitee = await newPlayer()
    await admin.from('players').update({ currency: 1234, referred_by: inviter.userId }).eq('id', invitee.userId)
    const { data, error } = await a.client.rpc('admin_players')
    expect(error).toBeNull()
    expect(data.catalogSize).toBeGreaterThanOrEqual(0)
    expect(data.totals.players).toBe(data.players.length)
    const inviterName = await usernameOf(inviter.userId)
    const inviteeName = await usernameOf(invitee.userId)
    const row = data.players.find((p: { username: string }) => p.username === inviteeName)
    expect(row).toMatchObject({ currency: 1234, referredBy: inviterName, invited: 0, boostersOpened: 0 })
    expect(Object.keys(row).sort()).toEqual(
      ['avatarUrl', 'bannedAt', 'boostersOpened', 'currency', 'id', 'invited', 'invitedRewarded', 'joinedAt', 'lastSeenAt', 'logins', 'referredBy', 'role',
        'streak', 'totalCards', 'uniqueCards', 'username'].sort(),
    )
    const inv = data.players.find((p: { username: string }) => p.username === inviterName)
    expect(inv).toMatchObject({ invited: 1, invitedRewarded: 0, referredBy: null })
  })
})

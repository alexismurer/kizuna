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

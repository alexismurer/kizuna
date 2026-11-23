import { describe, expect, it } from 'vitest'
import { admin, newPlayer } from './helpers'

type P = Awaited<ReturnType<typeof newPlayer>>

async function withRole(role: 'admin' | 'moderator'): Promise<P> {
  const p = await newPlayer()
  const { error } = await admin.from('admins').insert({ player_id: p.userId, role })
  if (error) throw error
  return p
}

type Row = { id: string; username: string; role: string; bannedAt: string | null; avatarUrl: string | null; currency: number; streak: number }
const rowOf = async (p: P, id: string) =>
  ((await p.client.rpc('admin_players')).data as { players: Row[] }).players.find((r) => r.id === id)!

describe('staff roles', () => {
  it('my_role / is_staff / is_admin per role', async () => {
    const [a, m, p] = await Promise.all([withRole('admin'), withRole('moderator'), newPlayer()])
    expect((await a.client.rpc('my_role')).data).toBe('admin')
    expect((await m.client.rpc('my_role')).data).toBe('moderator')
    expect((await p.client.rpc('my_role')).data).toBeNull()
    expect((await m.client.rpc('is_staff')).data).toBe(true)
    expect((await m.client.rpc('is_admin')).data).toBe(false)
    expect((await p.client.rpc('is_staff')).data).toBe(false)
  })

  it('moderators read players, pools, seasonals and chat, and delete chat; nothing else', async () => {
    const m = await withRole('moderator')
    for (const fn of ['admin_players', 'admin_pools', 'admin_seasonals', 'admin_chat_recent']) {
      expect((await m.client.rpc(fn)).error, fn).toBeNull()
    }
    expect((await m.client.rpc('admin_delete_chat', { p_id: -1 })).error).toBeNull()
    const denied: [string, Record<string, unknown>][] = [
      ['admin_invites', {}],
      ['admin_create_invites', { p_count: 1 }],
      ['admin_grant_currency', { p_username: 'x', p_amount: 5 }],
      ['admin_grant_card', { p_username: 'x', p_card_id: 1, p_count: 1 }],
      ['admin_save_pool', { p_id: null, p_name: 'x', p_series_ids: [1] }],
      ['admin_delete_pool', { p_id: 1 }],
      ['admin_end_seasonal', { p_id: 'x' }],
      ['admin_update_player', { p_id: m.userId, p_username: 'abc', p_currency: 1, p_streak: 0 }],
      ['admin_set_role', { p_id: m.userId, p_role: 'admin' }],
      ['admin_set_ban', { p_id: m.userId, p_banned: true }],
    ]
    for (const [fn, args] of denied) {
      expect((await m.client.rpc(fn, args)).error?.message, fn).toContain('not_admin')
    }
  })

  it('players list carries id, role and ban state', async () => {
    const [a, m] = await Promise.all([withRole('admin'), withRole('moderator')])
    const row = await rowOf(a, m.userId)
    expect(row.role).toBe('moderator')
    expect(row.bannedAt).toBeNull()
    expect('avatarUrl' in row).toBe(true)
  })
})

describe('admin player management', () => {
  it('edits username, currency (with a ledger line) and streak', async () => {
    const [a, p] = await Promise.all([withRole('admin'), newPlayer()])
    await admin.from('players').update({ currency: 100 }).eq('id', p.userId)
    const name = `e${Math.random().toString(36).slice(2, 10)}`
    const { error } = await a.client.rpc('admin_update_player', { p_id: p.userId, p_username: name, p_currency: 250, p_streak: 7 })
    expect(error).toBeNull()
    const { data } = await admin.from('players').select('username, currency, streak_day').eq('id', p.userId).single()
    expect(data).toEqual({ username: name, currency: 250, streak_day: 7 })
    const { data: led } = await admin.from('ledger').select('currency_delta').eq('player_id', p.userId).eq('kind', 'admin_set')
    expect(led).toEqual([{ currency_delta: 150 }])
  })

  it('rejects a taken or invalid username and negative currency', async () => {
    const [a, p, q] = await Promise.all([withRole('admin'), newPlayer(), newPlayer()])
    const { data: other } = await admin.from('players').select('username').eq('id', q.userId).single()
    const call = (args: Record<string, unknown>) =>
      a.client.rpc('admin_update_player', { p_id: p.userId, p_username: 'okname', p_currency: 0, p_streak: 0, ...args })
    expect((await call({ p_username: other!.username })).error?.message).toContain('username_taken')
    expect((await call({ p_username: 'ab' })).error?.message).toContain('invalid_username')
    expect((await call({ p_currency: -1 })).error?.message).toContain('invalid_amount')
  })

  it('sets roles but never your own', async () => {
    const [a, p] = await Promise.all([withRole('admin'), newPlayer()])
    expect((await a.client.rpc('admin_set_role', { p_id: p.userId, p_role: 'moderator' })).error).toBeNull()
    expect((await p.client.rpc('my_role')).data).toBe('moderator')
    expect((await a.client.rpc('admin_set_role', { p_id: p.userId, p_role: 'player' })).error).toBeNull()
    expect((await p.client.rpc('my_role')).data).toBeNull()
    expect((await a.client.rpc('admin_set_role', { p_id: a.userId, p_role: 'player' })).error?.message).toContain('cannot_edit_self')
  })

  it('bans and unbans a player (auth ban too), but not staff or yourself', async () => {
    const [a, m, p] = await Promise.all([withRole('admin'), withRole('moderator'), newPlayer()])
    expect((await a.client.rpc('admin_set_ban', { p_id: p.userId, p_banned: true })).error).toBeNull()
    expect((await rowOf(a, p.userId)).bannedAt).not.toBeNull()
    const { data: user } = await admin.auth.admin.getUserById(p.userId)
    expect(user.user?.banned_until).toBeTruthy()
    expect((await a.client.rpc('admin_set_ban', { p_id: p.userId, p_banned: false })).error).toBeNull()
    expect((await rowOf(a, p.userId)).bannedAt).toBeNull()
    expect((await a.client.rpc('admin_set_ban', { p_id: m.userId, p_banned: true })).error?.message).toContain('ban_staff')
    expect((await a.client.rpc('admin_set_ban', { p_id: a.userId, p_banned: true })).error?.message).toContain('cannot_edit_self')
  })
})

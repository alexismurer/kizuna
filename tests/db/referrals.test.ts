import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { admin, anonKey, giveCards, newInvite, newPlayer, signedInClient, url } from './helpers'

function anon() {
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

const ALPHABET = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/

async function codeOf(id: string): Promise<string> {
  const { data, error } = await admin.from('players').select('referral_code').eq('id', id).single()
  if (error) throw error
  return data!.referral_code as string
}

function uname() {
  return `u${Math.random().toString(36).slice(2, 12)}`
}

async function referredBy(id: string) {
  const { data, error } = await admin.from('players').select('referred_by').eq('id', id).single()
  if (error) throw error
  return data!.referred_by as string | null
}

async function mixPacks(id: string): Promise<number> {
  const { data } = await admin.from('granted_packs').select('count').eq('player_id', id).eq('pack_type_id', 'mix')
  return (data ?? []).reduce((s, r) => s + (r.count as number), 0)
}

async function friendshipsOf(id: string) {
  const { data } = await admin.from('friendships').select('*').or(`a.eq.${id},b.eq.${id}`)
  return data ?? []
}

describe('referral sign-up', () => {
  it('every player has an 8-char code from the alphabet', async () => {
    const p1 = await newPlayer()
    const p2 = await newPlayer()
    const c1 = await codeOf(p1.userId)
    const c2 = await codeOf(p2.userId)
    expect(c1).toMatch(ALPHABET)
    expect(c2).toMatch(ALPHABET)
    expect(c1).not.toBe(c2)
  })

  it('owner code still works and sets no referrer', async () => {
    const { userId, client } = await signedInClient()
    const { error } = await client.rpc('redeem_invite', { p_code: await newInvite(), p_username: uname() })
    expect(error).toBeNull()
    expect(await referredBy(userId)).toBeNull()
    expect(await mixPacks(userId)).toBe(0)
    expect(await friendshipsOf(userId)).toHaveLength(0)
    const { data: gift } = await admin.from('notifications').select('id').eq('player_id', userId).eq('kind', 'referral_gift')
    expect(gift).toHaveLength(0)
  })

  it("a player's code signs up a referral", async () => {
    const inviter = await newPlayer()
    const code = await codeOf(inviter.userId)
    const { userId, client } = await signedInClient()
    const name = uname()
    const { error } = await client.rpc('redeem_invite', { p_code: code, p_username: name })
    expect(error).toBeNull()
    expect(await referredBy(userId)).toBe(inviter.userId)
    expect(await mixPacks(userId)).toBe(30)
    const fr = await friendshipsOf(userId)
    expect(fr).toHaveLength(1)
    expect(fr[0].status).toBe('accepted')
    expect([fr[0].a, fr[0].b].sort()).toEqual([userId, inviter.userId].sort())
    const { data: notes } = await admin
      .from('notifications')
      .select('payload')
      .eq('player_id', inviter.userId)
      .eq('kind', 'referral_joined')
    expect(notes).toHaveLength(1)
    expect(notes![0].payload.username).toBe(name)
    const { data: inv } = await admin.from('players').select('username').eq('id', inviter.userId).single()
    const { data: gift } = await admin
      .from('notifications')
      .select('payload')
      .eq('player_id', userId)
      .eq('kind', 'referral_gift')
    expect(gift).toHaveLength(1)
    expect(gift![0].payload.username).toBe(inv!.username)
  })

  it('codes match case-insensitively after trim', async () => {
    const inviter = await newPlayer()
    const code = await codeOf(inviter.userId)
    const { userId, client } = await signedInClient()
    const { error } = await client.rpc('redeem_invite', { p_code: `  ${code.toLowerCase()} `, p_username: uname() })
    expect(error).toBeNull()
    expect(await referredBy(userId)).toBe(inviter.userId)
  })

  it("a player's code is reusable", async () => {
    const inviter = await newPlayer()
    const code = await codeOf(inviter.userId)
    for (let i = 0; i < 2; i++) {
      const { userId, client } = await signedInClient()
      const { error } = await client.rpc('redeem_invite', { p_code: code, p_username: uname() })
      expect(error).toBeNull()
      expect(await referredBy(userId)).toBe(inviter.userId)
    }
  })

  it('unknown code is invalid_invite and already_player is unchanged', async () => {
    const { client } = await signedInClient()
    const { error } = await client.rpc('redeem_invite', { p_code: 'ZZZZZZZZ', p_username: uname() })
    expect(error?.message).toContain('invalid_invite')
    const existing = await newPlayer()
    const { error: e2 } = await existing.client.rpc('redeem_invite', {
      p_code: await newInvite(),
      p_username: uname(),
    })
    expect(e2?.message).toContain('already_player')
  })
})

async function newReferral(inviterId: string) {
  const { userId, client } = await signedInClient()
  const username = uname()
  const { error } = await client.rpc('redeem_invite', { p_code: await codeOf(inviterId), p_username: username })
  if (error) throw error
  return { userId, client, username }
}

async function openings(playerId: string, days: string[]) {
  const rows = days.map((d) => ({ player_id: playerId, pack_type_id: 'mix', card_ids: [], created_at: `${d}T12:00:00Z` }))
  const { error } = await admin.from('pack_openings').insert(rows)
  if (error) throw error
}

function spread(n: number, days: string[]) {
  return Array.from({ length: n }, (_, i) => days[i % days.length])
}

async function currencyOf(id: string): Promise<number> {
  const { data, error } = await admin.from('players').select('currency').eq('id', id).single()
  if (error) throw error
  return data!.currency as number
}

async function rewardedAt(id: string) {
  const { data, error } = await admin.from('players').select('referral_rewarded_at').eq('id', id).single()
  if (error) throw error
  return data!.referral_rewarded_at as string | null
}

async function rewardRows(ref: string) {
  const { data, error } = await admin.from('ledger').select('*').eq('kind', 'referral_reward').eq('ref', ref)
  if (error) throw error
  return data!
}

const D1 = '2026-01-01'
const D2 = '2026-01-02'
const D3 = '2026-01-03'
const D4 = '2026-01-04'

describe('inviter reward', () => {
  it('no reward at 50 boosters on 1 or 2 days', async () => {
    const inviter = await newPlayer()
    const before = await currencyOf(inviter.userId)
    const a = await newReferral(inviter.userId)
    await openings(a.userId, spread(50, [D1]))
    const b = await newReferral(inviter.userId)
    await openings(b.userId, spread(50, [D1, D2]))
    expect(await currencyOf(inviter.userId)).toBe(before)
    expect(await rewardedAt(a.userId)).toBeNull()
    expect(await rewardedAt(b.userId)).toBeNull()
    expect(await rewardRows(a.userId)).toHaveLength(0)
    expect(await rewardRows(b.userId)).toHaveLength(0)
  })

  it('reward when 50 boosters span 3 days', async () => {
    const inviter = await newPlayer()
    const before = await currencyOf(inviter.userId)
    const packsBefore = await mixPacks(inviter.userId)
    const f = await newReferral(inviter.userId)
    await openings(f.userId, spread(49, [D1, D2, D3]))
    expect(await rewardedAt(f.userId)).toBeNull()
    await openings(f.userId, [D3])
    expect(await currencyOf(inviter.userId)).toBe(before + 500)
    expect(await mixPacks(inviter.userId)).toBe(packsBefore + 30)
    const rows = await rewardRows(f.userId)
    expect(rows).toHaveLength(1)
    expect(rows[0].player_id).toBe(inviter.userId)
    expect(rows[0].currency_delta).toBe(500)
    const { data: notes } = await admin
      .from('notifications')
      .select('payload')
      .eq('player_id', inviter.userId)
      .eq('kind', 'referral_rewarded')
    expect(notes).toHaveLength(1)
    expect(notes![0].payload.username).toBe(f.username)
    expect(await rewardedAt(f.userId)).not.toBeNull()
  })

  it('the day condition can be met last', async () => {
    const inviter = await newPlayer()
    const f = await newReferral(inviter.userId)
    await openings(f.userId, spread(52, [D1, D2]))
    expect(await rewardedAt(f.userId)).toBeNull()
    await openings(f.userId, [D3])
    expect(await rewardedAt(f.userId)).not.toBeNull()
    expect(await rewardRows(f.userId)).toHaveLength(1)
  })

  it('paid once', async () => {
    const inviter = await newPlayer()
    const f = await newReferral(inviter.userId)
    await openings(f.userId, spread(50, [D1, D2, D3]))
    await openings(f.userId, spread(5, [D4]))
    expect(await rewardRows(f.userId)).toHaveLength(1)

    // two parallel openings crossing the threshold pay exactly once
    const before = await currencyOf(inviter.userId)
    const g = await newReferral(inviter.userId)
    await openings(g.userId, spread(49, [D1, D2, D3]))
    await Promise.all([openings(g.userId, [D4]), openings(g.userId, [D4])])
    expect(await rewardRows(g.userId)).toHaveLength(1)
    expect(await currencyOf(inviter.userId)).toBe(before + 500)

    // 48 + two parallel: the second waits for the first and still sees the 50th row
    const h = await newReferral(inviter.userId)
    await openings(h.userId, spread(48, [D1, D2, D3]))
    await Promise.all([openings(h.userId, [D4]), openings(h.userId, [D4])])
    expect(await rewardRows(h.userId)).toHaveLength(1)
  })

  it('owner-code players never pay anyone', async () => {
    const p = await newPlayer()
    await openings(p.userId, spread(50, [D1, D2, D3]))
    expect(await rewardRows(p.userId)).toHaveLength(0)
    expect(await rewardedAt(p.userId)).toBeNull()
  })
})

describe('referral reads', () => {
  it('my_referrals shape', async () => {
    const inviter = await newPlayer()
    const a = await newReferral(inviter.userId)
    await openings(a.userId, spread(52, [D1, D2, D3, D4]))
    const b = await newReferral(inviter.userId)
    await openings(b.userId, spread(2, [D1]))
    const { data, error } = await inviter.client.rpc('my_referrals')
    expect(error).toBeNull()
    expect(data.code).toBe(await codeOf(inviter.userId))
    expect(data.invited).toHaveLength(2)
    expect(data.invited.map((r: { username: string }) => r.username)).toEqual([b.username, a.username])
    expect(Object.keys(data.invited[0]).sort()).toEqual(
      ['avatarUrl', 'boostersOpened', 'daysPlayed', 'joinedAt', 'rewarded', 'username'].sort(),
    )
    expect(data.invited[0]).toMatchObject({ boostersOpened: 2, daysPlayed: 1, rewarded: false })
    expect(data.invited[1]).toMatchObject({ boostersOpened: 50, daysPlayed: 3, rewarded: true })
    expect(data.totals).toEqual({ joined: 2, rewarded: 1, boostersEarned: 30, currencyEarned: 500 })

    const other = await newPlayer()
    const { data: mine, error: e2 } = await other.client.rpc('my_referrals')
    expect(e2).toBeNull()
    expect(mine.code).toBe(await codeOf(other.userId))
    expect(mine.invited).toEqual([])
    expect(mine.totals).toEqual({ joined: 0, rewarded: 0, boostersEarned: 0, currencyEarned: 0 })

    const { error: e3 } = await anon().rpc('my_referrals')
    expect(e3).not.toBeNull()
  })

  it('referral_preview', async () => {
    const inviter = await newPlayer()
    const { data: cards } = await admin.from('cards').select('id').order('id').limit(4)
    for (const c of cards ?? []) await giveCards(inviter.userId, c.id as number, 1)
    const code = await codeOf(inviter.userId)
    const { data, error } = await anon().rpc('referral_preview', { p_code: ` ${code.toLowerCase()} ` })
    expect(error).toBeNull()
    expect(Object.keys(data).sort()).toEqual(['avatarUrl', 'cards', 'username'])
    expect(data.cards.length).toBeLessThanOrEqual(3)
    if ((cards ?? []).length >= 3) expect(data.cards).toHaveLength(3)
    for (const c of data.cards) expect(Object.keys(c).sort()).toEqual(['imageUrl', 'name', 'rarity'])

    for (const junk of ['', 'zzzz', 'A'.repeat(1000)]) {
      const r = await anon().rpc('referral_preview', { p_code: junk })
      expect(r.error).toBeNull()
      expect(r.data).toBeNull()
    }
  })
})

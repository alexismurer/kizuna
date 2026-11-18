import { describe, expect, it } from 'vitest'
import { admin, newInvite, newPlayer, signedInClient } from './helpers'

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
  })

  it("a player's code signs up a referral", async () => {
    const inviter = await newPlayer()
    const code = await codeOf(inviter.userId)
    const { userId, client } = await signedInClient()
    const name = uname()
    const { error } = await client.rpc('redeem_invite', { p_code: code, p_username: name })
    expect(error).toBeNull()
    expect(await referredBy(userId)).toBe(inviter.userId)
    expect(await mixPacks(userId)).toBe(3)
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

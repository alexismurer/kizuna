import { describe, expect, it } from 'vitest'
import { admin, signedInClient } from './helpers'

const uname = () => `os${Math.random().toString(36).slice(2, 10)}`

describe('open sign-up', () => {
  it('creates a player without any code', async () => {
    for (const p_code of ['', '   ', null]) {
      const { userId, client } = await signedInClient()
      const name = uname()
      const { error } = await client.rpc('redeem_invite', { p_code, p_username: name })
      expect(error).toBeNull()
      const { data } = await admin.from('players').select('username, referred_by').eq('id', userId).single()
      expect(data).toEqual({ username: name, referred_by: null })
    }
  })

  it('still refuses a code that matches nothing', async () => {
    const { client } = await signedInClient()
    const { error } = await client.rpc('redeem_invite', { p_code: 'ZZZZ9999', p_username: uname() })
    expect(error?.message).toMatch('invalid_invite')
  })

  it('gives no referral gift without a code', async () => {
    const { userId, client } = await signedInClient()
    await client.rpc('redeem_invite', { p_code: '', p_username: uname() })
    const { data } = await admin.from('granted_packs').select('count').eq('player_id', userId)
    expect(data ?? []).toHaveLength(0)
  })
})

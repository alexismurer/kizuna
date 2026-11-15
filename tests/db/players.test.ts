import { describe, expect, it } from 'vitest'
import { admin, giveCards, newInvite, newPlayer, signedInClient } from './helpers'

describe('players and invites', () => {
  it('redeeming a fresh code creates a player with 10 free boosters and 0 currency', async () => {
    const { userId } = await newPlayer()
    const { data, error } = await admin.from('players').select('free_stock, currency').eq('id', userId).single()
    expect(error).toBeNull()
    expect(data).toEqual({ free_stock: 10, currency: 0 })
  })

  it('rejects a reused code with invalid_invite', async () => {
    const code = await newInvite()
    const a = await signedInClient()
    const b = await signedInClient()
    const ok = await a.client.rpc('redeem_invite', { p_code: code, p_username: `ra${Date.now()}` })
    expect(ok.error).toBeNull()
    const again = await b.client.rpc('redeem_invite', { p_code: code, p_username: `rb${Date.now()}` })
    expect(again.error?.message).toContain('invalid_invite')
  })

  it('rejects a duplicate username with username_taken', async () => {
    const name = `dup${Date.now()}`
    const a = await signedInClient()
    const b = await signedInClient()
    expect((await a.client.rpc('redeem_invite', { p_code: await newInvite(), p_username: name })).error).toBeNull()
    const res = await b.client.rpc('redeem_invite', { p_code: await newInvite(), p_username: name })
    expect(res.error?.message).toContain('username_taken')
  })

  it('rejects a second redemption by the same user with already_player', async () => {
    const { client } = await newPlayer()
    const res = await client.rpc('redeem_invite', { p_code: await newInvite(), p_username: `x${Date.now()}` })
    expect(res.error?.message).toContain('already_player')
  })

  it('does not expose require_player as an RPC', async () => {
    const { client } = await newPlayer()
    const res = await client.rpc('require_player')
    expect(res.error).not.toBeNull()
  })

  it("hides another player's inventory", async () => {
    const a = await newPlayer()
    const b = await newPlayer()
    await giveCards(a.userId, 1, 2)
    const { data, error } = await b.client.from('inventory').select('*').eq('player_id', a.userId)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
    const mine = await a.client.from('inventory').select('*')
    expect(mine.data).toHaveLength(1)
  })
})

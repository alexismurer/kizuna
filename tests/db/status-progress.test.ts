import { describe, it, expect } from 'vitest'
import { admin, newPlayer } from './helpers'

type Progress = { missionsClaimable: number; dailyDone: number; streakDay: number; streakClaimedToday: boolean }

describe('my_status progress fields', () => {
  it('reports claimable missions, daily missions done and the login streak', async () => {
    const { userId, client } = await newPlayer()
    const status = async () => {
      const { data, error } = await client.rpc('my_status')
      if (error) throw error
      return data as Progress
    }

    // a new player can claim "pick your username" straight away
    expect(await status()).toMatchObject({
      missionsClaimable: 1,
      dailyDone: 0,
      streakDay: 0,
      streakClaimedToday: false,
    })

    expect((await client.rpc('claim_login')).error).toBeNull()
    expect((await client.rpc('claim_mission', { p_key: 'first_username' })).error).toBeNull()
    expect(await status()).toMatchObject({ missionsClaimable: 0, streakDay: 1, streakClaimedToday: true })

    // two of today's three daily missions claimed
    const { data: missions } = await client.rpc('my_missions')
    const { day, daily } = missions as { day: string; daily: { key: string }[] }
    const { error } = await admin.from('mission_claims').insert(
      daily.slice(0, 2).map((m) => ({ player_id: userId, mission_key: m.key, period: day })),
    )
    if (error) throw error
    expect((await status()).dailyDone).toBe(2)
  })
})

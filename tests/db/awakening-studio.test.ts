import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { admin, newPlayer } from './helpers'

const ID = 'test-studio-1'
type P = Awaited<ReturnType<typeof newPlayer>>

async function withRole(role: 'admin' | 'moderator'): Promise<P> {
  const p = await newPlayer()
  const { error } = await admin.from('admins').insert({ player_id: p.userId, role })
  if (error) throw error
  return p
}

type Row = { id: string; issued: number; loopUrl: string | null; effect: string; baseName: string }

let a: P
let m: P
let plain: P
let baseCard: number

const args = (over: Record<string, unknown> = {}) => ({
  p_id: ID, p_base_card_id: baseCard, p_title: 'Studio', p_form: 'Form', p_effect: 'sun',
  p_accent: '#ffcc00', p_total: 10, p_sort: 900, p_active: true,
  p_loop_url: 'https://x.test/loop.mp4', p_poster_url: '', p_reveal_url: '', ...over,
})
const save = (over?: Record<string, unknown>) => a.client.rpc('admin_save_awakening', args(over))
const list = async () => ((await a.client.rpc('admin_awakenings')).data as Row[]).find((r) => r.id === ID)

async function cleanup() {
  await admin.from('awakening_copies').delete().eq('awakening_id', ID)
  await admin.from('awakenings').delete().eq('id', ID)
}

beforeAll(async () => {
  ;[a, m, plain] = await Promise.all([withRole('admin'), withRole('moderator'), newPlayer()])
  const { data } = await admin.from('cards').select('id').limit(1).single()
  baseCard = data!.id
  await cleanup()
})
afterAll(cleanup)

describe('awakening studio', () => {
  it('admin creates and lists', async () => {
    const r = await save()
    expect(r.error).toBeNull()
    expect(r.data).toBe(ID)
    const row = await list()
    expect(row?.issued).toBe(0)
    expect(row?.loopUrl).toBe('https://x.test/loop.mp4')
  })

  it('accepts effect none', async () => {
    expect((await save({ p_effect: 'none' })).error).toBeNull()
    expect((await list())?.effect).toBe('none')
  })

  it('rejects invalid input', async () => {
    for (const over of [{ p_id: 'A' }, { p_accent: 'red' }, { p_loop_url: 'http://x' }, { p_title: ' ' }]) {
      expect((await save(over)).error?.message, JSON.stringify(over)).toContain('invalid_awakening')
    }
  })

  it('denies non-admins', async () => {
    for (const c of [m, plain]) {
      expect((await c.client.rpc('admin_awakenings')).error?.message).toContain('not_admin')
      expect((await c.client.rpc('admin_save_awakening', args())).error?.message).toContain('not_admin')
      expect((await c.client.rpc('admin_delete_awakening', { p_id: ID })).error?.message).toContain('not_admin')
    }
  })

  it('catalog exposes loopUrl for active awakenings', async () => {
    await save()
    const cat = (await plain.client.rpc('awakening_catalog')).data as { cards: { id: string; loopUrl: string }[] }
    expect(cat.cards.find((c) => c.id === ID)?.loopUrl).toBe('https://x.test/loop.mp4')
  })

  it('protects awakenings with copies, then deletes when empty', async () => {
    await save()
    const { error } = await admin.from('awakening_copies').insert({ awakening_id: ID, serial: 1 })
    expect(error).toBeNull()
    expect((await save({ p_total: 0 })).error?.message).toContain('invalid_awakening')
    const { data: other } = await admin.from('cards').select('id').neq('id', baseCard).limit(1).single()
    expect((await save({ p_base_card_id: other!.id })).error?.message).toContain('awakening_in_use')
    expect((await a.client.rpc('admin_delete_awakening', { p_id: ID })).error?.message).toContain('awakening_in_use')
    await admin.from('awakening_copies').delete().eq('awakening_id', ID)
    expect((await a.client.rpc('admin_delete_awakening', { p_id: ID })).error).toBeNull()
    expect(await list()).toBeUndefined()
  })

  it('rejects total below issued', async () => {
    await save({ p_total: 10 })
    await admin.from('awakening_copies').insert([
      { awakening_id: ID, serial: 1 },
      { awakening_id: ID, serial: 2 },
    ])
    expect((await save({ p_total: 1 })).error?.message).toContain('total_below_issued')
  })
})

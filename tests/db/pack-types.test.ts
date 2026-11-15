import { describe, it, expect } from 'vitest'
import { admin } from './helpers'

describe('pack_types', () => {
  it('refuses a shop pack without a price', async () => {
    const { error } = await admin
      .from('pack_types')
      .insert({ id: 'no_price_shop', kind: 'shop', price: null, slot_floors: ['common'], sort: 99 })
    expect(error?.message).toMatch(/pack_types_shop_price_check/)
  })

  it('still allows a priceless free pack', async () => {
    const { error } = await admin
      .from('pack_types')
      .insert({ id: 'free_no_price', kind: 'free', price: null, slot_floors: ['common'], sort: 99 })
    expect(error).toBeNull()
    await admin.from('pack_types').delete().eq('id', 'free_no_price')
  })
})

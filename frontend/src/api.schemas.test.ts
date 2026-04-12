import { describe, expect, it } from 'vitest'
import { cardsResponseSchema, meResponseSchema } from './api.schemas'

describe('meResponseSchema', () => {
  it('applies defaults for an empty payload', () => {
    const r = meResponseSchema.parse({})
    expect(r.user).toBeNull()
    expect(r.csrf_token).toBe('')
    expect(r.pending_card_requests).toBe(0)
    expect(r.tikkie_warnings).toEqual([])
    expect(r.payment_amount_eur).toBe('15')
  })

  it('accepts a user object', () => {
    const r = meResponseSchema.parse({
      user: { id: 5, email: 'a@b.nl', name: 'A', is_admin: true },
    })
    expect(r.user?.id).toBe(5)
    expect(r.user?.email).toBe('a@b.nl')
  })
})

describe('cardsResponseSchema', () => {
  it('parses a partial card row with defaults', () => {
    const r = cardsResponseSchema.parse({ cards: [{ id: 1, kind: 'tosti' }] })
    expect(r.cards).toHaveLength(1)
    expect(r.cards[0].id).toBe(1)
    expect(r.cards[0].kind).toBe('tosti')
    expect(r.cards[0].source).toBe('online')
  })
})

import { describe, expect, it } from 'vitest'
import type { Card, TostiOrder } from '../api'
import { freeKnipjesForCard, pendingReservedOnCard, unicodeScalarCount } from './tostiOrderUtils'

function card(overrides: Partial<Card> = {}): Card {
  return {
    id: 1,
    kind: 'tosti',
    source: 'online',
    knipjes_remaining: 10,
    created_at: '',
    ...overrides,
  }
}

function order(overrides: Partial<TostiOrder> = {}): TostiOrder {
  return {
    id: 1,
    user_id: 1,
    card_id: 1,
    bread: 'wit',
    filling: 'ham',
    quantity: 1,
    status: 'pending',
    created_at: '',
    is_physical_card: false,
    ...overrides,
  }
}

describe('unicodeScalarCount', () => {
  it('counts grapheme clusters (emoji as one)', () => {
    expect(unicodeScalarCount('ab')).toBe(2)
    expect(unicodeScalarCount('a🙂b')).toBe(3)
  })
})

describe('pendingReservedOnCard', () => {
  it('sums quantities of pending orders for the card', () => {
    const orders: TostiOrder[] = [
      order({ id: 1, card_id: 1, quantity: 2, status: 'pending' }),
      order({ id: 2, card_id: 1, quantity: 1, status: 'delivered' }),
      order({ id: 3, card_id: 2, quantity: 5, status: 'pending' }),
    ]
    expect(pendingReservedOnCard(orders, 1)).toBe(2)
  })
})

describe('freeKnipjesForCard', () => {
  it('returns 0 for non-online cards', () => {
    expect(freeKnipjesForCard(card({ source: 'physical', knipjes_remaining: 10 }), [])).toBe(0)
  })

  it('subtracts pending reservations from remaining', () => {
    const c = card({ id: 7, knipjes_remaining: 5 })
    const orders: TostiOrder[] = [order({ card_id: 7, quantity: 2, status: 'pending' })]
    expect(freeKnipjesForCard(c, orders)).toBe(3)
  })

  it('never goes negative', () => {
    const c = card({ id: 7, knipjes_remaining: 1 })
    const orders: TostiOrder[] = [order({ card_id: 7, quantity: 5, status: 'pending' })]
    expect(freeKnipjesForCard(c, orders)).toBe(0)
  })
})

import type { Card, TostiOrder } from '../api'

export const TOSTI_REMARK_MAX_CHARS = 500

export function unicodeScalarCount(s: string): number {
  return [...s].length
}

export function pendingReservedOnCard(orders: TostiOrder[], cardId: number): number {
  return orders
    .filter((o) => o.status === 'pending' && o.card_id !== null && o.card_id === cardId)
    .reduce((sum, o) => sum + o.quantity, 0)
}

export function freeKnipjesForCard(card: Card, orders: TostiOrder[]): number {
  if (card.source !== 'online') return 0
  return Math.max(0, card.knipjes_remaining - pendingReservedOnCard(orders, card.id))
}

import { apiJson, apiVoid } from '../apiRequest'
import {
  avondetenRegistrationsResponseSchema,
  operatorCardSaleResponseSchema,
  operatorCardsResponseSchema,
  operatorMembersResponseSchema,
  operatorTostiOrdersResponseSchema,
  operatorTostiSoldTodaySchema,
  registeredCountResponseSchema,
} from '../api.schemas'
import type {
  AvondetenRegistrationCard,
  CardKind,
  OperatorCardRow,
  OperatorMember,
  OperatorTostiOrderRow,
  OperatorTostiSoldToday,
  PaymentMethod,
} from './types'

export async function getAvondetenRegistrations(
  mealDate: string,
): Promise<{ meal_date: string; cards: AvondetenRegistrationCard[] }> {
  const qs = `?meal_date=${encodeURIComponent(mealDate)}`
  const payload = await apiJson(
    `/api/operator/avondeten/registrations${qs}`,
    avondetenRegistrationsResponseSchema,
  )
  return {
    meal_date: payload.meal_date || mealDate,
    cards: payload.cards,
  }
}

export async function postAvondetenRegister(
  csrf: string,
  mealDate: string,
  cardIds: number[],
): Promise<number> {
  const payload = await apiJson('/api/operator/avondeten/register', registeredCountResponseSchema, {
    method: 'POST',
    csrf,
    body: { meal_date: mealDate, card_ids: cardIds },
  })
  return payload.registered_count
}

export async function getOperatorCards(q: string): Promise<OperatorCardRow[]> {
  const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''
  const payload = await apiJson(`/api/operator/cards${qs}`, operatorCardsResponseSchema)
  return payload.cards
}

export async function getOperatorMembers(): Promise<OperatorMember[]> {
  const payload = await apiJson('/api/operator/members', operatorMembersResponseSchema)
  return payload.members
}

export async function createOperatorCardSale(
  csrf: string,
  body: { user_id: number; kind: CardKind; payment_method: PaymentMethod },
): Promise<number> {
  const payload = await apiJson('/api/operator/card-sales', operatorCardSaleResponseSchema, {
    method: 'POST',
    csrf,
    body,
  })
  return payload.request_id
}

export async function getOperatorTostiOrders(): Promise<OperatorTostiOrderRow[]> {
  const payload = await apiJson('/api/operator/tosti-orders', operatorTostiOrdersResponseSchema)
  return payload.orders
}

export async function getOperatorTostiSoldToday(): Promise<OperatorTostiSoldToday> {
  return apiJson('/api/operator/tosti-sold-today', operatorTostiSoldTodaySchema)
}

export async function deliverOperatorTostiOrder(csrf: string, id: number): Promise<void> {
  await apiVoid(`/api/operator/tosti-orders/${id}/deliver`, { method: 'POST', csrf })
}

export async function cancelOperatorTostiOrder(csrf: string, id: number): Promise<void> {
  await apiVoid(`/api/operator/tosti-orders/${id}/cancel`, { method: 'POST', csrf })
}

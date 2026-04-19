import { ApiError, apiJson, apiVoid } from '../apiRequest'
import { createTostiOrderResponseSchema, tostiOrdersResponseSchema, tostiQueueResponseSchema } from '../api.schemas'
import type { CreateTostiOrderBody, TostiOrder, TostiQueueEntry } from './types'

export async function getTostiQueue(): Promise<TostiQueueEntry[]> {
  const payload = await apiJson('/api/tosti-orders/queue', tostiQueueResponseSchema)
  return payload.orders
}

export async function getMyTostiOrders(): Promise<TostiOrder[]> {
  const payload = await apiJson('/api/tosti-orders/mine', tostiOrdersResponseSchema)
  return payload.orders
}

export async function createTostiOrder(csrf: string, body: CreateTostiOrderBody): Promise<TostiOrder> {
  const remark = typeof body.remark === 'string' ? body.remark.trim() : ''
  const payload =
    body.physical_card === true
      ? {
          physical_card: true,
          bread: body.bread,
          filling: body.filling,
          quantity: body.quantity,
          ...(remark !== '' ? { remark } : {}),
        }
      : {
          card_id: body.card_id,
          bread: body.bread,
          filling: body.filling,
          quantity: body.quantity,
          ...(remark !== '' ? { remark } : {}),
        }
  const parsed = await apiJson('/api/tosti-orders', createTostiOrderResponseSchema, {
    method: 'POST',
    csrf,
    body: payload,
  })
  if (!parsed.order) throw new ApiError(500, 'error', 'Ongeldig antwoord.')
  return parsed.order
}

export async function cancelMyTostiOrder(csrf: string, id: number): Promise<void> {
  await apiVoid(`/api/tosti-orders/${id}/cancel`, { method: 'POST', csrf })
}

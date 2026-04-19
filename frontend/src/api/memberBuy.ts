import { apiJson, apiVoid } from '../apiRequest'
import {
  buyInfoResponseSchema,
  cancelledCountResponseSchema,
  cardsResponseSchema,
} from '../api.schemas'
import type { BuyInfo, Card, CardKind } from './types'

export async function getCards(): Promise<Card[]> {
  const payload = await apiJson('/api/cards', cardsResponseSchema)
  return payload.cards
}

export async function useKnipje(csrf: string, cardId: number): Promise<void> {
  await apiVoid(`/api/cards/${cardId}/use`, { method: 'POST', csrf })
}

export async function getBuyInfo(): Promise<BuyInfo> {
  return apiJson('/api/buy', buyInfoResponseSchema)
}

export async function requestCard(csrf: string, kind: CardKind = 'tosti'): Promise<void> {
  await apiVoid('/api/buy/request', { method: 'POST', csrf, body: { kind } })
}

export async function cancelMyRequest(csrf: string, id: number): Promise<void> {
  await apiVoid(`/api/buy/requests/${id}/cancel`, { method: 'POST', csrf })
}

export async function cancelAllMyPendingRequests(csrf: string): Promise<number> {
  const payload = await apiJson('/api/buy/cancel-all-pending', cancelledCountResponseSchema, {
    method: 'POST',
    csrf,
  })
  return payload.cancelled_count
}

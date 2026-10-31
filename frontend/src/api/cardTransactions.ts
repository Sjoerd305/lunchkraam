import { apiJson, apiVoid } from '../apiRequest'
import { cardTransactionsResponseSchema } from '../api.schemas'
import type { CardTransactionsPayload } from './types'

/** Knipje-logboek van een kaart: lid alleen eigen kaarten, kraam/admin elke kaart. */
export async function getCardTransactions(cardId: number): Promise<CardTransactionsPayload> {
  return apiJson(`/api/cards/${cardId}/transactions`, cardTransactionsResponseSchema)
}

/** Draait één boeking terug (kraam/admin). Een avondetenregistratie wordt daarbij verwijderd. */
export async function undoCardTransaction(csrf: string, transactionId: number): Promise<void> {
  await apiVoid(`/api/operator/card-transactions/${transactionId}/undo`, { method: 'POST', csrf })
}

/** Zet de schatting van een fysieke kaart (0–10). */
export async function setCardEstimate(csrf: string, cardId: number, knipjesRemaining: number): Promise<void> {
  await apiVoid(`/api/operator/cards/${cardId}/estimate`, {
    method: 'POST',
    csrf,
    body: { knipjes_remaining: knipjesRemaining },
  })
}

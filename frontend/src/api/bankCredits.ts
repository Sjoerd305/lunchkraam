import { apiJson } from '../apiRequest'
import {
  bankCreditMatchCandidatesResponseSchema,
  bankCreditSuggestionsResponseSchema,
  bankCreditsListResponseSchema,
  okResponseSchema,
} from '../api.schemas'
import type {
  BankCreditMatchCandidatesPayload,
  BankCreditSuggestionsPayload,
  BankCreditsListPayload,
} from './types'

export async function getAdminBankCreditsUnmatched(year: number): Promise<BankCreditsListPayload> {
  return apiJson(`/api/admin/bank-credits/unmatched?year=${year}`, bankCreditsListResponseSchema)
}

export async function getOperatorBankCreditsUnmatched(year: number): Promise<BankCreditsListPayload> {
  return apiJson(`/api/operator/bank-credits/unmatched?year=${year}`, bankCreditsListResponseSchema)
}

export async function getAdminBankCreditsMatched(year: number): Promise<BankCreditsListPayload> {
  return apiJson(`/api/admin/bank-credits/matched?year=${year}`, bankCreditsListResponseSchema)
}

export async function getOperatorBankCreditsMatched(year: number): Promise<BankCreditsListPayload> {
  return apiJson(`/api/operator/bank-credits/matched?year=${year}`, bankCreditsListResponseSchema)
}

export async function getAdminBankCreditsWaived(year: number): Promise<BankCreditsListPayload> {
  return apiJson(`/api/admin/bank-credits/waived?year=${year}`, bankCreditsListResponseSchema)
}

export async function getOperatorBankCreditsWaived(year: number): Promise<BankCreditsListPayload> {
  return apiJson(`/api/operator/bank-credits/waived?year=${year}`, bankCreditsListResponseSchema)
}

export async function getAdminBankCreditSuggestions(bankCreditId: number): Promise<BankCreditSuggestionsPayload> {
  return apiJson(`/api/admin/bank-credits/${bankCreditId}/suggestions`, bankCreditSuggestionsResponseSchema)
}

export async function getOperatorBankCreditSuggestions(bankCreditId: number): Promise<BankCreditSuggestionsPayload> {
  return apiJson(`/api/operator/bank-credits/${bankCreditId}/suggestions`, bankCreditSuggestionsResponseSchema)
}

export async function getAdminBankCreditMatchCandidates(bankCreditId: number): Promise<BankCreditMatchCandidatesPayload> {
  return apiJson(`/api/admin/bank-credits/${bankCreditId}/match-candidates`, bankCreditMatchCandidatesResponseSchema)
}

export async function getOperatorBankCreditMatchCandidates(bankCreditId: number): Promise<BankCreditMatchCandidatesPayload> {
  return apiJson(`/api/operator/bank-credits/${bankCreditId}/match-candidates`, bankCreditMatchCandidatesResponseSchema)
}

export async function postAdminBankCreditMatch(
  csrf: string,
  bankCreditId: number,
  cardRequestId: number,
): Promise<void> {
  await apiJson(`/api/admin/bank-credits/${bankCreditId}/match`, okResponseSchema, {
    method: 'POST',
    csrf,
    body: { card_request_id: cardRequestId },
  })
}

export async function postOperatorBankCreditMatch(
  csrf: string,
  bankCreditId: number,
  cardRequestId: number,
): Promise<void> {
  await apiJson(`/api/operator/bank-credits/${bankCreditId}/match`, okResponseSchema, {
    method: 'POST',
    csrf,
    body: { card_request_id: cardRequestId },
  })
}

export async function postAdminBankCreditUnmatch(csrf: string, bankCreditId: number): Promise<void> {
  await apiJson(`/api/admin/bank-credits/${bankCreditId}/unmatch`, okResponseSchema, {
    method: 'POST',
    csrf,
    body: {},
  })
}

export async function postOperatorBankCreditUnmatch(csrf: string, bankCreditId: number): Promise<void> {
  await apiJson(`/api/operator/bank-credits/${bankCreditId}/unmatch`, okResponseSchema, {
    method: 'POST',
    csrf,
    body: {},
  })
}

export async function postAdminBankCreditWaive(csrf: string, bankCreditId: number): Promise<void> {
  await apiJson(`/api/admin/bank-credits/${bankCreditId}/waive`, okResponseSchema, {
    method: 'POST',
    csrf,
    body: {},
  })
}

export async function postOperatorBankCreditWaive(csrf: string, bankCreditId: number): Promise<void> {
  await apiJson(`/api/operator/bank-credits/${bankCreditId}/waive`, okResponseSchema, {
    method: 'POST',
    csrf,
    body: {},
  })
}

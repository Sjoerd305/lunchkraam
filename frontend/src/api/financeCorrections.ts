import { apiJson, apiVoid } from '../apiRequest'
import { financeCorrectionRowSchema, financeCorrectionsListResponseSchema } from '../api.schemas'
import type { FinanceCorrectionRow } from './types'

export async function getAdminFinanceCorrections(year: number) {
  return apiJson(`/api/admin/finance-corrections?year=${year}`, financeCorrectionsListResponseSchema)
}

export async function postAdminFinanceCorrection(
  csrf: string,
  body: {
    recorded_on: string
    purpose: string
    kind: string
    amount_eur: number
    description: string
  },
): Promise<FinanceCorrectionRow> {
  return apiJson('/api/admin/finance-corrections', financeCorrectionRowSchema, {
    method: 'POST',
    csrf,
    body,
  })
}

export async function deleteAdminFinanceCorrection(csrf: string, id: number): Promise<void> {
  await apiVoid(`/api/admin/finance-corrections/${id}`, { method: 'DELETE', csrf })
}

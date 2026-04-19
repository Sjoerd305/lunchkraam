import { apiJson } from '../apiRequest'
import { financeControlResponseSchema } from '../api.schemas'
import type { FinanceControlResponse } from './types'

export async function getAdminFinanceControl(year: number): Promise<FinanceControlResponse> {
  return apiJson(`/api/admin/finance-control?year=${year}`, financeControlResponseSchema)
}

export async function getOperatorFinanceControl(year: number): Promise<FinanceControlResponse> {
  return apiJson(`/api/operator/finance-control?year=${year}`, financeControlResponseSchema)
}

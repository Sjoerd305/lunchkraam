import { apiFormJson, apiJson, apiVoid } from '../apiRequest'
import {
  pendingImportReviewsResponseSchema,
  revolutBalanceResponseSchema,
  revolutPreviewResponseSchema,
  revolutShopExpenseImportResponseSchema,
  shopExpenseReceiptSchema,
  shopExpenseReceiptsListResponseSchema,
  shopExpenseSchema,
  shopExpensesResponseSchema,
} from '../api.schemas'
import type {
  AdminShopExpense,
  PendingImportReview,
  RevolutBalance,
  RevolutPreviewResponse,
  RevolutShopExpenseImportResult,
  ShopExpenseMovement,
  ShopExpensePaymentChannel,
  ShopExpensePurpose,
  ShopExpenseReceipt,
} from './types'

export async function getOperatorShopExpenses(year: number): Promise<AdminShopExpense[]> {
  const payload = await apiJson(`/api/operator/shop-expenses?year=${year}`, shopExpensesResponseSchema)
  return payload.expenses
}

export async function createOperatorShopExpense(
  csrf: string,
  body: {
    amount_eur: number
    spent_on: string
    description: string
    purpose: ShopExpensePurpose
    movement?: ShopExpenseMovement
    payment_channel?: ShopExpensePaymentChannel
  },
): Promise<AdminShopExpense> {
  return apiJson('/api/operator/shop-expenses', shopExpenseSchema, { method: 'POST', csrf, body })
}

export async function getAdminShopExpenses(year: number): Promise<AdminShopExpense[]> {
  const payload = await apiJson(`/api/admin/shop-expenses?year=${year}`, shopExpensesResponseSchema)
  return payload.expenses
}

export async function createShopExpense(
  csrf: string,
  body: {
    amount_eur: number
    spent_on: string
    description: string
    purpose: ShopExpensePurpose
    movement?: ShopExpenseMovement
    payment_channel?: ShopExpensePaymentChannel
  },
): Promise<AdminShopExpense> {
  return apiJson('/api/admin/shop-expenses', shopExpenseSchema, { method: 'POST', csrf, body })
}

export async function patchShopExpensePurpose(
  csrf: string,
  id: number,
  purpose: ShopExpensePurpose,
  isOperatorOnly: boolean,
): Promise<AdminShopExpense> {
  const prefix = isOperatorOnly ? '/api/operator' : '/api/admin'
  return apiJson(`${prefix}/shop-expenses/${id}`, shopExpenseSchema, {
    method: 'PATCH',
    csrf,
    body: { purpose },
  })
}

export async function deleteShopExpense(csrf: string, id: number): Promise<void> {
  await apiVoid(`/api/admin/shop-expenses/${id}`, { method: 'DELETE', csrf })
}

export async function importRevolutShopExpenses(
  csrf: string,
  formData: FormData,
  isOperatorOnly: boolean,
): Promise<RevolutShopExpenseImportResult> {
  const prefix = isOperatorOnly ? '/api/operator' : '/api/admin'
  return apiFormJson(`${prefix}/shop-expenses/revolut-import`, revolutShopExpenseImportResponseSchema, csrf, formData)
}

export async function previewRevolutShopExpenses(
  csrf: string,
  formData: FormData,
  isOperatorOnly: boolean,
): Promise<RevolutPreviewResponse> {
  const prefix = isOperatorOnly ? '/api/operator' : '/api/admin'
  return apiFormJson(`${prefix}/shop-expenses/revolut-import/preview`, revolutPreviewResponseSchema, csrf, formData)
}

export async function getRevolutBalance(isOperatorOnly: boolean): Promise<RevolutBalance> {
  const prefix = isOperatorOnly ? '/api/operator' : '/api/admin'
  return apiJson(`${prefix}/revolut-balance`, revolutBalanceResponseSchema)
}

export async function getShopExpenseReceipts(
  expenseId: number,
  isOperatorOnly: boolean,
): Promise<ShopExpenseReceipt[]> {
  const prefix = isOperatorOnly ? '/api/operator' : '/api/admin'
  const payload = await apiJson(
    `${prefix}/shop-expenses/${expenseId}/receipt`,
    shopExpenseReceiptsListResponseSchema,
  )
  return payload.receipts
}

export async function uploadShopExpenseReceipt(
  csrf: string,
  id: number,
  file: File,
  isOperatorOnly: boolean,
): Promise<ShopExpenseReceipt> {
  const prefix = isOperatorOnly ? '/api/operator' : '/api/admin'
  const form = new FormData()
  form.append('receipt', file)
  return apiFormJson(`${prefix}/shop-expenses/${id}/receipt`, shopExpenseReceiptSchema, csrf, form)
}

export async function deleteShopExpenseReceipt(
  csrf: string,
  expenseId: number,
  receiptId: number,
): Promise<void> {
  await apiVoid(`/api/admin/shop-expenses/${expenseId}/receipts/${receiptId}`, { method: 'DELETE', csrf })
}

export async function getPendingImportReviews(isOperatorOnly: boolean): Promise<PendingImportReview[]> {
  const prefix = isOperatorOnly ? '/api/operator' : '/api/admin'
  const payload = await apiJson(`${prefix}/shop-expenses/pending-reviews`, pendingImportReviewsResponseSchema)
  return payload.reviews
}

export async function mergePendingReview(csrf: string, id: number, isOperatorOnly: boolean): Promise<void> {
  const prefix = isOperatorOnly ? '/api/operator' : '/api/admin'
  await apiVoid(`${prefix}/shop-expenses/pending-reviews/${id}/merge`, { method: 'POST', csrf })
}

export async function dismissPendingReview(csrf: string, id: number, isOperatorOnly: boolean): Promise<void> {
  const prefix = isOperatorOnly ? '/api/operator' : '/api/admin'
  await apiVoid(`${prefix}/shop-expenses/pending-reviews/${id}/dismiss`, { method: 'POST', csrf })
}

import type { z } from 'zod'
import { ApiError, apiFormJson, apiJson, apiVoid } from './apiRequest'
import {
  adminCardsSoldBreakdownSchema,
  adminDashboardResponseSchema,
  adminExpensesBreakdownSchema,
  adminRequestSchema,
  adminRequestsResponseSchema,
  adminRevenueBreakdownSchema,
  adminSalesBreakdownBucketSchema,
  adminSalesMonthBucketSchema,
  adminSalesStatsResponseSchema,
  adminSalesYearBreakdownSchema,
  adminSettingsResponseSchema,
  adminTostiKindBucketSchema,
  adminTostiMonthBucketSchema,
  adminUserRowSchema,
  adminUsersResponseSchema,
  avondetenRegistrationCardSchema,
  avondetenRegistrationsResponseSchema,
  bankCreditMatchCandidatesResponseSchema,
  bankCreditReconciliationStatusSchema,
  bankCreditRowSchema,
  bankCreditSuggestionCandidateSchema,
  bankCreditSuggestionsResponseSchema,
  bankCreditsListResponseSchema,
  buyInfoResponseSchema,
  cancelledCountResponseSchema,
  cardKindSchema,
  cardSchema,
  cardsResponseSchema,
  createTostiOrderResponseSchema,
  meResponseSchema,
  myPendingRequestSchema,
  okResponseSchema,
  operatorCardRowSchema,
  operatorCardSaleResponseSchema,
  operatorCardsResponseSchema,
  operatorMemberSchema,
  operatorMembersResponseSchema,
  operatorTostiOrderSchema,
  operatorTostiOrdersResponseSchema,
  operatorTostiSoldTodaySchema,
  paymentMethodSchema,
  pendingImportReviewSchema,
  pendingImportReviewsResponseSchema,
  registeredCountResponseSchema,
  revolutBalanceResponseSchema,
  revolutPreviewBranchSchema,
  revolutPreviewResponseSchema,
  revolutPreviewRowSchema,
  revolutShopExpenseImportResponseSchema,
  revolutSkipReasonsSchema,
  shopExpensePaymentChannelSchema,
  shopExpensePurposeSchema,
  shopExpenseReceiptSchema,
  shopExpenseReceiptsListResponseSchema,
  shopExpenseSchema,
  shopExpensesResponseSchema,
  tikkieWarningSchema,
  tostiBreadSchema,
  tostiFillingSchema,
  tostiOrderSchema,
  tostiOrderStatusSchema,
  tostiOrdersResponseSchema,
  tostiQueueEntrySchema,
  tostiQueueResponseSchema,
  userEnvelopeSchema,
  userSchema,
  yearsResponseSchema,
} from './api.schemas'

export type CardKind = z.infer<typeof cardKindSchema>
export type PaymentMethod = z.infer<typeof paymentMethodSchema>
export type User = z.infer<typeof userSchema>
export type MeResponse = z.infer<typeof meResponseSchema>
export type TikkieWarning = z.infer<typeof tikkieWarningSchema>
export type Card = z.infer<typeof cardSchema>
export type MyPendingRequest = z.infer<typeof myPendingRequestSchema>
export type BuyInfo = z.infer<typeof buyInfoResponseSchema>
export type AdminRequest = z.infer<typeof adminRequestSchema>
export type AdminDashboardStats = z.infer<typeof adminDashboardResponseSchema>
export type AdminSalesMonthBucket = z.infer<typeof adminSalesMonthBucketSchema>
export type AdminCardsSoldBreakdown = z.infer<typeof adminCardsSoldBreakdownSchema>
export type AdminRevenueBreakdown = z.infer<typeof adminRevenueBreakdownSchema>
export type AdminExpensesBreakdown = z.infer<typeof adminExpensesBreakdownSchema>
export type AdminSalesBreakdownBucket = z.infer<typeof adminSalesBreakdownBucketSchema>
export type AdminSalesYearBreakdown = z.infer<typeof adminSalesYearBreakdownSchema>
export type AdminTostiMonthBucket = z.infer<typeof adminTostiMonthBucketSchema>
export type AdminTostiKindBucket = z.infer<typeof adminTostiKindBucketSchema>
export type AdminSalesStats = z.infer<typeof adminSalesStatsResponseSchema>
export type ShopExpensePurpose = z.infer<typeof shopExpensePurposeSchema>
export type BankCreditReconciliationStatus = z.infer<typeof bankCreditReconciliationStatusSchema>
export type BankCreditRow = z.infer<typeof bankCreditRowSchema>
export type BankCreditsListPayload = z.infer<typeof bankCreditsListResponseSchema>
export type BankCreditSuggestionCandidate = z.infer<typeof bankCreditSuggestionCandidateSchema>
export type BankCreditSuggestionsPayload = z.infer<typeof bankCreditSuggestionsResponseSchema>
export type BankCreditMatchCandidatesPayload = z.infer<typeof bankCreditMatchCandidatesResponseSchema>

/** Manual POST /shop-expenses: expense = uitgave (positief bedrag); cash_in = contant bij de kas (stored as negative amount_eur). */
export type ShopExpenseMovement = 'expense' | 'cash_in'

/** DB shop_expenses.payment_channel (uitgave: contant | digitaal; bij kas: kas_bij). */
export type ShopExpensePaymentChannel = z.infer<typeof shopExpensePaymentChannelSchema>

export type AdminShopExpense = z.infer<typeof shopExpenseSchema>
export type RevolutImportSkipReasons = z.infer<typeof revolutSkipReasonsSchema>
export type RevolutPreviewBranch = z.infer<typeof revolutPreviewBranchSchema>
export type RevolutPreviewRow = z.infer<typeof revolutPreviewRowSchema>
export type RevolutPreviewResponse = z.infer<typeof revolutPreviewResponseSchema>
export type RevolutShopExpenseImportResult = z.infer<typeof revolutShopExpenseImportResponseSchema>
export type PendingImportReview = z.infer<typeof pendingImportReviewSchema>
export type RevolutBalance = z.infer<typeof revolutBalanceResponseSchema>
export type ShopExpenseReceipt = z.infer<typeof shopExpenseReceiptSchema>

export { ApiError } from './apiRequest'

export async function getMe(): Promise<MeResponse> {
  return apiJson('/api/me', meResponseSchema)
}

export async function localLogin(csrf: string, username: string, password: string): Promise<void> {
  await apiVoid('/api/auth/local/login', {
    method: 'POST',
    csrf,
    body: { username: username.trim(), password },
  })
}

export async function changeOwnPassword(
  csrf: string,
  body: { current_password: string; new_password: string },
): Promise<void> {
  await apiVoid('/api/account/password', { method: 'POST', csrf, body })
}

export type AdminUserRow = z.infer<typeof adminUserRowSchema>

export async function getAdminUsers(): Promise<AdminUserRow[]> {
  const payload = await apiJson('/api/admin/users', adminUsersResponseSchema)
  return payload.users
}

export async function patchUserMatroosJeugd(csrf: string, userId: number, isMatroosJeugd: boolean): Promise<void> {
  await apiVoid(`/api/admin/users/${userId}/matroos-jeugd`, {
    method: 'PATCH',
    csrf,
    body: { is_matroos_jeugd: isMatroosJeugd },
  })
}

export async function createLocalUser(
  csrf: string,
  body: {
    username: string
    name: string
    password: string
    is_admin: boolean
    is_operator: boolean
    must_change_password: boolean
  },
): Promise<User> {
  const payload = await apiJson('/api/admin/users/local', userEnvelopeSchema, {
    method: 'POST',
    csrf,
    body: {
      username: body.username.trim().toLowerCase(),
      name: body.name.trim(),
      password: body.password,
      is_admin: body.is_admin,
      is_operator: body.is_operator,
      must_change_password: body.must_change_password,
    },
  })
  const u = payload.user
  if (!u) throw new ApiError(500, 'error', 'Ongeldig antwoord.')
  return u
}

export async function patchLocalUser(
  csrf: string,
  id: number,
  body: { password: string; is_admin: boolean; is_operator: boolean; must_change_password: boolean },
): Promise<User | null> {
  const payload = await apiJson(`/api/admin/users/${id}/local`, userEnvelopeSchema, {
    method: 'PATCH',
    csrf,
    body,
  })
  return payload.user
}

export type OperatorCardRow = z.infer<typeof operatorCardRowSchema>
export type OperatorMember = z.infer<typeof operatorMemberSchema>
export type AvondetenRegistrationCard = z.infer<typeof avondetenRegistrationCardSchema>

export async function getAvondetenRegistrations(
  mealDate: string,
): Promise<z.infer<typeof avondetenRegistrationsResponseSchema>> {
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

export type TostiBread = z.infer<typeof tostiBreadSchema>
export type TostiFilling = z.infer<typeof tostiFillingSchema>
export type TostiOrderStatus = z.infer<typeof tostiOrderStatusSchema>
export type TostiOrder = z.infer<typeof tostiOrderSchema>
export type OperatorTostiOrderRow = z.infer<typeof operatorTostiOrderSchema>

/** Pending order in global FIFO queue (member view; no e-mail). */
export type TostiQueueEntry = z.infer<typeof tostiQueueEntrySchema>

export async function getTostiQueue(): Promise<TostiQueueEntry[]> {
  const payload = await apiJson('/api/tosti-orders/queue', tostiQueueResponseSchema)
  return payload.orders
}

export async function getMyTostiOrders(): Promise<TostiOrder[]> {
  const payload = await apiJson('/api/tosti-orders/mine', tostiOrdersResponseSchema)
  return payload.orders
}

export type CreateTostiOrderBody =
  | {
      physical_card: true
      bread: TostiBread
      filling: TostiFilling
      quantity: number
      remark?: string
    }
  | {
      physical_card?: false
      card_id: number
      bread: TostiBread
      filling: TostiFilling
      quantity: number
      remark?: string
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

export async function getOperatorTostiOrders(): Promise<OperatorTostiOrderRow[]> {
  const payload = await apiJson('/api/operator/tosti-orders', operatorTostiOrdersResponseSchema)
  return payload.orders
}

export type OperatorTostiSoldToday = z.infer<typeof operatorTostiSoldTodaySchema>

export async function getOperatorTostiSoldToday(): Promise<OperatorTostiSoldToday> {
  return apiJson('/api/operator/tosti-sold-today', operatorTostiSoldTodaySchema)
}

export async function deliverOperatorTostiOrder(csrf: string, id: number): Promise<void> {
  await apiVoid(`/api/operator/tosti-orders/${id}/deliver`, { method: 'POST', csrf })
}

export async function cancelOperatorTostiOrder(csrf: string, id: number): Promise<void> {
  await apiVoid(`/api/operator/tosti-orders/${id}/cancel`, { method: 'POST', csrf })
}

export async function logout(csrf: string): Promise<void> {
  await apiVoid('/api/logout', { method: 'POST', csrf })
}

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

export async function getAdminSalesYears(): Promise<number[]> {
  const payload = await apiJson('/api/admin/sales-years', yearsResponseSchema)
  return payload.years.filter((y) => y > 0)
}

export async function getAdminSalesStats(year: number): Promise<AdminSalesStats> {
  const payload = await apiJson(`/api/admin/sales-stats?year=${year}`, adminSalesStatsResponseSchema)
  return payload.year > 0 ? payload : { ...payload, year }
}

export async function getOperatorSalesYears(): Promise<number[]> {
  const payload = await apiJson('/api/operator/sales-years', yearsResponseSchema)
  return payload.years.filter((y) => y > 0)
}

export async function getOperatorSalesStats(year: number): Promise<AdminSalesStats> {
  const payload = await apiJson(`/api/operator/sales-stats?year=${year}`, adminSalesStatsResponseSchema)
  return payload.year > 0 ? payload : { ...payload, year }
}

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

export async function getAdminDashboard(): Promise<AdminDashboardStats> {
  return apiJson('/api/admin/dashboard', adminDashboardResponseSchema)
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

export async function getAdminRequests(): Promise<AdminRequest[]> {
  const payload = await apiJson('/api/admin/requests', adminRequestsResponseSchema)
  return payload.requests
}

export async function fulfillRequest(csrf: string, id: number): Promise<void> {
  await apiVoid(`/api/admin/requests/${id}/fulfill`, { method: 'POST', csrf })
}

export async function rejectAdminRequest(csrf: string, id: number): Promise<void> {
  await apiVoid(`/api/admin/requests/${id}/reject`, { method: 'POST', csrf })
}

export type AdminAppSettings = z.infer<typeof adminSettingsResponseSchema>

export async function getAdminSettings(): Promise<AdminAppSettings> {
  return apiJson('/api/admin/settings', adminSettingsResponseSchema)
}

export async function patchAdminSettings(
  csrf: string,
  body: { tikkie_url: string; tikkie_url_avondeten: string },
): Promise<AdminAppSettings> {
  return apiJson('/api/admin/settings', adminSettingsResponseSchema, {
    method: 'PATCH',
    csrf,
    body: {
      tikkie_url: body.tikkie_url,
      tikkie_url_avondeten: body.tikkie_url_avondeten,
    },
  })
}

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

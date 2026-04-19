import { z, type ZodType } from 'zod'
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

export class ApiError extends Error {
  code: string
  status: number

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function parseError(res: Response): Promise<ApiError> {
  try {
    const j = (await res.json()) as { error?: string; message?: string }
    return new ApiError(res.status, j.error ?? 'error', j.message ?? res.statusText)
  } catch {
    return new ApiError(res.status, 'error', res.statusText)
  }
}

function parseApiResponse<T>(schema: ZodType<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    throw new ApiError(502, 'invalid_response', 'Server gaf een ongeldig antwoord.')
  }
  return parsed.data
}

export async function getMe(): Promise<MeResponse> {
  const res = await fetch('/api/me', { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  return parseApiResponse(meResponseSchema, await res.json())
}

export async function localLogin(csrf: string, username: string, password: string): Promise<void> {
  const res = await fetch('/api/auth/local/login', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf,
    },
    body: JSON.stringify({ username: username.trim(), password }),
  })
  if (!res.ok) throw await parseError(res)
}

export async function changeOwnPassword(
  csrf: string,
  body: { current_password: string; new_password: string },
): Promise<void> {
  const res = await fetch('/api/account/password', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await parseError(res)
}

export type AdminUserRow = z.infer<typeof adminUserRowSchema>

export async function getAdminUsers(): Promise<AdminUserRow[]> {
  const res = await fetch('/api/admin/users', { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  const payload = parseApiResponse(adminUsersResponseSchema, await res.json())
  return payload.users
}

export async function patchUserMatroosJeugd(csrf: string, userId: number, isMatroosJeugd: boolean): Promise<void> {
  const res = await fetch(`/api/admin/users/${userId}/matroos-jeugd`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf,
    },
    body: JSON.stringify({ is_matroos_jeugd: isMatroosJeugd }),
  })
  if (!res.ok) throw await parseError(res)
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
  const res = await fetch('/api/admin/users/local', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf,
    },
    body: JSON.stringify({
      username: body.username.trim().toLowerCase(),
      name: body.name.trim(),
      password: body.password,
      is_admin: body.is_admin,
      is_operator: body.is_operator,
      must_change_password: body.must_change_password,
    }),
  })
  if (!res.ok) throw await parseError(res)
  const payload = parseApiResponse(userEnvelopeSchema, await res.json())
  const u = payload.user
  if (!u) throw new ApiError(500, 'error', 'Ongeldig antwoord.')
  return u
}

export async function patchLocalUser(
  csrf: string,
  id: number,
  body: { password: string; is_admin: boolean; is_operator: boolean; must_change_password: boolean },
): Promise<User | null> {
  const res = await fetch(`/api/admin/users/${id}/local`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await parseError(res)
  const payload = parseApiResponse(userEnvelopeSchema, await res.json())
  return payload.user
}

export type OperatorCardRow = z.infer<typeof operatorCardRowSchema>
export type OperatorMember = z.infer<typeof operatorMemberSchema>
export type AvondetenRegistrationCard = z.infer<typeof avondetenRegistrationCardSchema>

export async function getAvondetenRegistrations(
  mealDate: string,
): Promise<z.infer<typeof avondetenRegistrationsResponseSchema>> {
  const qs = `?meal_date=${encodeURIComponent(mealDate)}`
  const res = await fetch(`/api/operator/avondeten/registrations${qs}`, { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  const payload = parseApiResponse(avondetenRegistrationsResponseSchema, await res.json())
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
  const res = await fetch('/api/operator/avondeten/register', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf,
    },
    body: JSON.stringify({ meal_date: mealDate, card_ids: cardIds }),
  })
  if (!res.ok) throw await parseError(res)
  const payload = parseApiResponse(registeredCountResponseSchema, await res.json())
  return payload.registered_count
}

export async function getOperatorCards(q: string): Promise<OperatorCardRow[]> {
  const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''
  const res = await fetch(`/api/operator/cards${qs}`, { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  const payload = parseApiResponse(operatorCardsResponseSchema, await res.json())
  return payload.cards
}

export async function getOperatorMembers(): Promise<OperatorMember[]> {
  const res = await fetch('/api/operator/members', { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  const payload = parseApiResponse(operatorMembersResponseSchema, await res.json())
  return payload.members
}

export async function createOperatorCardSale(
  csrf: string,
  body: { user_id: number; kind: CardKind; payment_method: PaymentMethod },
): Promise<number> {
  const res = await fetch('/api/operator/card-sales', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await parseError(res)
  const payload = parseApiResponse(operatorCardSaleResponseSchema, await res.json())
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
  const res = await fetch('/api/tosti-orders/queue', { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  const payload = parseApiResponse(tostiQueueResponseSchema, await res.json())
  return payload.orders
}

export async function getMyTostiOrders(): Promise<TostiOrder[]> {
  const res = await fetch('/api/tosti-orders/mine', { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  const payload = parseApiResponse(tostiOrdersResponseSchema, await res.json())
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
  const res = await fetch('/api/tosti-orders', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf,
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw await parseError(res)
  const parsed = parseApiResponse(createTostiOrderResponseSchema, await res.json())
  if (!parsed.order) throw new ApiError(500, 'error', 'Ongeldig antwoord.')
  return parsed.order
}

export async function cancelMyTostiOrder(csrf: string, id: number): Promise<void> {
  const res = await fetch(`/api/tosti-orders/${id}/cancel`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-CSRF-Token': csrf },
  })
  if (!res.ok) throw await parseError(res)
}

export async function getOperatorTostiOrders(): Promise<OperatorTostiOrderRow[]> {
  const res = await fetch('/api/operator/tosti-orders', { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  const payload = parseApiResponse(operatorTostiOrdersResponseSchema, await res.json())
  return payload.orders
}

export type OperatorTostiSoldToday = z.infer<typeof operatorTostiSoldTodaySchema>

export async function getOperatorTostiSoldToday(): Promise<OperatorTostiSoldToday> {
  const res = await fetch('/api/operator/tosti-sold-today', { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  return parseApiResponse(operatorTostiSoldTodaySchema, await res.json())
}

export async function deliverOperatorTostiOrder(csrf: string, id: number): Promise<void> {
  const res = await fetch(`/api/operator/tosti-orders/${id}/deliver`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-CSRF-Token': csrf },
  })
  if (!res.ok) throw await parseError(res)
}

export async function cancelOperatorTostiOrder(csrf: string, id: number): Promise<void> {
  const res = await fetch(`/api/operator/tosti-orders/${id}/cancel`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-CSRF-Token': csrf },
  })
  if (!res.ok) throw await parseError(res)
}

export async function logout(csrf: string): Promise<void> {
  const res = await fetch('/api/logout', {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-CSRF-Token': csrf },
  })
  if (!res.ok) throw await parseError(res)
}

export async function getCards(): Promise<Card[]> {
  const res = await fetch('/api/cards', { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  const payload = parseApiResponse(cardsResponseSchema, await res.json())
  return payload.cards
}

export async function useKnipje(csrf: string, cardId: number): Promise<void> {
  const res = await fetch(`/api/cards/${cardId}/use`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-CSRF-Token': csrf },
  })
  if (!res.ok) throw await parseError(res)
}

export async function getBuyInfo(): Promise<BuyInfo> {
  const res = await fetch('/api/buy', { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  return parseApiResponse(buyInfoResponseSchema, await res.json())
}

export async function requestCard(csrf: string, kind: CardKind = 'tosti'): Promise<void> {
  const res = await fetch('/api/buy/request', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf,
    },
    body: JSON.stringify({ kind }),
  })
  if (!res.ok) throw await parseError(res)
}

export async function cancelMyRequest(csrf: string, id: number): Promise<void> {
  const res = await fetch(`/api/buy/requests/${id}/cancel`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-CSRF-Token': csrf },
  })
  if (!res.ok) throw await parseError(res)
}

export async function cancelAllMyPendingRequests(csrf: string): Promise<number> {
  const res = await fetch('/api/buy/cancel-all-pending', {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-CSRF-Token': csrf },
  })
  if (!res.ok) throw await parseError(res)
  const payload = parseApiResponse(cancelledCountResponseSchema, await res.json())
  return payload.cancelled_count
}

export async function getAdminSalesYears(): Promise<number[]> {
  const res = await fetch('/api/admin/sales-years', { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  const payload = parseApiResponse(yearsResponseSchema, await res.json())
  return payload.years.filter((y) => y > 0)
}

export async function getAdminSalesStats(year: number): Promise<AdminSalesStats> {
  const res = await fetch(`/api/admin/sales-stats?year=${year}`, { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  const payload = parseApiResponse(adminSalesStatsResponseSchema, await res.json())
  return payload.year > 0 ? payload : { ...payload, year }
}

export async function getOperatorSalesYears(): Promise<number[]> {
  const res = await fetch('/api/operator/sales-years', { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  const payload = parseApiResponse(yearsResponseSchema, await res.json())
  return payload.years.filter((y) => y > 0)
}

export async function getOperatorSalesStats(year: number): Promise<AdminSalesStats> {
  const res = await fetch(`/api/operator/sales-stats?year=${year}`, { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  const payload = parseApiResponse(adminSalesStatsResponseSchema, await res.json())
  return payload.year > 0 ? payload : { ...payload, year }
}

export async function getOperatorShopExpenses(year: number): Promise<AdminShopExpense[]> {
  const res = await fetch(`/api/operator/shop-expenses?year=${year}`, { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  const payload = parseApiResponse(shopExpensesResponseSchema, await res.json())
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
  const res = await fetch('/api/operator/shop-expenses', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await parseError(res)
  return parseApiResponse(shopExpenseSchema, await res.json())
}

export async function getAdminDashboard(): Promise<AdminDashboardStats> {
  const res = await fetch('/api/admin/dashboard', { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  return parseApiResponse(adminDashboardResponseSchema, await res.json())
}

export async function getAdminShopExpenses(year: number): Promise<AdminShopExpense[]> {
  const res = await fetch(`/api/admin/shop-expenses?year=${year}`, { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  const payload = parseApiResponse(shopExpensesResponseSchema, await res.json())
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
  const res = await fetch('/api/admin/shop-expenses', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await parseError(res)
  return parseApiResponse(shopExpenseSchema, await res.json())
}

export async function patchShopExpensePurpose(
  csrf: string,
  id: number,
  purpose: ShopExpensePurpose,
  isOperatorOnly: boolean,
): Promise<AdminShopExpense> {
  const prefix = isOperatorOnly ? '/api/operator' : '/api/admin'
  const res = await fetch(`${prefix}/shop-expenses/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf,
    },
    body: JSON.stringify({ purpose }),
  })
  if (!res.ok) throw await parseError(res)
  return parseApiResponse(shopExpenseSchema, await res.json())
}

export async function deleteShopExpense(csrf: string, id: number): Promise<void> {
  const res = await fetch(`/api/admin/shop-expenses/${id}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'X-CSRF-Token': csrf },
  })
  if (!res.ok) throw await parseError(res)
}

export async function importRevolutShopExpenses(
  csrf: string,
  formData: FormData,
  isOperatorOnly: boolean,
): Promise<RevolutShopExpenseImportResult> {
  const prefix = isOperatorOnly ? '/api/operator' : '/api/admin'
  const res = await fetch(`${prefix}/shop-expenses/revolut-import`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-CSRF-Token': csrf },
    body: formData,
  })
  if (!res.ok) throw await parseError(res)
  return parseApiResponse(revolutShopExpenseImportResponseSchema, await res.json())
}

export async function previewRevolutShopExpenses(
  csrf: string,
  formData: FormData,
  isOperatorOnly: boolean,
): Promise<RevolutPreviewResponse> {
  const prefix = isOperatorOnly ? '/api/operator' : '/api/admin'
  const res = await fetch(`${prefix}/shop-expenses/revolut-import/preview`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-CSRF-Token': csrf },
    body: formData,
  })
  if (!res.ok) throw await parseError(res)
  return parseApiResponse(revolutPreviewResponseSchema, await res.json())
}

export async function getRevolutBalance(isOperatorOnly: boolean): Promise<RevolutBalance> {
  const prefix = isOperatorOnly ? '/api/operator' : '/api/admin'
  const res = await fetch(`${prefix}/revolut-balance`, { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  return parseApiResponse(revolutBalanceResponseSchema, await res.json())
}

export async function getShopExpenseReceipts(
  expenseId: number,
  isOperatorOnly: boolean,
): Promise<ShopExpenseReceipt[]> {
  const prefix = isOperatorOnly ? '/api/operator' : '/api/admin'
  const res = await fetch(`${prefix}/shop-expenses/${expenseId}/receipt`, { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  const payload = parseApiResponse(shopExpenseReceiptsListResponseSchema, await res.json())
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
  const res = await fetch(`${prefix}/shop-expenses/${id}/receipt`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-CSRF-Token': csrf },
    body: form,
  })
  if (!res.ok) throw await parseError(res)
  return parseApiResponse(shopExpenseReceiptSchema, await res.json())
}

export async function deleteShopExpenseReceipt(
  csrf: string,
  expenseId: number,
  receiptId: number,
): Promise<void> {
  const res = await fetch(`/api/admin/shop-expenses/${expenseId}/receipts/${receiptId}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'X-CSRF-Token': csrf },
  })
  if (!res.ok) throw await parseError(res)
}

export async function getPendingImportReviews(isOperatorOnly: boolean): Promise<PendingImportReview[]> {
  const prefix = isOperatorOnly ? '/api/operator' : '/api/admin'
  const res = await fetch(`${prefix}/shop-expenses/pending-reviews`, { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  const payload = parseApiResponse(pendingImportReviewsResponseSchema, await res.json())
  return payload.reviews
}

export async function mergePendingReview(csrf: string, id: number, isOperatorOnly: boolean): Promise<void> {
  const prefix = isOperatorOnly ? '/api/operator' : '/api/admin'
  const res = await fetch(`${prefix}/shop-expenses/pending-reviews/${id}/merge`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-CSRF-Token': csrf },
  })
  if (!res.ok) throw await parseError(res)
}

export async function dismissPendingReview(csrf: string, id: number, isOperatorOnly: boolean): Promise<void> {
  const prefix = isOperatorOnly ? '/api/operator' : '/api/admin'
  const res = await fetch(`${prefix}/shop-expenses/pending-reviews/${id}/dismiss`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-CSRF-Token': csrf },
  })
  if (!res.ok) throw await parseError(res)
}

export async function getAdminRequests(): Promise<AdminRequest[]> {
  const res = await fetch('/api/admin/requests', { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  const payload = parseApiResponse(adminRequestsResponseSchema, await res.json())
  return payload.requests
}

export async function fulfillRequest(csrf: string, id: number): Promise<void> {
  const res = await fetch(`/api/admin/requests/${id}/fulfill`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-CSRF-Token': csrf },
  })
  if (!res.ok) throw await parseError(res)
}

export async function rejectAdminRequest(csrf: string, id: number): Promise<void> {
  const res = await fetch(`/api/admin/requests/${id}/reject`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-CSRF-Token': csrf },
  })
  if (!res.ok) throw await parseError(res)
}

export type AdminAppSettings = z.infer<typeof adminSettingsResponseSchema>

export async function getAdminSettings(): Promise<AdminAppSettings> {
  const res = await fetch('/api/admin/settings', { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  return parseApiResponse(adminSettingsResponseSchema, await res.json())
}

export async function patchAdminSettings(
  csrf: string,
  body: { tikkie_url: string; tikkie_url_avondeten: string },
): Promise<AdminAppSettings> {
  const res = await fetch('/api/admin/settings', {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf,
    },
    body: JSON.stringify({
      tikkie_url: body.tikkie_url,
      tikkie_url_avondeten: body.tikkie_url_avondeten,
    }),
  })
  if (!res.ok) throw await parseError(res)
  return parseApiResponse(adminSettingsResponseSchema, await res.json())
}

export async function getAdminBankCreditsUnmatched(year: number): Promise<BankCreditsListPayload> {
  const res = await fetch(`/api/admin/bank-credits/unmatched?year=${year}`, { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  return parseApiResponse(bankCreditsListResponseSchema, await res.json())
}

export async function getOperatorBankCreditsUnmatched(year: number): Promise<BankCreditsListPayload> {
  const res = await fetch(`/api/operator/bank-credits/unmatched?year=${year}`, { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  return parseApiResponse(bankCreditsListResponseSchema, await res.json())
}

export async function getAdminBankCreditsMatched(year: number): Promise<BankCreditsListPayload> {
  const res = await fetch(`/api/admin/bank-credits/matched?year=${year}`, { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  return parseApiResponse(bankCreditsListResponseSchema, await res.json())
}

export async function getOperatorBankCreditsMatched(year: number): Promise<BankCreditsListPayload> {
  const res = await fetch(`/api/operator/bank-credits/matched?year=${year}`, { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  return parseApiResponse(bankCreditsListResponseSchema, await res.json())
}

export async function getAdminBankCreditsWaived(year: number): Promise<BankCreditsListPayload> {
  const res = await fetch(`/api/admin/bank-credits/waived?year=${year}`, { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  return parseApiResponse(bankCreditsListResponseSchema, await res.json())
}

export async function getOperatorBankCreditsWaived(year: number): Promise<BankCreditsListPayload> {
  const res = await fetch(`/api/operator/bank-credits/waived?year=${year}`, { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  return parseApiResponse(bankCreditsListResponseSchema, await res.json())
}

export async function getAdminBankCreditSuggestions(bankCreditId: number): Promise<BankCreditSuggestionsPayload> {
  const res = await fetch(`/api/admin/bank-credits/${bankCreditId}/suggestions`, { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  return parseApiResponse(bankCreditSuggestionsResponseSchema, await res.json())
}

export async function getOperatorBankCreditSuggestions(bankCreditId: number): Promise<BankCreditSuggestionsPayload> {
  const res = await fetch(`/api/operator/bank-credits/${bankCreditId}/suggestions`, { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  return parseApiResponse(bankCreditSuggestionsResponseSchema, await res.json())
}

export async function getAdminBankCreditMatchCandidates(bankCreditId: number): Promise<BankCreditMatchCandidatesPayload> {
  const res = await fetch(`/api/admin/bank-credits/${bankCreditId}/match-candidates`, { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  return parseApiResponse(bankCreditMatchCandidatesResponseSchema, await res.json())
}

export async function getOperatorBankCreditMatchCandidates(bankCreditId: number): Promise<BankCreditMatchCandidatesPayload> {
  const res = await fetch(`/api/operator/bank-credits/${bankCreditId}/match-candidates`, { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  return parseApiResponse(bankCreditMatchCandidatesResponseSchema, await res.json())
}

export async function postAdminBankCreditMatch(
  csrf: string,
  bankCreditId: number,
  cardRequestId: number,
): Promise<void> {
  const res = await fetch(`/api/admin/bank-credits/${bankCreditId}/match`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf,
    },
    body: JSON.stringify({ card_request_id: cardRequestId }),
  })
  if (!res.ok) throw await parseError(res)
  parseApiResponse(okResponseSchema, await res.json())
}

export async function postOperatorBankCreditMatch(
  csrf: string,
  bankCreditId: number,
  cardRequestId: number,
): Promise<void> {
  const res = await fetch(`/api/operator/bank-credits/${bankCreditId}/match`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf,
    },
    body: JSON.stringify({ card_request_id: cardRequestId }),
  })
  if (!res.ok) throw await parseError(res)
  parseApiResponse(okResponseSchema, await res.json())
}

export async function postAdminBankCreditUnmatch(csrf: string, bankCreditId: number): Promise<void> {
  const res = await fetch(`/api/admin/bank-credits/${bankCreditId}/unmatch`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf,
    },
    body: '{}',
  })
  if (!res.ok) throw await parseError(res)
  parseApiResponse(okResponseSchema, await res.json())
}

export async function postOperatorBankCreditUnmatch(csrf: string, bankCreditId: number): Promise<void> {
  const res = await fetch(`/api/operator/bank-credits/${bankCreditId}/unmatch`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf,
    },
    body: '{}',
  })
  if (!res.ok) throw await parseError(res)
  parseApiResponse(okResponseSchema, await res.json())
}

export async function postAdminBankCreditWaive(csrf: string, bankCreditId: number): Promise<void> {
  const res = await fetch(`/api/admin/bank-credits/${bankCreditId}/waive`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf,
    },
    body: '{}',
  })
  if (!res.ok) throw await parseError(res)
  parseApiResponse(okResponseSchema, await res.json())
}

export async function postOperatorBankCreditWaive(csrf: string, bankCreditId: number): Promise<void> {
  const res = await fetch(`/api/operator/bank-credits/${bankCreditId}/waive`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf,
    },
    body: '{}',
  })
  if (!res.ok) throw await parseError(res)
  parseApiResponse(okResponseSchema, await res.json())
}

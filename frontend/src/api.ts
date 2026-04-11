import type { ZodType } from 'zod'
import {
  adminDashboardResponseSchema,
  adminRequestsResponseSchema,
  adminSalesStatsResponseSchema,
  adminSettingsResponseSchema,
  adminUsersResponseSchema,
  avondetenRegistrationsResponseSchema,
  buyInfoResponseSchema,
  cancelledCountResponseSchema,
  cardsResponseSchema,
  createTostiOrderResponseSchema,
  meResponseSchema,
  operatorCardsResponseSchema,
  operatorMembersResponseSchema,
  operatorCardSaleResponseSchema,
  operatorTostiOrdersResponseSchema,
  operatorTostiSoldTodaySchema,
  registeredCountResponseSchema,
  shopExpenseSchema,
  shopExpenseReceiptSchema,
  shopExpensesResponseSchema,
  tostiOrdersResponseSchema,
  tostiQueueResponseSchema,
  userEnvelopeSchema,
  yearsResponseSchema,
} from './api.schemas'

export type CardKind = 'tosti' | 'avondeten'
export type PaymentMethod = 'tikkie' | 'contant'

export type User = {
  id: number
  email: string
  name: string
  is_admin: boolean
  is_operator: boolean
  is_matroos_jeugd: boolean
  must_change_password: boolean
  auth_kind: 'google' | 'local'
  local_username?: string
}

export type MeResponse = {
  user: User | null
  pending_card_requests: number
  tikkie_warnings: TikkieWarning[]
  csrf_token: string
  payment_amount_eur: string
  payment_amount_avondeten_eur: string
}

export type TikkieWarning = {
  kind: CardKind
  expires_at: string
  days_remaining: number
  message: string
}

export type Card = {
  id: number
  kind: CardKind
  source: 'online' | 'physical'
  knipjes_remaining: number
  created_at: string
}

export type MyPendingRequest = {
  id: number
  kind: CardKind
  created_at: string
  knipjes_remaining: number
}

export type BuyInfo = {
  payment_amount_eur: string
  payment_amount_avondeten_eur: string
  tikkie_url: string
  tikkie_url_avondeten: string
  bank_transfer_instructions: string
  my_pending_requests: MyPendingRequest[]
}

export type AdminRequest = {
  id: number
  kind: CardKind
  payment_method: PaymentMethod
  user_name: string
  user_email: string
  created_at: string
  knipjes_remaining: number
}

export type AdminDashboardStats = {
  active_cards_total: number
  knipjes_remaining_total: number
  pending_requests: number
  pending_with_card: number
  pending_knipjes_remaining: number
  pending_knipjes_consumed_estimate: number
  fulfilled_requests: number
  fulfilled_knipjes_remaining: number
  cancelled_requests: number
  payment_amount_eur: string
  finance_year: number
  year_revenue_eur: number
  year_expenses_eur: number
  year_net_eur: number
}

export type AdminSalesMonthBucket = {
  month: number
  fulfilled_count: number
  revenue_eur: number
  expenses_eur: number
  net_eur: number
  label_nl: string
}

export type AdminCardsSoldBreakdown = {
  tosti: number
  avondeten: number
  total: number
}

export type AdminRevenueBreakdown = {
  tosti: number
  avondeten: number
  total: number
}

export type AdminExpensesBreakdown = {
  lunchkraam: number
  avondeten: number
  total: number
}

export type AdminSalesBreakdownBucket = {
  month: number
  cards_sold: AdminCardsSoldBreakdown
  revenue_eur: AdminRevenueBreakdown
  expenses_eur: AdminExpensesBreakdown
  net_eur: number
  label_nl: string
}

export type AdminSalesYearBreakdown = {
  cards_sold: AdminCardsSoldBreakdown
  revenue_eur: AdminRevenueBreakdown
  expenses_eur: AdminExpensesBreakdown
  net_eur: number
}

export type AdminTostiMonthBucket = {
  month: number
  quantity: number
  label_nl: string
}

export type AdminTostiKindBucket = {
  bread: string
  filling: string
  quantity: number
}

export type AdminSalesStats = {
  year: number
  timezone: string
  payment_amount_eur: string
  monthly: AdminSalesMonthBucket[]
  monthly_breakdown: AdminSalesBreakdownBucket[]
  year_fulfilled_count: number
  year_revenue_eur: number
  year_expenses_eur: number
  year_net_eur: number
  year_breakdown: AdminSalesYearBreakdown
  year_tosti_quantity: number
  tosti_monthly: AdminTostiMonthBucket[]
  tosti_by_kind: AdminTostiKindBucket[]
}

export type ShopExpensePurpose = 'lunchkraam' | 'avondeten'

export type AdminShopExpense = {
  id: number
  amount_eur: number
  spent_on: string
  description: string
  purpose: ShopExpensePurpose
  created_at: string
}

export type ShopExpenseReceipt = {
  id: number
  shop_expense_id: number
  content_type: string
  size_bytes: number
  sha256: string
  created_at: string
  image_url: string
}

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

export type AdminUserRow = {
  id: number
  name: string
  email: string
  auth_kind: 'google' | 'local'
  local_username?: string
  is_admin: boolean
  is_operator: boolean
  is_matroos_jeugd: boolean
  must_change_password: boolean
  created_at: string
}

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

export type OperatorCardRow = {
  id: number
  kind: CardKind
  source: 'online' | 'physical'
  knipjes_remaining: number
  created_at: string
  owner_name: string
  owner_email: string
  owner_user_id: number
}

export type OperatorMember = {
  id: number
  name: string
  email: string
}

export type AvondetenRegistrationCard = {
  card_id: number
  user_id: number
  owner_name: string
  owner_email: string
  knipjes_remaining: number
  registered_for_date: boolean
}

export async function getAvondetenRegistrations(
  mealDate: string,
): Promise<{ meal_date: string; cards: AvondetenRegistrationCard[] }> {
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

export type TostiBread = 'wit' | 'bruin'
export type TostiFilling = 'ham' | 'kaas' | 'ham_kaas'
export type TostiOrderStatus = 'pending' | 'delivered' | 'cancelled'

export type TostiOrder = {
  id: number
  user_id: number
  card_id: number | null
  quantity: number
  is_physical_card: boolean
  bread: TostiBread
  filling: TostiFilling
  status: TostiOrderStatus
  created_at: string
  delivered_at?: string
  delivered_by_user_id?: number
  cancelled_at?: string
  cancelled_by_user_id?: number
  remark?: string
}

export type OperatorTostiOrderRow = TostiOrder & {
  customer_name: string
  customer_email: string
}

/** Pending order in global FIFO queue (member view; no e-mail). */
export type TostiQueueEntry = {
  place: number
  id: number
  card_id: number | null
  is_physical_card: boolean
  quantity: number
  bread: TostiBread
  filling: TostiFilling
  created_at: string
  customer_name: string
  is_mine: boolean
}

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

export type OperatorTostiSoldToday = {
  quantity: number
  amsterdam_date: string
  timezone: string
}

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
  body: { amount_eur: number; spent_on: string; description: string; purpose: ShopExpensePurpose },
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
  body: { amount_eur: number; spent_on: string; description: string; purpose: ShopExpensePurpose },
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

export async function deleteShopExpense(csrf: string, id: number): Promise<void> {
  const res = await fetch(`/api/admin/shop-expenses/${id}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'X-CSRF-Token': csrf },
  })
  if (!res.ok) throw await parseError(res)
}

export async function getShopExpenseReceipt(id: number, isOperatorOnly: boolean): Promise<ShopExpenseReceipt> {
  const prefix = isOperatorOnly ? '/api/operator' : '/api/admin'
  const res = await fetch(`${prefix}/shop-expenses/${id}/receipt`, { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  return parseApiResponse(shopExpenseReceiptSchema, await res.json())
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

export async function deleteShopExpenseReceipt(csrf: string, id: number): Promise<void> {
  const res = await fetch(`/api/admin/shop-expenses/${id}/receipt`, {
    method: 'DELETE',
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

export type AdminAppSettings = {
  tikkie_url: string
  tikkie_url_effective: string
  tikkie_url_env_config: string
  tikkie_url_avondeten: string
  tikkie_url_avondeten_effective: string
  tikkie_url_avondeten_env_config: string
}

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

import type { ZodType } from 'zod'
import { buyInfoResponseSchema, cardsResponseSchema, meResponseSchema } from './api.schemas'

export type CardKind = 'tosti' | 'avondeten'

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
  csrf_token: string
  payment_amount_eur: string
  payment_amount_avondeten_eur: string
}

export type Card = {
  id: number
  kind: CardKind
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
  year_fulfilled_count: number
  year_revenue_eur: number
  year_expenses_eur: number
  year_net_eur: number
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

function parseShopExpensePurpose(v: unknown): ShopExpensePurpose {
  if (v === 'avondeten') return 'avondeten'
  return 'lunchkraam'
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

function jsonInt(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return Math.trunc(v)
  }
  return fallback
}

function jsonFloat(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return v
  }
  return fallback
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

function normalizeUser(raw: unknown): User | null {
  if (raw === null || typeof raw !== 'object') return null
  const u = raw as Record<string, unknown>
  return {
    id: jsonInt(u.id, 0),
    email: typeof u.email === 'string' ? u.email : '',
    name: typeof u.name === 'string' ? u.name : '',
    is_admin: Boolean(u.is_admin),
    is_operator: Boolean(u.is_operator),
    is_matroos_jeugd: Boolean(u.is_matroos_jeugd),
    must_change_password: Boolean(u.must_change_password),
    auth_kind: u.auth_kind === 'local' ? 'local' : 'google',
    local_username: typeof u.local_username === 'string' ? u.local_username : undefined,
  }
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
  const j = (await res.json()) as { users?: unknown }
  const raw = j.users
  if (!Array.isArray(raw)) return []
  return raw.map((row) => {
    const r = row as Record<string, unknown>
    return {
      id: jsonInt(r.id, 0),
      name: typeof r.name === 'string' ? r.name : '',
      email: typeof r.email === 'string' ? r.email : '',
      auth_kind: r.auth_kind === 'local' ? 'local' : 'google',
      local_username: typeof r.local_username === 'string' ? r.local_username : undefined,
      is_admin: Boolean(r.is_admin),
      is_operator: Boolean(r.is_operator),
      is_matroos_jeugd: Boolean(r.is_matroos_jeugd),
      must_change_password: Boolean(r.must_change_password),
      created_at: typeof r.created_at === 'string' ? r.created_at : '',
    }
  })
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
  const j = (await res.json()) as { user?: unknown }
  const u = normalizeUser(j.user)
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
  const j = (await res.json()) as { user?: unknown }
  return normalizeUser(j.user)
}

export type OperatorCardRow = {
  id: number
  kind: CardKind
  knipjes_remaining: number
  created_at: string
  owner_name: string
  owner_email: string
  owner_user_id: number
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
  const j = (await res.json()) as Record<string, unknown>
  const raw = j.cards
  const cards: AvondetenRegistrationCard[] = Array.isArray(raw)
    ? raw.map((row) => {
        const r = row as Record<string, unknown>
        return {
          card_id: jsonInt(r.card_id, 0),
          user_id: jsonInt(r.user_id, 0),
          owner_name: typeof r.owner_name === 'string' ? r.owner_name : '',
          owner_email: typeof r.owner_email === 'string' ? r.owner_email : '',
          knipjes_remaining: jsonInt(r.knipjes_remaining, 0),
          registered_for_date: Boolean(r.registered_for_date),
        }
      })
    : []
  return {
    meal_date: typeof j.meal_date === 'string' ? j.meal_date : mealDate,
    cards,
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
  const j = (await res.json()) as { registered_count?: number }
  return jsonInt(j.registered_count, 0)
}

export async function getOperatorCards(q: string): Promise<OperatorCardRow[]> {
  const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''
  const res = await fetch(`/api/operator/cards${qs}`, { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  const j = (await res.json()) as { cards?: unknown }
  const raw = j.cards
  if (!Array.isArray(raw)) return []
  return raw.map((row) => {
    const r = row as Record<string, unknown>
    const kindRaw = r.kind
    const kind: CardKind = kindRaw === 'avondeten' ? 'avondeten' : 'tosti'
    return {
      id: jsonInt(r.id, 0),
      kind,
      knipjes_remaining: jsonInt(r.knipjes_remaining, 0),
      created_at: typeof r.created_at === 'string' ? r.created_at : '',
      owner_name: typeof r.owner_name === 'string' ? r.owner_name : '',
      owner_email: typeof r.owner_email === 'string' ? r.owner_email : '',
      owner_user_id: jsonInt(r.owner_user_id, 0),
    }
  })
}

export type TostiBread = 'wit' | 'bruin'
export type TostiFilling = 'ham' | 'kaas' | 'ham_kaas'
export type TostiOrderStatus = 'pending' | 'delivered' | 'cancelled'

export type TostiOrder = {
  id: number
  user_id: number
  card_id: number | null
  quantity: number
  bread: TostiBread
  filling: TostiFilling
  status: TostiOrderStatus
  created_at: string
  delivered_at?: string
  delivered_by_user_id?: number
  cancelled_at?: string
  cancelled_by_user_id?: number
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
  quantity: number
  bread: TostiBread
  filling: TostiFilling
  created_at: string
  customer_name: string
  is_mine: boolean
}

function parseOptionalCardId(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number' && Number.isFinite(v)) return v
  return null
}

function parseTostiOrder(r: Record<string, unknown>): TostiOrder {
  const bread = r.bread === 'bruin' ? 'bruin' : 'wit'
  const fillingRaw = r.filling
  const filling: TostiFilling =
    fillingRaw === 'kaas' ? 'kaas' : fillingRaw === 'ham_kaas' ? 'ham_kaas' : 'ham'
  const statusRaw = r.status
  const status: TostiOrderStatus =
    statusRaw === 'delivered' ? 'delivered' : statusRaw === 'cancelled' ? 'cancelled' : 'pending'
  const q = jsonInt(r.quantity, 1)
  return {
    id: jsonInt(r.id, 0),
    user_id: jsonInt(r.user_id, 0),
    card_id: parseOptionalCardId(r.card_id),
    quantity: q >= 1 && q <= 10 ? q : 1,
    bread,
    filling,
    status,
    created_at: typeof r.created_at === 'string' ? r.created_at : '',
    delivered_at: typeof r.delivered_at === 'string' ? r.delivered_at : undefined,
    delivered_by_user_id:
      typeof r.delivered_by_user_id === 'number' ? jsonInt(r.delivered_by_user_id) : undefined,
    cancelled_at: typeof r.cancelled_at === 'string' ? r.cancelled_at : undefined,
    cancelled_by_user_id:
      typeof r.cancelled_by_user_id === 'number' ? jsonInt(r.cancelled_by_user_id) : undefined,
  }
}

function parseTostiQueueEntry(r: Record<string, unknown>): TostiQueueEntry {
  const bread = r.bread === 'bruin' ? 'bruin' : 'wit'
  const fillingRaw = r.filling
  const filling: TostiFilling =
    fillingRaw === 'kaas' ? 'kaas' : fillingRaw === 'ham_kaas' ? 'ham_kaas' : 'ham'
  const q = jsonInt(r.quantity, 1)
  return {
    place: jsonInt(r.place, 0),
    id: jsonInt(r.id, 0),
    card_id: parseOptionalCardId(r.card_id),
    quantity: q >= 1 && q <= 10 ? q : 1,
    bread,
    filling,
    created_at: typeof r.created_at === 'string' ? r.created_at : '',
    customer_name: typeof r.customer_name === 'string' ? r.customer_name : '',
    is_mine: Boolean(r.is_mine),
  }
}

export async function getTostiQueue(): Promise<TostiQueueEntry[]> {
  const res = await fetch('/api/tosti-orders/queue', { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  const j = (await res.json()) as { orders?: unknown }
  const raw = j.orders
  if (!Array.isArray(raw)) return []
  return raw.map((row) => parseTostiQueueEntry(row as Record<string, unknown>))
}

export async function getMyTostiOrders(): Promise<TostiOrder[]> {
  const res = await fetch('/api/tosti-orders/mine', { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  const j = (await res.json()) as { orders?: unknown }
  const raw = j.orders
  if (!Array.isArray(raw)) return []
  return raw.map((row) => parseTostiOrder(row as Record<string, unknown>))
}

export type CreateTostiOrderBody =
  | {
      physical_card: true
      bread: TostiBread
      filling: TostiFilling
      quantity: number
    }
  | {
      physical_card?: false
      card_id: number
      bread: TostiBread
      filling: TostiFilling
      quantity: number
    }

export async function createTostiOrder(csrf: string, body: CreateTostiOrderBody): Promise<TostiOrder> {
  const payload =
    body.physical_card === true
      ? {
          physical_card: true,
          bread: body.bread,
          filling: body.filling,
          quantity: body.quantity,
        }
      : {
          card_id: body.card_id,
          bread: body.bread,
          filling: body.filling,
          quantity: body.quantity,
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
  const j = (await res.json()) as { order?: unknown }
  const o = j.order
  if (!o || typeof o !== 'object') throw new ApiError(500, 'error', 'Ongeldig antwoord.')
  return parseTostiOrder(o as Record<string, unknown>)
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
  const j = (await res.json()) as { orders?: unknown }
  const raw = j.orders
  if (!Array.isArray(raw)) return []
  return raw.map((row) => {
    const r = row as Record<string, unknown>
    const base = parseTostiOrder(r)
    return {
      ...base,
      customer_name: typeof r.customer_name === 'string' ? r.customer_name : '',
      customer_email: typeof r.customer_email === 'string' ? r.customer_email : '',
    }
  })
}

export type OperatorTostiSoldToday = {
  quantity: number
  amsterdam_date: string
  timezone: string
}

export async function getOperatorTostiSoldToday(): Promise<OperatorTostiSoldToday> {
  const res = await fetch('/api/operator/tosti-sold-today', { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  const j = (await res.json()) as Record<string, unknown>
  return {
    quantity: jsonInt(j.quantity, 0),
    amsterdam_date: typeof j.amsterdam_date === 'string' ? j.amsterdam_date : '',
    timezone: typeof j.timezone === 'string' ? j.timezone : 'Europe/Amsterdam',
  }
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

function parseCardKind(v: unknown): CardKind {
  return v === 'avondeten' ? 'avondeten' : 'tosti'
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
  const j = (await res.json()) as { cancelled_count?: number }
  return j.cancelled_count ?? 0
}

export async function getAdminSalesYears(): Promise<number[]> {
  const res = await fetch('/api/admin/sales-years', { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  const j = (await res.json()) as { years?: unknown }
  const raw = j.years
  if (!Array.isArray(raw)) return []
  return raw.map((y) => jsonInt(y, 0)).filter((y) => y > 0)
}

function parseAdminSalesStats(j: Record<string, unknown>, fallbackYear: number): AdminSalesStats {
  const rawMonthly = (j.monthly ?? []) as Record<string, unknown>[]
  const monthly: AdminSalesMonthBucket[] = rawMonthly.map((row) => ({
    month: jsonInt(row.month, 0),
    fulfilled_count: jsonInt(row.fulfilled_count, 0),
    revenue_eur: jsonFloat(row.revenue_eur, 0),
    expenses_eur: jsonFloat(row.expenses_eur, 0),
    net_eur: jsonFloat(row.net_eur, 0),
    label_nl: typeof row.label_nl === 'string' ? row.label_nl : '',
  }))
  const rawTostiMonthly = (j.tosti_monthly ?? []) as Record<string, unknown>[]
  const tosti_monthly: AdminTostiMonthBucket[] = rawTostiMonthly.map((row) => ({
    month: jsonInt(row.month, 0),
    quantity: jsonInt(row.quantity, 0),
    label_nl: typeof row.label_nl === 'string' ? row.label_nl : '',
  }))
  const rawKind = (j.tosti_by_kind ?? []) as Record<string, unknown>[]
  const tosti_by_kind: AdminTostiKindBucket[] = rawKind.map((row) => ({
    bread: typeof row.bread === 'string' ? row.bread : '',
    filling: typeof row.filling === 'string' ? row.filling : '',
    quantity: jsonInt(row.quantity, 0),
  }))
  return {
    year: jsonInt(j.year, fallbackYear),
    timezone: typeof j.timezone === 'string' ? j.timezone : 'Europe/Amsterdam',
    payment_amount_eur: typeof j.payment_amount_eur === 'string' ? j.payment_amount_eur : '',
    monthly,
    year_fulfilled_count: jsonInt(j.year_fulfilled_count, 0),
    year_revenue_eur: jsonFloat(j.year_revenue_eur, 0),
    year_expenses_eur: jsonFloat(j.year_expenses_eur, 0),
    year_net_eur: jsonFloat(j.year_net_eur, 0),
    year_tosti_quantity: jsonInt(j.year_tosti_quantity, 0),
    tosti_monthly,
    tosti_by_kind,
  }
}

export async function getAdminSalesStats(year: number): Promise<AdminSalesStats> {
  const res = await fetch(`/api/admin/sales-stats?year=${year}`, { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  const j = (await res.json()) as Record<string, unknown>
  return parseAdminSalesStats(j, year)
}

export async function getOperatorSalesYears(): Promise<number[]> {
  const res = await fetch('/api/operator/sales-years', { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  const j = (await res.json()) as { years?: unknown }
  const raw = j.years
  if (!Array.isArray(raw)) return []
  return raw.map((y) => jsonInt(y, 0)).filter((y) => y > 0)
}

export async function getOperatorSalesStats(year: number): Promise<AdminSalesStats> {
  const res = await fetch(`/api/operator/sales-stats?year=${year}`, { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  const j = (await res.json()) as Record<string, unknown>
  return parseAdminSalesStats(j, year)
}

export async function getOperatorShopExpenses(year: number): Promise<AdminShopExpense[]> {
  const res = await fetch(`/api/operator/shop-expenses?year=${year}`, { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  const j = (await res.json()) as { expenses?: unknown }
  const raw = j.expenses
  if (!Array.isArray(raw)) return []
  return raw.map((row) => {
    const r = row as Record<string, unknown>
    return {
      id: jsonInt(r.id, 0),
      amount_eur: jsonFloat(r.amount_eur, 0),
      spent_on: typeof r.spent_on === 'string' ? r.spent_on : '',
      description: typeof r.description === 'string' ? r.description : '',
      purpose: parseShopExpensePurpose(r.purpose),
      created_at: typeof r.created_at === 'string' ? r.created_at : '',
    }
  })
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
  const r = (await res.json()) as Record<string, unknown>
  return {
    id: jsonInt(r.id, 0),
    amount_eur: jsonFloat(r.amount_eur, 0),
    spent_on: typeof r.spent_on === 'string' ? r.spent_on : '',
    description: typeof r.description === 'string' ? r.description : '',
    purpose: parseShopExpensePurpose(r.purpose),
    created_at: typeof r.created_at === 'string' ? r.created_at : '',
  }
}

export async function getAdminDashboard(): Promise<AdminDashboardStats> {
  const res = await fetch('/api/admin/dashboard', { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  const j = (await res.json()) as Record<string, unknown>
  return {
    active_cards_total: jsonInt(j.active_cards_total),
    knipjes_remaining_total: jsonInt(j.knipjes_remaining_total),
    pending_requests: jsonInt(j.pending_requests),
    pending_with_card: jsonInt(j.pending_with_card),
    pending_knipjes_remaining: jsonInt(j.pending_knipjes_remaining),
    pending_knipjes_consumed_estimate: jsonInt(j.pending_knipjes_consumed_estimate),
    fulfilled_requests: jsonInt(j.fulfilled_requests),
    fulfilled_knipjes_remaining: jsonInt(j.fulfilled_knipjes_remaining),
    cancelled_requests: jsonInt(j.cancelled_requests),
    payment_amount_eur: typeof j.payment_amount_eur === 'string' ? j.payment_amount_eur : '',
    finance_year: jsonInt(j.finance_year, new Date().getFullYear()),
    year_revenue_eur: jsonFloat(j.year_revenue_eur, 0),
    year_expenses_eur: jsonFloat(j.year_expenses_eur, 0),
    year_net_eur: jsonFloat(j.year_net_eur, 0),
  }
}

export async function getAdminShopExpenses(year: number): Promise<AdminShopExpense[]> {
  const res = await fetch(`/api/admin/shop-expenses?year=${year}`, { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  const j = (await res.json()) as { expenses?: unknown }
  const raw = j.expenses
  if (!Array.isArray(raw)) return []
  return raw.map((row) => {
    const r = row as Record<string, unknown>
    return {
      id: jsonInt(r.id, 0),
      amount_eur: jsonFloat(r.amount_eur, 0),
      spent_on: typeof r.spent_on === 'string' ? r.spent_on : '',
      description: typeof r.description === 'string' ? r.description : '',
      purpose: parseShopExpensePurpose(r.purpose),
      created_at: typeof r.created_at === 'string' ? r.created_at : '',
    }
  })
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
  const r = (await res.json()) as Record<string, unknown>
  return {
    id: jsonInt(r.id, 0),
    amount_eur: jsonFloat(r.amount_eur, 0),
    spent_on: typeof r.spent_on === 'string' ? r.spent_on : '',
    description: typeof r.description === 'string' ? r.description : '',
    purpose: parseShopExpensePurpose(r.purpose),
    created_at: typeof r.created_at === 'string' ? r.created_at : '',
  }
}

export async function deleteShopExpense(csrf: string, id: number): Promise<void> {
  const res = await fetch(`/api/admin/shop-expenses/${id}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'X-CSRF-Token': csrf },
  })
  if (!res.ok) throw await parseError(res)
}

export async function getAdminRequests(): Promise<AdminRequest[]> {
  const res = await fetch('/api/admin/requests', { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  const j = (await res.json()) as { requests?: unknown }
  const raw = j.requests
  if (!Array.isArray(raw)) return []
  return raw.map((row) => {
    const r = row as Record<string, unknown>
    return {
      id: jsonInt(r.id, 0),
      kind: parseCardKind(r.kind),
      user_name: typeof r.user_name === 'string' ? r.user_name : '',
      user_email: typeof r.user_email === 'string' ? r.user_email : '',
      created_at: typeof r.created_at === 'string' ? r.created_at : '',
      knipjes_remaining: jsonInt(r.knipjes_remaining, 10),
    }
  })
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
  const j = (await res.json()) as Record<string, unknown>
  return {
    tikkie_url: typeof j.tikkie_url === 'string' ? j.tikkie_url : '',
    tikkie_url_effective: typeof j.tikkie_url_effective === 'string' ? j.tikkie_url_effective : '',
    tikkie_url_env_config: typeof j.tikkie_url_env_config === 'string' ? j.tikkie_url_env_config : '',
    tikkie_url_avondeten: typeof j.tikkie_url_avondeten === 'string' ? j.tikkie_url_avondeten : '',
    tikkie_url_avondeten_effective:
      typeof j.tikkie_url_avondeten_effective === 'string' ? j.tikkie_url_avondeten_effective : '',
    tikkie_url_avondeten_env_config:
      typeof j.tikkie_url_avondeten_env_config === 'string' ? j.tikkie_url_avondeten_env_config : '',
  }
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
  const j = (await res.json()) as Record<string, unknown>
  return {
    tikkie_url: typeof j.tikkie_url === 'string' ? j.tikkie_url : '',
    tikkie_url_effective: typeof j.tikkie_url_effective === 'string' ? j.tikkie_url_effective : '',
    tikkie_url_env_config: typeof j.tikkie_url_env_config === 'string' ? j.tikkie_url_env_config : '',
    tikkie_url_avondeten: typeof j.tikkie_url_avondeten === 'string' ? j.tikkie_url_avondeten : '',
    tikkie_url_avondeten_effective:
      typeof j.tikkie_url_avondeten_effective === 'string' ? j.tikkie_url_avondeten_effective : '',
    tikkie_url_avondeten_env_config:
      typeof j.tikkie_url_avondeten_env_config === 'string' ? j.tikkie_url_avondeten_env_config : '',
  }
}

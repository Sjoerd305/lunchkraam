export type User = {
  id: number
  email: string
  name: string
  is_admin: boolean
}

export type MeResponse = {
  user: User | null
  pending_card_requests: number
  csrf_token: string
  payment_amount_eur: string
}

export type Card = {
  id: number
  knipjes_remaining: number
  created_at: string
}

export type MyPendingRequest = {
  id: number
  created_at: string
  knipjes_remaining: number
}

export type BuyInfo = {
  payment_amount_eur: string
  tikkie_url: string
  bank_transfer_instructions: string
  my_pending_requests: MyPendingRequest[]
}

export type AdminRequest = {
  id: number
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
}

export type AdminSalesMonthBucket = {
  month: number
  fulfilled_count: number
  revenue_eur: number
  label_nl: string
}

export type AdminSalesStats = {
  year: number
  timezone: string
  payment_amount_eur: string
  monthly: AdminSalesMonthBucket[]
  year_fulfilled_count: number
  year_revenue_eur: number
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

export async function getMe(): Promise<MeResponse> {
  const res = await fetch('/api/me', { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  return res.json() as Promise<MeResponse>
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
  const j = (await res.json()) as { cards: Card[] }
  return j.cards ?? []
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
  const j = (await res.json()) as Partial<BuyInfo>
  const raw = (j.my_pending_requests ?? []) as Partial<MyPendingRequest>[]
  const my_pending_requests = raw.map((r) => ({
    id: r.id as number,
    created_at: r.created_at as string,
    knipjes_remaining: r.knipjes_remaining ?? 10,
  }))
  return {
    payment_amount_eur: j.payment_amount_eur ?? '',
    tikkie_url: j.tikkie_url ?? '',
    bank_transfer_instructions: j.bank_transfer_instructions ?? '',
    my_pending_requests,
  }
}

export async function requestCard(csrf: string): Promise<void> {
  const res = await fetch('/api/buy/request', {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-CSRF-Token': csrf },
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

export async function getAdminSalesStats(year: number): Promise<AdminSalesStats> {
  const res = await fetch(`/api/admin/sales-stats?year=${year}`, { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  const j = (await res.json()) as Record<string, unknown>
  const rawMonthly = (j.monthly ?? []) as Record<string, unknown>[]
  const monthly: AdminSalesMonthBucket[] = rawMonthly.map((row) => ({
    month: jsonInt(row.month, 0),
    fulfilled_count: jsonInt(row.fulfilled_count, 0),
    revenue_eur: jsonFloat(row.revenue_eur, 0),
    label_nl: typeof row.label_nl === 'string' ? row.label_nl : '',
  }))
  return {
    year: jsonInt(j.year, year),
    timezone: typeof j.timezone === 'string' ? j.timezone : 'Europe/Amsterdam',
    payment_amount_eur: typeof j.payment_amount_eur === 'string' ? j.payment_amount_eur : '',
    monthly,
    year_fulfilled_count: jsonInt(j.year_fulfilled_count, 0),
    year_revenue_eur: jsonFloat(j.year_revenue_eur, 0),
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
  }
}

export async function getAdminRequests(): Promise<AdminRequest[]> {
  const res = await fetch('/api/admin/requests', { credentials: 'include' })
  if (!res.ok) throw await parseError(res)
  const j = (await res.json()) as { requests: AdminRequest[] }
  return j.requests.map((r) => ({
    ...r,
    knipjes_remaining: r.knipjes_remaining ?? 10,
  }))
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

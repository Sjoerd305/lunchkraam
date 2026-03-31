import { z } from 'zod'

const stringWithDefault = (fallback: string) =>
  z.preprocess((value) => (typeof value === 'string' ? value : undefined), z.string().default(fallback))

const intWithDefault = (fallback: number) =>
  z.preprocess(
    (value) => (typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : undefined),
    z.number().int().default(fallback),
  )

const floatWithDefault = (fallback: number) =>
  z.preprocess(
    (value) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined),
    z.number().default(fallback),
  )

const optionalInt = z.preprocess(
  (value) => (typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : undefined),
  z.number().int().optional(),
)

const booleanLike = z.preprocess((value) => Boolean(value), z.boolean())

export const cardKindSchema = z.enum(['tosti', 'avondeten']).catch('tosti')
export const shopExpensePurposeSchema = z.enum(['lunchkraam', 'avondeten']).catch('lunchkraam')

export const userSchema = z.object({
  id: intWithDefault(0),
  email: stringWithDefault(''),
  name: stringWithDefault(''),
  is_admin: booleanLike,
  is_operator: booleanLike,
  is_matroos_jeugd: booleanLike,
  must_change_password: booleanLike,
  auth_kind: z.enum(['google', 'local']).catch('google'),
  local_username: z.preprocess(
    (value) => (typeof value === 'string' ? value : undefined),
    z.string().optional(),
  ),
})

const myPendingRequestSchema = z.object({
  id: intWithDefault(0),
  kind: cardKindSchema,
  created_at: stringWithDefault(''),
  knipjes_remaining: intWithDefault(10),
})

const cardSchema = z.object({
  id: intWithDefault(0),
  kind: cardKindSchema,
  knipjes_remaining: intWithDefault(0),
  created_at: stringWithDefault(''),
})

export const meResponseSchema = z.object({
  user: userSchema.nullable().catch(null),
  pending_card_requests: intWithDefault(0),
  csrf_token: stringWithDefault(''),
  payment_amount_eur: stringWithDefault('15'),
  payment_amount_avondeten_eur: stringWithDefault('12'),
})

export const cardsResponseSchema = z.object({
  cards: z.array(cardSchema).catch([]),
})

export const buyInfoResponseSchema = z.object({
  payment_amount_eur: stringWithDefault(''),
  payment_amount_avondeten_eur: stringWithDefault('12'),
  tikkie_url: stringWithDefault(''),
  tikkie_url_avondeten: stringWithDefault(''),
  bank_transfer_instructions: stringWithDefault(''),
  my_pending_requests: z.array(myPendingRequestSchema).catch([]),
})

export const userEnvelopeSchema = z.object({
  user: userSchema.nullable().catch(null),
})

export const adminUserRowSchema = z.object({
  id: intWithDefault(0),
  name: stringWithDefault(''),
  email: stringWithDefault(''),
  auth_kind: z.enum(['google', 'local']).catch('google'),
  local_username: z.preprocess(
    (value) => (typeof value === 'string' ? value : undefined),
    z.string().optional(),
  ),
  is_admin: booleanLike,
  is_operator: booleanLike,
  is_matroos_jeugd: booleanLike,
  must_change_password: booleanLike,
  created_at: stringWithDefault(''),
})

export const adminUsersResponseSchema = z.object({
  users: z.array(adminUserRowSchema).catch([]),
})

const avondetenRegistrationCardSchema = z.object({
  card_id: intWithDefault(0),
  user_id: intWithDefault(0),
  owner_name: stringWithDefault(''),
  owner_email: stringWithDefault(''),
  knipjes_remaining: intWithDefault(0),
  registered_for_date: booleanLike,
})

export const avondetenRegistrationsResponseSchema = z.object({
  meal_date: stringWithDefault(''),
  cards: z.array(avondetenRegistrationCardSchema).catch([]),
})

export const registeredCountResponseSchema = z.object({
  registered_count: intWithDefault(0),
})

const operatorCardRowSchema = z.object({
  id: intWithDefault(0),
  kind: cardKindSchema,
  knipjes_remaining: intWithDefault(0),
  created_at: stringWithDefault(''),
  owner_name: stringWithDefault(''),
  owner_email: stringWithDefault(''),
  owner_user_id: intWithDefault(0),
})

export const operatorCardsResponseSchema = z.object({
  cards: z.array(operatorCardRowSchema).catch([]),
})

const tostiBreadSchema = z.enum(['wit', 'bruin']).catch('wit')
const tostiFillingSchema = z.enum(['ham', 'kaas', 'ham_kaas']).catch('ham')
const tostiOrderStatusSchema = z.enum(['pending', 'delivered', 'cancelled']).catch('pending')
const optionalCardIdSchema = z.preprocess(
  (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null),
  z.number().nullable(),
)

const tostiOrderQuantitySchema = intWithDefault(1).transform((value) => {
  if (value < 1) return 1
  if (value > 10) return 10
  return value
})

export const tostiOrderSchema = z.object({
  id: intWithDefault(0),
  user_id: intWithDefault(0),
  card_id: optionalCardIdSchema,
  quantity: tostiOrderQuantitySchema,
  bread: tostiBreadSchema,
  filling: tostiFillingSchema,
  status: tostiOrderStatusSchema,
  created_at: stringWithDefault(''),
  delivered_at: z.preprocess((value) => (typeof value === 'string' ? value : undefined), z.string().optional()),
  delivered_by_user_id: optionalInt,
  cancelled_at: z.preprocess((value) => (typeof value === 'string' ? value : undefined), z.string().optional()),
  cancelled_by_user_id: optionalInt,
})

const tostiQueueEntrySchema = z.object({
  place: intWithDefault(0),
  id: intWithDefault(0),
  card_id: optionalCardIdSchema,
  quantity: tostiOrderQuantitySchema,
  bread: tostiBreadSchema,
  filling: tostiFillingSchema,
  created_at: stringWithDefault(''),
  customer_name: stringWithDefault(''),
  is_mine: booleanLike,
})

export const tostiQueueResponseSchema = z.object({
  orders: z.array(tostiQueueEntrySchema).catch([]),
})

export const tostiOrdersResponseSchema = z.object({
  orders: z.array(tostiOrderSchema).catch([]),
})

export const createTostiOrderResponseSchema = z.object({
  order: tostiOrderSchema.nullable().catch(null),
})

const operatorTostiOrderSchema = tostiOrderSchema.extend({
  customer_name: stringWithDefault(''),
  customer_email: stringWithDefault(''),
})

export const operatorTostiOrdersResponseSchema = z.object({
  orders: z.array(operatorTostiOrderSchema).catch([]),
})

export const operatorTostiSoldTodaySchema = z.object({
  quantity: intWithDefault(0),
  amsterdam_date: stringWithDefault(''),
  timezone: stringWithDefault('Europe/Amsterdam'),
})

export const cancelledCountResponseSchema = z.object({
  cancelled_count: intWithDefault(0),
})

export const yearsResponseSchema = z.object({
  years: z.array(intWithDefault(0)).catch([]),
})

const adminSalesMonthBucketSchema = z.object({
  month: intWithDefault(0),
  fulfilled_count: intWithDefault(0),
  revenue_eur: floatWithDefault(0),
  expenses_eur: floatWithDefault(0),
  net_eur: floatWithDefault(0),
  label_nl: stringWithDefault(''),
})

const adminTostiMonthBucketSchema = z.object({
  month: intWithDefault(0),
  quantity: intWithDefault(0),
  label_nl: stringWithDefault(''),
})

const adminTostiKindBucketSchema = z.object({
  bread: stringWithDefault(''),
  filling: stringWithDefault(''),
  quantity: intWithDefault(0),
})

export const adminSalesStatsResponseSchema = z.object({
  year: intWithDefault(0),
  timezone: stringWithDefault('Europe/Amsterdam'),
  payment_amount_eur: stringWithDefault(''),
  monthly: z.array(adminSalesMonthBucketSchema).catch([]),
  year_fulfilled_count: intWithDefault(0),
  year_revenue_eur: floatWithDefault(0),
  year_expenses_eur: floatWithDefault(0),
  year_net_eur: floatWithDefault(0),
  year_tosti_quantity: intWithDefault(0),
  tosti_monthly: z.array(adminTostiMonthBucketSchema).catch([]),
  tosti_by_kind: z.array(adminTostiKindBucketSchema).catch([]),
})

export const shopExpenseSchema = z.object({
  id: intWithDefault(0),
  amount_eur: floatWithDefault(0),
  spent_on: stringWithDefault(''),
  description: stringWithDefault(''),
  purpose: shopExpensePurposeSchema,
  created_at: stringWithDefault(''),
})

export const shopExpensesResponseSchema = z.object({
  expenses: z.array(shopExpenseSchema).catch([]),
})

export const adminDashboardResponseSchema = z.object({
  active_cards_total: intWithDefault(0),
  knipjes_remaining_total: intWithDefault(0),
  pending_requests: intWithDefault(0),
  pending_with_card: intWithDefault(0),
  pending_knipjes_remaining: intWithDefault(0),
  pending_knipjes_consumed_estimate: intWithDefault(0),
  fulfilled_requests: intWithDefault(0),
  fulfilled_knipjes_remaining: intWithDefault(0),
  cancelled_requests: intWithDefault(0),
  payment_amount_eur: stringWithDefault(''),
  finance_year: intWithDefault(new Date().getFullYear()),
  year_revenue_eur: floatWithDefault(0),
  year_expenses_eur: floatWithDefault(0),
  year_net_eur: floatWithDefault(0),
})

const adminRequestSchema = z.object({
  id: intWithDefault(0),
  kind: cardKindSchema,
  user_name: stringWithDefault(''),
  user_email: stringWithDefault(''),
  created_at: stringWithDefault(''),
  knipjes_remaining: intWithDefault(10),
})

export const adminRequestsResponseSchema = z.object({
  requests: z.array(adminRequestSchema).catch([]),
})

export const adminSettingsResponseSchema = z.object({
  tikkie_url: stringWithDefault(''),
  tikkie_url_effective: stringWithDefault(''),
  tikkie_url_env_config: stringWithDefault(''),
  tikkie_url_avondeten: stringWithDefault(''),
  tikkie_url_avondeten_effective: stringWithDefault(''),
  tikkie_url_avondeten_env_config: stringWithDefault(''),
})

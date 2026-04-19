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
export const paymentMethodSchema = z.enum(['tikkie', 'contant']).catch('tikkie')
export const cardSourceSchema = z.enum(['online', 'physical']).catch('online')
export const shopExpensePurposeSchema = z.enum(['lunchkraam', 'avondeten']).catch('lunchkraam')
export const shopExpensePaymentChannelSchema = z.enum(['contant', 'digitaal', 'kas_bij']).catch('contant')

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

export const myPendingRequestSchema = z.object({
  id: intWithDefault(0),
  kind: cardKindSchema,
  created_at: stringWithDefault(''),
  knipjes_remaining: intWithDefault(10),
})

export const cardSchema = z.object({
  id: intWithDefault(0),
  kind: cardKindSchema,
  source: cardSourceSchema,
  knipjes_remaining: intWithDefault(0),
  created_at: stringWithDefault(''),
})

export const tikkieWarningSchema = z.object({
  kind: cardKindSchema,
  expires_at: stringWithDefault(''),
  days_remaining: intWithDefault(0),
  message: stringWithDefault(''),
})

export const meResponseSchema = z.object({
  user: userSchema.nullable().catch(null),
  pending_card_requests: intWithDefault(0),
  tikkie_warnings: z.array(tikkieWarningSchema).catch([]),
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

export const avondetenRegistrationCardSchema = z.object({
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

export const operatorCardRowSchema = z.object({
  id: intWithDefault(0),
  kind: cardKindSchema,
  source: cardSourceSchema,
  knipjes_remaining: intWithDefault(0),
  created_at: stringWithDefault(''),
  owner_name: stringWithDefault(''),
  owner_email: stringWithDefault(''),
  owner_user_id: intWithDefault(0),
})

export const operatorCardsResponseSchema = z.object({
  cards: z.array(operatorCardRowSchema).catch([]),
})

export const operatorMemberSchema = z.object({
  id: intWithDefault(0),
  name: stringWithDefault(''),
  email: stringWithDefault(''),
})

export const operatorMembersResponseSchema = z.object({
  members: z.array(operatorMemberSchema).catch([]),
})

export const tostiBreadSchema = z.enum(['wit', 'bruin']).catch('wit')
export const tostiFillingSchema = z.enum(['ham', 'kaas', 'ham_kaas']).catch('ham')
export const tostiOrderStatusSchema = z.enum(['pending', 'delivered', 'cancelled']).catch('pending')
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
  is_physical_card: booleanLike,
  bread: tostiBreadSchema,
  filling: tostiFillingSchema,
  status: tostiOrderStatusSchema,
  created_at: stringWithDefault(''),
  delivered_at: z.preprocess((value) => (typeof value === 'string' ? value : undefined), z.string().optional()),
  delivered_by_user_id: optionalInt,
  cancelled_at: z.preprocess((value) => (typeof value === 'string' ? value : undefined), z.string().optional()),
  cancelled_by_user_id: optionalInt,
  remark: z.preprocess((value) => (typeof value === 'string' ? value : undefined), z.string().optional()),
})

export const tostiQueueEntrySchema = z.object({
  place: intWithDefault(0),
  id: intWithDefault(0),
  card_id: optionalCardIdSchema,
  is_physical_card: booleanLike,
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

export const operatorTostiOrderSchema = tostiOrderSchema.extend({
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

export const adminSalesMonthBucketSchema = z.object({
  month: intWithDefault(0),
  fulfilled_count: intWithDefault(0),
  revenue_eur: floatWithDefault(0),
  revenue_card_sales_eur: floatWithDefault(0),
  revenue_bank_unmatched_eur: floatWithDefault(0),
  expenses_eur: floatWithDefault(0),
  net_eur: floatWithDefault(0),
  label_nl: stringWithDefault(''),
})

export const adminCardsSoldBreakdownSchema = z.object({
  tosti: intWithDefault(0),
  avondeten: intWithDefault(0),
  total: intWithDefault(0),
})

export const adminRevenueBreakdownSchema = z.object({
  tosti: floatWithDefault(0),
  avondeten: floatWithDefault(0),
  total: floatWithDefault(0),
})

export const adminExpensesBreakdownSchema = z.object({
  lunchkraam: floatWithDefault(0),
  avondeten: floatWithDefault(0),
  total: floatWithDefault(0),
})

export const adminSalesBreakdownBucketSchema = z.object({
  month: intWithDefault(0),
  cards_sold: adminCardsSoldBreakdownSchema,
  revenue_eur: adminRevenueBreakdownSchema,
  revenue_card_sales_eur: adminRevenueBreakdownSchema,
  revenue_bank_unmatched_eur: adminRevenueBreakdownSchema,
  expenses_eur: adminExpensesBreakdownSchema,
  net_eur: floatWithDefault(0),
  label_nl: stringWithDefault(''),
})

export const adminSalesYearBreakdownSchema = z.object({
  cards_sold: adminCardsSoldBreakdownSchema,
  revenue_eur: adminRevenueBreakdownSchema,
  revenue_card_sales_eur: adminRevenueBreakdownSchema,
  revenue_bank_unmatched_eur: adminRevenueBreakdownSchema,
  expenses_eur: adminExpensesBreakdownSchema,
  net_eur: floatWithDefault(0),
})

export const adminTostiMonthBucketSchema = z.object({
  month: intWithDefault(0),
  quantity: intWithDefault(0),
  label_nl: stringWithDefault(''),
})

export const adminTostiKindBucketSchema = z.object({
  bread: stringWithDefault(''),
  filling: stringWithDefault(''),
  quantity: intWithDefault(0),
})

export const adminSalesStatsResponseSchema = z.object({
  year: intWithDefault(0),
  timezone: stringWithDefault('Europe/Amsterdam'),
  payment_amount_eur: stringWithDefault(''),
  monthly: z.array(adminSalesMonthBucketSchema).catch([]),
  monthly_breakdown: z.array(adminSalesBreakdownBucketSchema).catch([]),
  year_fulfilled_count: intWithDefault(0),
  year_revenue_eur: floatWithDefault(0),
  year_revenue_card_sales_eur: floatWithDefault(0),
  year_revenue_bank_unmatched_eur: floatWithDefault(0),
  year_expenses_eur: floatWithDefault(0),
  year_net_eur: floatWithDefault(0),
  year_breakdown: adminSalesYearBreakdownSchema.catch({
    cards_sold: { tosti: 0, avondeten: 0, total: 0 },
    revenue_eur: { tosti: 0, avondeten: 0, total: 0 },
    revenue_card_sales_eur: { tosti: 0, avondeten: 0, total: 0 },
    revenue_bank_unmatched_eur: { tosti: 0, avondeten: 0, total: 0 },
    expenses_eur: { lunchkraam: 0, avondeten: 0, total: 0 },
    net_eur: 0,
  }),
  year_tosti_quantity: intWithDefault(0),
  tosti_monthly: z.array(adminTostiMonthBucketSchema).catch([]),
  tosti_by_kind: z.array(adminTostiKindBucketSchema).catch([]),
})

export const financeControlMonthStatusSchema = z.enum([
  'no_activity',
  'in_sync',
  'revolut_imports_higher',
  'app_revenue_higher',
])

export const financeControlMonthRowSchema = z.object({
  month: intWithDefault(0),
  label_nl: stringWithDefault(''),
  revolut_imports_eur: floatWithDefault(0),
  app_revenue_eur: floatWithDefault(0),
  delta_eur: floatWithDefault(0),
  status: financeControlMonthStatusSchema,
})

export const financeControlResponseSchema = z.object({
  year: intWithDefault(0),
  timezone: stringWithDefault('Europe/Amsterdam'),
  months: z.array(financeControlMonthRowSchema).catch([]),
  method_note_nl: stringWithDefault(''),
})

export const shopExpenseSchema = z.object({
  id: intWithDefault(0),
  amount_eur: floatWithDefault(0),
  spent_on: stringWithDefault(''),
  description: stringWithDefault(''),
  purpose: shopExpensePurposeSchema,
  payment_channel: shopExpensePaymentChannelSchema,
  created_at: stringWithDefault(''),
  source: stringWithDefault('manual'),
  external_id: stringWithDefault(''),
})

export const shopExpensesResponseSchema = z.object({
  expenses: z.array(shopExpenseSchema).catch([]),
})

const emptyRevolutSkipReasons = {
  filter_not_completed: 0,
  filter_currency_mismatch: 0,
  filter_type_skipped: 0,
  not_debit: 0,
  not_credit: 0,
  amount_not_standard_card_price: 0,
  missing_external_id: 0,
  user_excluded: 0,
  other: 0,
} as const

export const revolutSkipReasonsSchema = z.preprocess(
  (v) => (v != null && typeof v === 'object' ? v : emptyRevolutSkipReasons),
  z.object({
    filter_not_completed: intWithDefault(0),
    filter_currency_mismatch: intWithDefault(0),
    filter_type_skipped: intWithDefault(0),
    not_debit: intWithDefault(0),
    not_credit: intWithDefault(0),
    amount_not_standard_card_price: intWithDefault(0),
    missing_external_id: intWithDefault(0),
    user_excluded: intWithDefault(0),
    other: intWithDefault(0),
  }),
)

export const revolutPreviewBranchSchema = z.object({
  outcome: stringWithDefault(''),
  label_nl: stringWithDefault(''),
  selectable: z.boolean().catch(false),
  row_key: z.string().optional(),
  purpose: shopExpensePurposeSchema.optional(),
})

export const revolutPreviewRowSchema = z.object({
  line: intWithDefault(0),
  completed_at: stringWithDefault(''),
  amount_eur: floatWithDefault(0),
  description: stringWithDefault(''),
  type: stringWithDefault(''),
  state: stringWithDefault(''),
  currency: stringWithDefault(''),
  external_id_raw: stringWithDefault(''),
  debit: revolutPreviewBranchSchema.catch({ outcome: '', label_nl: '', selectable: false }),
  credit: revolutPreviewBranchSchema.catch({ outcome: '', label_nl: '', selectable: false }),
})

export const revolutPreviewResponseSchema = z.object({
  rows: z.array(revolutPreviewRowSchema).catch([]),
  debits_imported: intWithDefault(0),
  debits_skipped: intWithDefault(0),
  debits_pending_review: intWithDefault(0),
  debit_skip_reasons: revolutSkipReasonsSchema,
  credits_imported: intWithDefault(0),
  credits_skipped: intWithDefault(0),
  credits_enabled: z.boolean().catch(false),
  credit_skip_reasons: revolutSkipReasonsSchema,
  credits_imported_lunchkraam: intWithDefault(0),
  credits_imported_avondeten: intWithDefault(0),
  credits_inferred_non_standard: intWithDefault(0),
})

export const revolutShopExpenseImportResponseSchema = z.object({
  imported: intWithDefault(0),
  skipped: intWithDefault(0),
  debits_imported: intWithDefault(0),
  debits_skipped: intWithDefault(0),
  debits_pending_review: intWithDefault(0),
  debit_skip_reasons: revolutSkipReasonsSchema,
  credits_imported: intWithDefault(0),
  credits_skipped: intWithDefault(0),
  credits_enabled: z.boolean().catch(false),
  credit_skip_reasons: revolutSkipReasonsSchema,
  credits_imported_lunchkraam: intWithDefault(0),
  credits_imported_avondeten: intWithDefault(0),
  credits_inferred_non_standard: intWithDefault(0),
  dry_run: z.boolean().catch(false),
})

export const pendingImportReviewSchema = z.object({
  id: intWithDefault(0),
  revolut: z.object({
    amount_eur: floatWithDefault(0),
    spent_on: stringWithDefault(''),
    description: stringWithDefault(''),
    purpose: shopExpensePurposeSchema,
    external_id: stringWithDefault(''),
  }),
  matched_manual: z.object({
    id: intWithDefault(0),
    amount_eur: floatWithDefault(0),
    spent_on: stringWithDefault(''),
    description: stringWithDefault(''),
    purpose: shopExpensePurposeSchema,
    payment_channel: shopExpensePaymentChannelSchema,
    source: stringWithDefault('manual'),
  }),
  created_at: stringWithDefault(''),
})

export const pendingImportReviewsResponseSchema = z.object({
  reviews: z.array(pendingImportReviewSchema).catch([]),
})

export const revolutBalanceResponseSchema = z.object({
  balance_eur: z.number().nullable(),
  statement_as_of: z.string().nullable(),
  updated_at: z.string().nullable(),
})

export const shopExpenseReceiptSchema = z.object({
  id: intWithDefault(0),
  shop_expense_id: intWithDefault(0),
  content_type: stringWithDefault('image/jpeg'),
  size_bytes: intWithDefault(0),
  sha256: stringWithDefault(''),
  created_at: stringWithDefault(''),
  image_url: stringWithDefault(''),
})

export const shopExpenseReceiptsListResponseSchema = z.object({
  receipts: z.array(shopExpenseReceiptSchema).catch([]),
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
  year_revenue_card_sales_eur: floatWithDefault(0),
  year_revenue_bank_unmatched_eur: floatWithDefault(0),
  year_bank_credits_unmatched_count: intWithDefault(0),
  year_expenses_eur: floatWithDefault(0),
  year_net_eur: floatWithDefault(0),
})

export const bankCreditReconciliationStatusSchema = z
  .enum(['open', 'matched_sale', 'waived'])
  .catch('open')

export const bankCreditRowSchema = z.object({
  id: intWithDefault(0),
  amount_eur: floatWithDefault(0),
  received_on: stringWithDefault(''),
  description: stringWithDefault(''),
  purpose: shopExpensePurposeSchema,
  source: stringWithDefault(''),
  external_id: stringWithDefault(''),
  reconciliation_status: bankCreditReconciliationStatusSchema,
  matched_card_request_id: z.preprocess(
    (v) => (v === undefined ? null : v),
    z.union([z.number(), z.null()]),
  ),
})

export const bankCreditsListResponseSchema = z.object({
  year: intWithDefault(0),
  rows: z.array(bankCreditRowSchema).catch([]),
})

/** Zelfde payload als matched/unmatched lijsten. */
export const bankCreditsUnmatchedResponseSchema = bankCreditsListResponseSchema

export const bankCreditSuggestionCandidateSchema = z.object({
  card_request_id: intWithDefault(0),
  fulfilled_at: stringWithDefault(''),
  user_email: stringWithDefault(''),
  user_display: stringWithDefault(''),
  sale_price_eur: floatWithDefault(0),
  kind: cardKindSchema,
  payment_method: paymentMethodSchema,
})

export const bankCreditSuggestionsResponseSchema = z.object({
  bank_credit_id: intWithDefault(0),
  candidates: z.array(bankCreditSuggestionCandidateSchema).catch([]),
})

export const bankCreditMatchCandidatesResponseSchema = z.object({
  bank_credit_id: intWithDefault(0),
  digital: z.array(bankCreditSuggestionCandidateSchema).catch([]),
  physical: z.array(bankCreditSuggestionCandidateSchema).catch([]),
})

export const okResponseSchema = z.object({
  ok: z.boolean().catch(false),
})

export const adminRequestSchema = z.object({
  id: intWithDefault(0),
  kind: cardKindSchema,
  payment_method: paymentMethodSchema,
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

export const operatorCardSaleResponseSchema = z.object({
  request_id: intWithDefault(0),
})

import type { z } from 'zod'
import {
  adminCardsSoldBreakdownSchema,
  adminDashboardResponseSchema,
  adminExpensesBreakdownSchema,
  adminRequestSchema,
  adminRevenueBreakdownSchema,
  adminSalesBreakdownBucketSchema,
  adminSalesMonthBucketSchema,
  adminSalesStatsResponseSchema,
  financeControlMonthStatusSchema,
  financeControlResponseSchema,
  financeCorrectionKindSchema,
  financeCorrectionRowSchema,
  adminSalesYearBreakdownSchema,
  adminSettingsResponseSchema,
  adminTostiKindBucketSchema,
  adminTostiMonthBucketSchema,
  adminUserRowSchema,
  avondetenRegistrationCardSchema,
  bankCreditMatchCandidatesResponseSchema,
  bankCreditReconciliationStatusSchema,
  bankCreditRowSchema,
  bankCreditSuggestionCandidateSchema,
  bankCreditSuggestionsResponseSchema,
  bankCreditsListResponseSchema,
  buyInfoResponseSchema,
  cardKindSchema,
  cardSchema,
  meResponseSchema,
  myPendingRequestSchema,
  operatorCardRowSchema,
  operatorMemberSchema,
  operatorTostiOrderSchema,
  operatorTostiSoldTodaySchema,
  paymentMethodSchema,
  pendingImportReviewSchema,
  revolutBalanceResponseSchema,
  revolutPreviewBranchSchema,
  revolutPreviewResponseSchema,
  revolutPreviewRowSchema,
  revolutShopExpenseImportResponseSchema,
  revolutSkipReasonsSchema,
  shopExpensePaymentChannelSchema,
  shopExpensePurposeSchema,
  shopExpenseReceiptSchema,
  shopExpenseSchema,
  tikkieWarningSchema,
  tostiBreadSchema,
  tostiFillingSchema,
  tostiOrderSchema,
  tostiOrderStatusSchema,
  tostiQueueEntrySchema,
  userSchema,
} from '../api.schemas'

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
export type FinanceControlMonthStatus = z.infer<typeof financeControlMonthStatusSchema>
export type FinanceControlResponse = z.infer<typeof financeControlResponseSchema>
export type FinanceCorrectionKind = z.infer<typeof financeCorrectionKindSchema>
export type FinanceCorrectionRow = z.infer<typeof financeCorrectionRowSchema>
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

export type AdminUserRow = z.infer<typeof adminUserRowSchema>

export type OperatorCardRow = z.infer<typeof operatorCardRowSchema>
export type OperatorMember = z.infer<typeof operatorMemberSchema>
export type AvondetenRegistrationCard = z.infer<typeof avondetenRegistrationCardSchema>

export type TostiBread = z.infer<typeof tostiBreadSchema>
export type TostiFilling = z.infer<typeof tostiFillingSchema>
export type TostiOrderStatus = z.infer<typeof tostiOrderStatusSchema>
export type TostiOrder = z.infer<typeof tostiOrderSchema>
export type OperatorTostiOrderRow = z.infer<typeof operatorTostiOrderSchema>

/** Pending order in global FIFO queue (member view; no e-mail). */
export type TostiQueueEntry = z.infer<typeof tostiQueueEntrySchema>

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

export type OperatorTostiSoldToday = z.infer<typeof operatorTostiSoldTodaySchema>

export type AdminAppSettings = z.infer<typeof adminSettingsResponseSchema>

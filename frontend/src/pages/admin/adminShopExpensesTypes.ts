import type * as api from '../../api'

export type ShopExpensesListBundle = {
  rows: api.AdminShopExpense[]
  receiptsByExpenseId: Record<number, api.ShopExpenseReceipt[]>
}

/** Manual boeking: contante uitgave, digitale uitgave (beide met verplichte bon), of contant bij de kas. */
export type ShopBookingKind = 'contant_expense' | 'digital_expense' | 'cash_in'

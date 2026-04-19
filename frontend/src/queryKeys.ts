/** Stable keys for TanStack Query (admin + shared lists). */

export const queryKeys = {
  member: {
    myCards: ['member', 'cards'] as const,
    buyInfo: ['member', 'buy-info'] as const,
    myTostiOrders: ['member', 'my-tosti-orders'] as const,
    tostiQueue: ['member', 'tosti-queue'] as const,
  },
  /** Operator / kraam console (invalidate prefix `['operator']` for full kraam refresh). */
  operator: {
    cards: (q: string) => ['operator', 'cards', q.trim()] as const,
    members: ['operator', 'members'] as const,
    tostiOrders: ['operator', 'tosti-orders'] as const,
    soldToday: ['operator', 'tosti-sold-today'] as const,
    avondetenRegistrations: (mealDate: string) => ['operator', 'avondeten-registrations', mealDate] as const,
  },
  admin: {
    dashboard: ['admin', 'dashboard'] as const,
    requests: ['admin', 'requests'] as const,
    users: ['admin', 'users'] as const,
    settings: ['admin', 'settings'] as const,
    salesYears: (operator: boolean) => ['admin', 'sales-years', operator] as const,
    salesStats: (year: number, operator: boolean) => ['admin', 'sales-stats', year, operator] as const,
    financeControl: (year: number, operator: boolean) => ['admin', 'finance-control', year, operator] as const,
    financeCorrections: (year: number) => ['admin', 'finance-corrections', year] as const,
    shopExpensesList: (year: number, operator: boolean) => ['admin', 'shop-expenses', year, operator] as const,
    revolutBalance: (operator: boolean) => ['admin', 'revolut-balance', operator] as const,
    pendingReviews: (operator: boolean) => ['admin', 'pending-reviews', operator] as const,
    bankCredits: (year: number, tab: 'unmatched' | 'matched' | 'waived', operator: boolean) =>
      ['admin', 'bank-credits', year, tab, operator] as const,
    bankSuggestions: (id: number, operator: boolean) => ['admin', 'bank-credit-suggestions', id, operator] as const,
    bankMatchCandidates: (id: number, operator: boolean) =>
      ['admin', 'bank-credit-match-candidates', id, operator] as const,
    /** Unmatched + matched + waived rows for finance (one round-trip bundle). */
    bankCreditLists: (year: number, operator: boolean) =>
      ['admin', 'bank-credit-lists', year, operator] as const,
    /** Suggestions + manual match candidates for one bank credit row. */
    bankSuggestionPanel: (bankCreditId: number, operator: boolean) =>
      ['admin', 'bank-suggestion-panel', bankCreditId, operator] as const,
  },
} as const

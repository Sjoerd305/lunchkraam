package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"lunchkraam/internal/httpx"
	"lunchkraam/internal/money"
)

func (d *Deps) APIAdminDashboard(w http.ResponseWriter, r *http.Request) {
	st, err := d.Store.AdminDashboardStats(r.Context())
	if err != nil {
		httpx.RespondInternalStoreError(w, r, "AdminDashboardStats", err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"active_cards_total":                st.ActiveCardsTotal,
		"knipjes_remaining_total":           st.KnipjesRemainingTotal,
		"pending_requests":                  st.PendingRequests,
		"pending_with_card":                 st.PendingWithCard,
		"pending_knipjes_remaining":         st.PendingKnipjesRemaining,
		"pending_knipjes_consumed_estimate": st.PendingKnipjesConsumedEst,
		"fulfilled_requests":                st.FulfilledRequests,
		"fulfilled_knipjes_remaining":       st.FulfilledKnipjesRemaining,
		"cancelled_requests":                st.CancelledRequests,
		"payment_amount_eur":                d.Config.PaymentAmountEUR,
		"finance_year":                      st.FinanceYear,
		"year_revenue_eur":                  money.RoundEUR(st.YearRevenueEUR),
		"year_revenue_card_sales_eur":       money.RoundEUR(st.YearRevenueCardSalesEUR),
		"year_revenue_bank_unmatched_eur":   money.RoundEUR(st.YearRevenueBankUnmatchedEUR),
		"year_bank_credits_unmatched_count": st.YearBankCreditsUnmatchedCount,
		"year_expenses_eur":                 money.RoundEUR(st.YearExpensesEUR),
		"year_net_eur":                      money.RoundEUR(st.YearNetEUR),
	})
}

func parsePaymentEURAmount(s string) float64 {
	s = strings.TrimSpace(strings.ReplaceAll(s, ",", "."))
	if s == "" {
		return 0
	}
	v, err := strconv.ParseFloat(s, 64)
	if err != nil || v < 0 {
		return 0
	}
	return v
}

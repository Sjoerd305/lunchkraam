package handlers

import (
	"math"
	"net/http"
	"strconv"
	"strings"

	"lunchkraam/internal/httpx"
)

func (d *Deps) APIAdminDashboard(w http.ResponseWriter, r *http.Request) {
	st, err := d.Store.AdminDashboardStats(r.Context())
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Databasefout.")
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
		"year_revenue_eur":                  math.Round(st.YearRevenueEUR*100) / 100,
		"year_expenses_eur":                 math.Round(st.YearExpensesEUR*100) / 100,
		"year_net_eur":                      math.Round(st.YearNetEUR*100) / 100,
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

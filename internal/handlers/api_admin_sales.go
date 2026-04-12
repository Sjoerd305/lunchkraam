package handlers

import (
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"lunchkraam/internal/httpx"
	"lunchkraam/internal/store"
)

type adminSalesYearRollup struct {
	Monthly                []map[string]any
	MonthlyBreakdown       []map[string]any
	YearCount              int64
	YearCountTosti         int64
	YearCountAvondeten     int64
	YearRevenue            float64
	YearRevenueTosti       float64
	YearRevenueAvondeten   float64
	YearExpenses           float64
	YearExpensesLunchkraam float64
	YearExpensesAvondeten  float64
	YearNet                float64
}

func buildAdminSalesYearRollup(buckets [12]store.AdminSalesMonthAgg, expenseBuckets [12]store.AdminExpenseMonthAgg) adminSalesYearRollup {
	var r adminSalesYearRollup
	r.Monthly = make([]map[string]any, 0, 12)
	r.MonthlyBreakdown = make([]map[string]any, 0, 12)
	for i := 0; i < 12; i++ {
		b := buckets[i]
		r.YearCount += b.FulfilledCount
		r.YearCountTosti += b.FulfilledCountTosti
		r.YearCountAvondeten += b.FulfilledCountAvondeten
		rev := math.Round(b.RevenueEUR*100) / 100
		revTosti := math.Round(b.RevenueEURTosti*100) / 100
		revAvondeten := math.Round(b.RevenueEURAvondeten*100) / 100
		expLunchkraam := math.Round(expenseBuckets[i].LunchkraamEUR*100) / 100
		expAvondeten := math.Round(expenseBuckets[i].AvondetenEUR*100) / 100
		exp := math.Round((expLunchkraam+expAvondeten)*100) / 100
		r.YearRevenue += rev
		r.YearRevenueTosti += revTosti
		r.YearRevenueAvondeten += revAvondeten
		r.YearExpenses += exp
		r.YearExpensesLunchkraam += expLunchkraam
		r.YearExpensesAvondeten += expAvondeten
		net := math.Round((rev-exp)*100) / 100
		r.Monthly = append(r.Monthly, map[string]any{
			"month":           i + 1,
			"fulfilled_count": b.FulfilledCount,
			"revenue_eur":     rev,
			"expenses_eur":    exp,
			"net_eur":         net,
			"label_nl":        monthLabelNL(i + 1),
		})
		r.MonthlyBreakdown = append(r.MonthlyBreakdown, map[string]any{
			"month": i + 1,
			"cards_sold": map[string]any{
				"tosti":     b.FulfilledCountTosti,
				"avondeten": b.FulfilledCountAvondeten,
				"total":     b.FulfilledCount,
			},
			"revenue_eur": map[string]any{
				"tosti":     revTosti,
				"avondeten": revAvondeten,
				"total":     rev,
			},
			"expenses_eur": map[string]any{
				"lunchkraam": expLunchkraam,
				"avondeten":  expAvondeten,
				"total":      exp,
			},
			"net_eur":  net,
			"label_nl": monthLabelNL(i + 1),
		})
	}
	r.YearRevenue = math.Round(r.YearRevenue*100) / 100
	r.YearRevenueTosti = math.Round(r.YearRevenueTosti*100) / 100
	r.YearRevenueAvondeten = math.Round(r.YearRevenueAvondeten*100) / 100
	r.YearExpenses = math.Round(r.YearExpenses*100) / 100
	r.YearExpensesLunchkraam = math.Round(r.YearExpensesLunchkraam*100) / 100
	r.YearExpensesAvondeten = math.Round(r.YearExpensesAvondeten*100) / 100
	r.YearNet = math.Round((r.YearRevenue-r.YearExpenses)*100) / 100
	return r
}

func tostiMonthlyToJSON(monthly [12]int64) []map[string]any {
	out := make([]map[string]any, 0, 12)
	for i := 0; i < 12; i++ {
		out = append(out, map[string]any{
			"month":    i + 1,
			"quantity": monthly[i],
			"label_nl": monthLabelNL(i + 1),
		})
	}
	return out
}

func tostiByKindToJSON(rows []store.TostiKindQuantity) []map[string]any {
	out := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		out = append(out, map[string]any{
			"bread":    row.Bread,
			"filling":  row.Filling,
			"quantity": row.Quantity,
		})
	}
	return out
}

func (d *Deps) APIAdminSalesStats(w http.ResponseWriter, r *http.Request) {
	loc, locErr := time.LoadLocation("Europe/Amsterdam")
	year := time.Now().Year()
	if locErr == nil {
		year = time.Now().In(loc).Year()
	}
	if ys := strings.TrimSpace(r.URL.Query().Get("year")); ys != "" {
		if v, err := strconv.Atoi(ys); err == nil && v >= 2000 && v <= 2100 {
			year = v
		}
	}

	buckets, err := d.Store.AdminSalesByMonth(r.Context(), year)
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Databasefout.")
		return
	}
	expenseBuckets, err := d.Store.AdminExpensesByMonth(r.Context(), year)
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Databasefout.")
		return
	}

	rollup := buildAdminSalesYearRollup(buckets, expenseBuckets)

	tostiMonthly, err := d.Store.AdminTostiDeliveredQuantitiesByMonth(r.Context(), year)
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Databasefout.")
		return
	}
	tostiByKind, err := d.Store.AdminTostiDeliveredByKind(r.Context(), year)
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Databasefout.")
		return
	}
	yearTostiQty, err := d.Store.AdminTostiDeliveredYearQuantity(r.Context(), year)
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Databasefout.")
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"year":                 year,
		"timezone":             "Europe/Amsterdam",
		"payment_amount_eur":   d.Config.PaymentAmountEUR,
		"monthly":              rollup.Monthly,
		"monthly_breakdown":    rollup.MonthlyBreakdown,
		"year_fulfilled_count": rollup.YearCount,
		"year_revenue_eur":     rollup.YearRevenue,
		"year_expenses_eur":    rollup.YearExpenses,
		"year_net_eur":         rollup.YearNet,
		"year_breakdown": map[string]any{
			"cards_sold": map[string]any{
				"tosti":     rollup.YearCountTosti,
				"avondeten": rollup.YearCountAvondeten,
				"total":     rollup.YearCount,
			},
			"revenue_eur": map[string]any{
				"tosti":     rollup.YearRevenueTosti,
				"avondeten": rollup.YearRevenueAvondeten,
				"total":     rollup.YearRevenue,
			},
			"expenses_eur": map[string]any{
				"lunchkraam": rollup.YearExpensesLunchkraam,
				"avondeten":  rollup.YearExpensesAvondeten,
				"total":      rollup.YearExpenses,
			},
			"net_eur": rollup.YearNet,
		},
		"year_tosti_quantity": yearTostiQty,
		"tosti_monthly":       tostiMonthlyToJSON(tostiMonthly),
		"tosti_by_kind":       tostiByKindToJSON(tostiByKind),
	})
}

func mergeFinanceYears(fulfilled, expense []int) []int {
	seen := make(map[int]struct{}, len(fulfilled)+len(expense))
	for _, y := range fulfilled {
		seen[y] = struct{}{}
	}
	for _, y := range expense {
		seen[y] = struct{}{}
	}
	out := make([]int, 0, len(seen))
	for y := range seen {
		out = append(out, y)
	}
	sort.Slice(out, func(i, j int) bool { return out[i] > out[j] })
	return out
}

func (d *Deps) APIAdminSalesYears(w http.ResponseWriter, r *http.Request) {
	fulfilled, err := d.Store.AdminFulfilledYears(r.Context())
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Databasefout.")
		return
	}
	expenseYears, err := d.Store.AdminExpenseYears(r.Context())
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Databasefout.")
		return
	}
	years := mergeFinanceYears(fulfilled, expenseYears)
	httpx.JSON(w, http.StatusOK, map[string]any{"years": years})
}

func monthLabelNL(m int) string {
	switch m {
	case 1:
		return "jan"
	case 2:
		return "feb"
	case 3:
		return "mrt"
	case 4:
		return "apr"
	case 5:
		return "mei"
	case 6:
		return "jun"
	case 7:
		return "jul"
	case 8:
		return "aug"
	case 9:
		return "sep"
	case 10:
		return "okt"
	case 11:
		return "nov"
	case 12:
		return "dec"
	default:
		return ""
	}
}

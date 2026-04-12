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

type adminSalesTripletInt struct {
	Tosti     int64 `json:"tosti"`
	Avondeten int64 `json:"avondeten"`
	Total     int64 `json:"total"`
}

type adminSalesTripletFloat struct {
	Tosti     float64 `json:"tosti"`
	Avondeten float64 `json:"avondeten"`
	Total     float64 `json:"total"`
}

type adminSalesExpensesSplit struct {
	Lunchkraam float64 `json:"lunchkraam"`
	Avondeten  float64 `json:"avondeten"`
	Total      float64 `json:"total"`
}

type adminSalesMonthlyRow struct {
	Month          int     `json:"month"`
	FulfilledCount int64   `json:"fulfilled_count"`
	RevenueEUR     float64 `json:"revenue_eur"`
	ExpensesEUR    float64 `json:"expenses_eur"`
	NetEUR         float64 `json:"net_eur"`
	LabelNL        string  `json:"label_nl"`
}

type adminSalesMonthlyBreakdownRow struct {
	Month       int                     `json:"month"`
	CardsSold   adminSalesTripletInt    `json:"cards_sold"`
	RevenueEUR  adminSalesTripletFloat  `json:"revenue_eur"`
	ExpensesEUR adminSalesExpensesSplit `json:"expenses_eur"`
	NetEUR      float64                 `json:"net_eur"`
	LabelNL     string                  `json:"label_nl"`
}

type adminSalesYearBreakdown struct {
	CardsSold   adminSalesTripletInt    `json:"cards_sold"`
	RevenueEUR  adminSalesTripletFloat  `json:"revenue_eur"`
	ExpensesEUR adminSalesExpensesSplit `json:"expenses_eur"`
	NetEUR      float64                 `json:"net_eur"`
}

type adminSalesYearRollup struct {
	Monthly                []adminSalesMonthlyRow
	MonthlyBreakdown       []adminSalesMonthlyBreakdownRow
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

type adminSalesTostiMonthlyRow struct {
	Month    int    `json:"month"`
	Quantity int64  `json:"quantity"`
	LabelNL  string `json:"label_nl"`
}

type adminSalesTostiKindRow struct {
	Bread    string `json:"bread"`
	Filling  string `json:"filling"`
	Quantity int64  `json:"quantity"`
}

type adminSalesStatsResponse struct {
	Year               int                             `json:"year"`
	Timezone           string                          `json:"timezone"`
	PaymentAmountEUR   string                          `json:"payment_amount_eur"`
	Monthly            []adminSalesMonthlyRow          `json:"monthly"`
	MonthlyBreakdown   []adminSalesMonthlyBreakdownRow `json:"monthly_breakdown"`
	YearFulfilledCount int64                           `json:"year_fulfilled_count"`
	YearRevenueEUR     float64                         `json:"year_revenue_eur"`
	YearExpensesEUR    float64                         `json:"year_expenses_eur"`
	YearNetEUR         float64                         `json:"year_net_eur"`
	YearBreakdown      adminSalesYearBreakdown         `json:"year_breakdown"`
	YearTostiQuantity  int64                           `json:"year_tosti_quantity"`
	TostiMonthly       []adminSalesTostiMonthlyRow     `json:"tosti_monthly"`
	TostiByKind        []adminSalesTostiKindRow        `json:"tosti_by_kind"`
}

func buildAdminSalesYearRollup(buckets [12]store.AdminSalesMonthAgg, expenseBuckets [12]store.AdminExpenseMonthAgg) adminSalesYearRollup {
	var r adminSalesYearRollup
	r.Monthly = make([]adminSalesMonthlyRow, 0, 12)
	r.MonthlyBreakdown = make([]adminSalesMonthlyBreakdownRow, 0, 12)
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
		r.Monthly = append(r.Monthly, adminSalesMonthlyRow{
			Month: i + 1, FulfilledCount: b.FulfilledCount,
			RevenueEUR: rev, ExpensesEUR: exp, NetEUR: net,
			LabelNL: monthLabelNL(i + 1),
		})
		r.MonthlyBreakdown = append(r.MonthlyBreakdown, adminSalesMonthlyBreakdownRow{
			Month: i + 1,
			CardsSold: adminSalesTripletInt{
				Tosti: b.FulfilledCountTosti, Avondeten: b.FulfilledCountAvondeten, Total: b.FulfilledCount,
			},
			RevenueEUR: adminSalesTripletFloat{Tosti: revTosti, Avondeten: revAvondeten, Total: rev},
			ExpensesEUR: adminSalesExpensesSplit{
				Lunchkraam: expLunchkraam, Avondeten: expAvondeten, Total: exp,
			},
			NetEUR: net, LabelNL: monthLabelNL(i + 1),
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

func tostiMonthlyRows(monthly [12]int64) []adminSalesTostiMonthlyRow {
	out := make([]adminSalesTostiMonthlyRow, 0, 12)
	for i := 0; i < 12; i++ {
		out = append(out, adminSalesTostiMonthlyRow{
			Month: i + 1, Quantity: monthly[i], LabelNL: monthLabelNL(i + 1),
		})
	}
	return out
}

func tostiByKindRows(rows []store.TostiKindQuantity) []adminSalesTostiKindRow {
	out := make([]adminSalesTostiKindRow, 0, len(rows))
	for _, row := range rows {
		out = append(out, adminSalesTostiKindRow{
			Bread: row.Bread, Filling: row.Filling, Quantity: row.Quantity,
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

	resp := adminSalesStatsResponse{
		Year:               year,
		Timezone:           "Europe/Amsterdam",
		PaymentAmountEUR:   d.Config.PaymentAmountEUR,
		Monthly:            rollup.Monthly,
		MonthlyBreakdown:   rollup.MonthlyBreakdown,
		YearFulfilledCount: rollup.YearCount,
		YearRevenueEUR:     rollup.YearRevenue,
		YearExpensesEUR:    rollup.YearExpenses,
		YearNetEUR:         rollup.YearNet,
		YearBreakdown: adminSalesYearBreakdown{
			CardsSold: adminSalesTripletInt{
				Tosti: rollup.YearCountTosti, Avondeten: rollup.YearCountAvondeten, Total: rollup.YearCount,
			},
			RevenueEUR: adminSalesTripletFloat{
				Tosti: rollup.YearRevenueTosti, Avondeten: rollup.YearRevenueAvondeten, Total: rollup.YearRevenue,
			},
			ExpensesEUR: adminSalesExpensesSplit{
				Lunchkraam: rollup.YearExpensesLunchkraam,
				Avondeten:  rollup.YearExpensesAvondeten,
				Total:      rollup.YearExpenses,
			},
			NetEUR: rollup.YearNet,
		},
		YearTostiQuantity: yearTostiQty,
		TostiMonthly:      tostiMonthlyRows(tostiMonthly),
		TostiByKind:       tostiByKindRows(tostiByKind),
	}
	httpx.JSON(w, http.StatusOK, resp)
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

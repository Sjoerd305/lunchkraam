package handlers

import (
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"lunchkraam/internal/httpx"
	"lunchkraam/internal/money"
	"lunchkraam/internal/store"
)

type adminSalesYearRollup struct {
	Monthly                       []adminSalesMonthlyRow
	MonthlyBreakdown              []adminSalesMonthlyBreakdownRow
	YearCount                     int64
	YearCountTosti                int64
	YearCountAvondeten            int64
	YearRevenue                   float64
	YearRevenueTosti              float64
	YearRevenueAvondeten          float64
	YearRevenueCardTosti          float64
	YearRevenueCardAvondeten      float64
	YearRevenueBankUnmatchedTosti float64
	YearRevenueBankUnmatchedAvo   float64
	YearExpenses                  float64
	YearExpensesLunchkraam        float64
	YearExpensesAvondeten        float64
	YearNet                       float64
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
		rev := money.RoundEUR(b.RevenueEUR)
		revTosti := money.RoundEUR(b.RevenueEURTosti)
		revAvondeten := money.RoundEUR(b.RevenueEURAvondeten)
		revCardT := money.RoundEUR(b.RevenueCardTosti)
		revCardA := money.RoundEUR(b.RevenueCardAvondeten)
		revBankT := money.RoundEUR(b.RevenueBankUnmatchedTosti)
		revBankA := money.RoundEUR(b.RevenueBankUnmatchedAvondeten)
		revCard := money.RoundEUR(revCardT + revCardA)
		revBank := money.RoundEUR(revBankT + revBankA)
		expLunchkraam := money.RoundEUR(expenseBuckets[i].LunchkraamEUR)
		expAvondeten := money.RoundEUR(expenseBuckets[i].AvondetenEUR)
		exp := money.RoundEUR(expLunchkraam + expAvondeten)
		r.YearRevenue += rev
		r.YearRevenueTosti += revTosti
		r.YearRevenueAvondeten += revAvondeten
		r.YearRevenueCardTosti += revCardT
		r.YearRevenueCardAvondeten += revCardA
		r.YearRevenueBankUnmatchedTosti += revBankT
		r.YearRevenueBankUnmatchedAvo += revBankA
		r.YearExpenses += exp
		r.YearExpensesLunchkraam += expLunchkraam
		r.YearExpensesAvondeten += expAvondeten
		net := money.RoundEUR(rev - exp)
		r.Monthly = append(r.Monthly, adminSalesMonthlyRow{
			Month: i + 1, FulfilledCount: b.FulfilledCount,
			RevenueEUR: rev, RevenueCardSalesEUR: revCard, RevenueBankUnmatchedEUR: revBank,
			ExpensesEUR: exp, NetEUR: net,
			LabelNL: monthLabelNL(i + 1),
		})
		r.MonthlyBreakdown = append(r.MonthlyBreakdown, adminSalesMonthlyBreakdownRow{
			Month: i + 1,
			CardsSold: adminSalesTripletInt{
				Tosti: b.FulfilledCountTosti, Avondeten: b.FulfilledCountAvondeten, Total: b.FulfilledCount,
			},
			RevenueEUR: adminSalesTripletFloat{Tosti: revTosti, Avondeten: revAvondeten, Total: rev},
			RevenueCardSalesEUR: adminSalesTripletFloat{
				Tosti: revCardT, Avondeten: revCardA, Total: revCard,
			},
			RevenueBankUnmatchedEUR: adminSalesTripletFloat{
				Tosti: revBankT, Avondeten: revBankA, Total: revBank,
			},
			ExpensesEUR: adminSalesExpensesSplit{
				Lunchkraam: expLunchkraam, Avondeten: expAvondeten, Total: exp,
			},
			NetEUR: net, LabelNL: monthLabelNL(i + 1),
		})
	}
	r.YearRevenue = money.RoundEUR(r.YearRevenue)
	r.YearRevenueTosti = money.RoundEUR(r.YearRevenueTosti)
	r.YearRevenueAvondeten = money.RoundEUR(r.YearRevenueAvondeten)
	r.YearRevenueCardTosti = money.RoundEUR(r.YearRevenueCardTosti)
	r.YearRevenueCardAvondeten = money.RoundEUR(r.YearRevenueCardAvondeten)
	r.YearRevenueBankUnmatchedTosti = money.RoundEUR(r.YearRevenueBankUnmatchedTosti)
	r.YearRevenueBankUnmatchedAvo = money.RoundEUR(r.YearRevenueBankUnmatchedAvo)
	r.YearExpenses = money.RoundEUR(r.YearExpenses)
	r.YearExpensesLunchkraam = money.RoundEUR(r.YearExpensesLunchkraam)
	r.YearExpensesAvondeten = money.RoundEUR(r.YearExpensesAvondeten)
	r.YearNet = money.RoundEUR(r.YearRevenue - r.YearExpenses)
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

	yearCard := money.RoundEUR(rollup.YearRevenueCardTosti + rollup.YearRevenueCardAvondeten)
	yearBankUn := money.RoundEUR(rollup.YearRevenueBankUnmatchedTosti + rollup.YearRevenueBankUnmatchedAvo)
	resp := adminSalesStatsResponse{
		Year:                        year,
		Timezone:                    "Europe/Amsterdam",
		PaymentAmountEUR:            d.Config.PaymentAmountEUR,
		Monthly:                     rollup.Monthly,
		MonthlyBreakdown:            rollup.MonthlyBreakdown,
		YearFulfilledCount:          rollup.YearCount,
		YearRevenueEUR:              rollup.YearRevenue,
		YearRevenueCardSalesEUR:     yearCard,
		YearRevenueBankUnmatchedEUR: yearBankUn,
		YearExpensesEUR:             rollup.YearExpenses,
		YearNetEUR:                  rollup.YearNet,
		YearBreakdown: adminSalesYearBreakdown{
			CardsSold: adminSalesTripletInt{
				Tosti: rollup.YearCountTosti, Avondeten: rollup.YearCountAvondeten, Total: rollup.YearCount,
			},
			RevenueEUR: adminSalesTripletFloat{
				Tosti: rollup.YearRevenueTosti, Avondeten: rollup.YearRevenueAvondeten, Total: rollup.YearRevenue,
			},
			RevenueCardSalesEUR: adminSalesTripletFloat{
				Tosti: rollup.YearRevenueCardTosti, Avondeten: rollup.YearRevenueCardAvondeten, Total: yearCard,
			},
			RevenueBankUnmatchedEUR: adminSalesTripletFloat{
				Tosti: rollup.YearRevenueBankUnmatchedTosti, Avondeten: rollup.YearRevenueBankUnmatchedAvo, Total: yearBankUn,
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

func mergeFinanceYears(lists ...[]int) []int {
	seen := make(map[int]struct{})
	for _, list := range lists {
		for _, y := range list {
			seen[y] = struct{}{}
		}
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
	bankYears, err := d.Store.AdminBankCreditImportYears(r.Context())
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Databasefout.")
		return
	}
	years := mergeFinanceYears(fulfilled, expenseYears, bankYears)
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

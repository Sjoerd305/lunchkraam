package handlers

import (
	"net/http"

	"lunchkraam/internal/httpx"
	"lunchkraam/internal/money"
)

func (d *Deps) APIAdminSalesStats(w http.ResponseWriter, r *http.Request) {
	year, _ := parseSalesStatsYear(r)

	buckets, err := d.Store.AdminSalesByMonth(r.Context(), year)
	if err != nil {
		httpx.RespondInternalStoreError(w, r, "AdminSalesByMonth", err)
		return
	}
	expenseBuckets, err := d.Store.AdminExpensesByMonth(r.Context(), year)
	if err != nil {
		httpx.RespondInternalStoreError(w, r, "AdminExpensesByMonth", err)
		return
	}

	rollup := buildAdminSalesYearRollup(buckets, expenseBuckets)

	tostiMonthly, err := d.Store.AdminTostiDeliveredQuantitiesByMonth(r.Context(), year)
	if err != nil {
		httpx.RespondInternalStoreError(w, r, "AdminTostiDeliveredQuantitiesByMonth", err)
		return
	}
	tostiByKind, err := d.Store.AdminTostiDeliveredByKind(r.Context(), year)
	if err != nil {
		httpx.RespondInternalStoreError(w, r, "AdminTostiDeliveredByKind", err)
		return
	}
	yearTostiQty, err := d.Store.AdminTostiDeliveredYearQuantity(r.Context(), year)
	if err != nil {
		httpx.RespondInternalStoreError(w, r, "AdminTostiDeliveredYearQuantity", err)
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

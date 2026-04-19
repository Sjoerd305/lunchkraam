package handlers

import (
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
	YearExpensesAvondeten         float64
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

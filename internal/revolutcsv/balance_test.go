package revolutcsv

import (
	"testing"
	"time"
)

func TestLatestEURStatementBalance(t *testing.T) {
	t1 := time.Date(2025, 3, 1, 12, 0, 0, 0, time.UTC)
	t2 := time.Date(2025, 4, 1, 12, 0, 0, 0, time.UTC)
	b10, b99 := 10.0, 99.99
	rows := []Row{
		{CompletedDate: t1, Currency: "EUR", BalanceEUR: &b10},
		{CompletedDate: t2, Currency: "EUR", BalanceEUR: &b99},
	}
	bal, asOf, ok := LatestEURStatementBalance(rows)
	if !ok || bal != 99.99 || !asOf.Equal(t2) {
		t.Fatalf("got bal=%v asOf=%v ok=%v", bal, asOf, ok)
	}
}

func TestLatestEURStatementBalanceSkipsNonEUR(t *testing.T) {
	t1 := time.Date(2025, 3, 1, 12, 0, 0, 0, time.UTC)
	b1, b2 := 1.0, 2.0
	rows := []Row{
		{CompletedDate: t1, Currency: "GBP", BalanceEUR: &b1},
		{CompletedDate: t1, Currency: "EUR", BalanceEUR: &b2},
	}
	bal, _, ok := LatestEURStatementBalance(rows)
	if !ok || bal != 2 {
		t.Fatalf("got %v ok=%v", bal, ok)
	}
}

func TestLatestEURStatementBalanceSameTimeLastWins(t *testing.T) {
	ts := time.Date(2025, 3, 1, 12, 0, 0, 0, time.UTC)
	b1, b2 := 5.0, 7.0
	rows := []Row{
		{CompletedDate: ts, Currency: "EUR", BalanceEUR: &b1},
		{CompletedDate: ts, Currency: "EUR", BalanceEUR: &b2},
	}
	bal, _, ok := LatestEURStatementBalance(rows)
	if !ok || bal != 7 {
		t.Fatalf("got %v ok=%v", bal, ok)
	}
}

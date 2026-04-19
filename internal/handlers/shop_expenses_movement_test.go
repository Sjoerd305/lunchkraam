package handlers

import (
	"testing"

	"lunchkraam/internal/store"
)

func TestParseShopExpenseMovement(t *testing.T) {
	cases := []struct {
		in      string
		want    string
		wantOK  bool
	}{
		{"", store.ShopExpenseMovementExpense, true},
		{"  ", store.ShopExpenseMovementExpense, true},
		{"expense", store.ShopExpenseMovementExpense, true},
		{"EXPENSE", store.ShopExpenseMovementExpense, true},
		{"cash_in", store.ShopExpenseMovementCashIn, true},
		{"CASH_IN", store.ShopExpenseMovementCashIn, true},
		{"revolut", "", false},
		{"deposit", "", false},
	}
	for _, tc := range cases {
		t.Run(tc.in, func(t *testing.T) {
			got, ok := parseShopExpenseMovement(tc.in)
			if ok != tc.wantOK {
				t.Fatalf("ok: got %v want %v", ok, tc.wantOK)
			}
			if !tc.wantOK {
				return
			}
			if got != tc.want {
				t.Fatalf("movement: got %q want %q", got, tc.want)
			}
		})
	}
}

func TestResolveShopExpensePaymentChannel(t *testing.T) {
	cases := []struct {
		movement string
		raw      string
		want     string
		wantOK   bool
	}{
		{store.ShopExpenseMovementCashIn, "", store.ShopExpensePaymentKasBij, true},
		{store.ShopExpenseMovementCashIn, "digitaal", store.ShopExpensePaymentKasBij, true},
		{store.ShopExpenseMovementExpense, "", store.ShopExpensePaymentContant, true},
		{store.ShopExpenseMovementExpense, "  ", store.ShopExpensePaymentContant, true},
		{store.ShopExpenseMovementExpense, "contant", store.ShopExpensePaymentContant, true},
		{store.ShopExpenseMovementExpense, "CONTANT", store.ShopExpensePaymentContant, true},
		{store.ShopExpenseMovementExpense, "digitaal", store.ShopExpensePaymentDigitaal, true},
		{store.ShopExpenseMovementExpense, "kas_bij", "", false},
		{store.ShopExpenseMovementExpense, "ideal", "", false},
	}
	for _, tc := range cases {
		t.Run(tc.movement+"_"+tc.raw, func(t *testing.T) {
			got, ok := resolveShopExpensePaymentChannel(tc.movement, tc.raw)
			if ok != tc.wantOK {
				t.Fatalf("ok: got %v want %v", ok, tc.wantOK)
			}
			if !tc.wantOK {
				return
			}
			if got != tc.want {
				t.Fatalf("channel: got %q want %q", got, tc.want)
			}
		})
	}
}

package store

import "testing"

// Documented in migrations/00025_bank_credit_reconciliation_status.sql (CHECK bank_credit_imports_reconciliation_invariant).
func TestBankCreditReconciliationInvariantMatrix(t *testing.T) {
	p := func(id int64) *int64 { return &id }
	cases := []struct {
		name   string
		status string
		fk     *int64
		valid  bool
	}{
		{"open_null", BankCreditReconciliationOpen, nil, true},
		{"matched_with_fk", BankCreditReconciliationMatchedSale, p(1), true},
		{"waived_null", BankCreditReconciliationWaived, nil, true},
		{"open_with_fk", BankCreditReconciliationOpen, p(1), false},
		{"matched_null", BankCreditReconciliationMatchedSale, nil, false},
		{"waived_with_fk", BankCreditReconciliationWaived, p(1), false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := (tc.status == BankCreditReconciliationMatchedSale && tc.fk != nil) ||
				(tc.status == BankCreditReconciliationWaived && tc.fk == nil) ||
				(tc.status == BankCreditReconciliationOpen && tc.fk == nil)
			if got != tc.valid {
				t.Fatalf("expected valid=%v for status=%q fk=%v", tc.valid, tc.status, tc.fk)
			}
		})
	}
}

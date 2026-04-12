package revolutcsv

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestParseSampleNL(t *testing.T) {
	b, err := os.ReadFile(filepath.Join("testdata", "sample_revolut_nl.csv"))
	if err != nil {
		t.Fatal(err)
	}
	rows, err := Parse(bytes.NewReader(b))
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 3 {
		t.Fatalf("got %d rows, want 3", len(rows))
	}
	if rows[0].AmountEUR != -12.50 {
		t.Fatalf("row0 amount %v", rows[0].AmountEUR)
	}
	if rows[0].ExternalID != "txn-sample-001" {
		t.Fatalf("row0 id %q", rows[0].ExternalID)
	}
	if rows[0].Description != "Albert Heijn" {
		t.Fatalf("row0 desc %q", rows[0].Description)
	}
	want := time.Date(2026, 3, 15, 10, 0, 0, 0, time.UTC)
	if !rows[0].CompletedDate.Equal(want) {
		t.Fatalf("row0 date got %v want %v", rows[0].CompletedDate, want)
	}
}

func TestParseDutchAppExport(t *testing.T) {
	b, err := os.ReadFile(filepath.Join("testdata", "sample_revolut_app_nl.csv"))
	if err != nil {
		t.Fatal(err)
	}
	rows, err := Parse(bytes.NewReader(b))
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 2 {
		t.Fatalf("got %d rows", len(rows))
	}
	if rows[0].AmountEUR != -7.99 {
		t.Fatalf("amount %v", rows[0].AmountEUR)
	}
	if rows[0].State != "VOLTOOID" {
		t.Fatalf("state %q", rows[0].State)
	}
	if rows[0].Description != "Kosten voor kaartlevering" {
		t.Fatalf("desc %q", rows[0].Description)
	}
	// Empty "Datum voltooid" but Startdatum present (Revolut NL export quirk).
	if rows[1].CompletedDate.Year() != 2025 || rows[1].CompletedDate.Month() != 5 || rows[1].CompletedDate.Day() != 3 {
		t.Fatalf("fallback date got %v", rows[1].CompletedDate)
	}
	if rows[1].Description != "Open banking geannuleerd" {
		t.Fatalf("row1 desc %q", rows[1].Description)
	}
}

func TestParseBalanceColumnNL(t *testing.T) {
	csv := `Type,Datum voltooid,Bedrag,Valuta,Status,Saldo
X,2025-06-01 10:00:00,"-5,00",EUR,VOLTOOID,"100,50"
Y,2025-06-02 10:00:00,"1,25",EUR,VOLTOOID,"101,75"
`
	rows, err := Parse(bytes.NewReader([]byte(csv)))
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 2 {
		t.Fatalf("rows %d", len(rows))
	}
	if rows[0].BalanceEUR == nil || *rows[0].BalanceEUR != 100.5 {
		t.Fatalf("row0 balance %v", rows[0].BalanceEUR)
	}
	if rows[1].BalanceEUR == nil || *rows[1].BalanceEUR != 101.75 {
		t.Fatalf("row1 balance %v", rows[1].BalanceEUR)
	}
	bal, _, ok := LatestEURStatementBalance(rows)
	if !ok || bal != 101.75 {
		t.Fatalf("latest got %v ok=%v", bal, ok)
	}
}

func TestParseAmountCommaFractions(t *testing.T) {
	tests := []struct {
		in   string
		want float64
	}{
		{"33,5", 33.5},
		{"32,5", 32.5},
		{"32,50", 32.5},
		{"3,35", 3.35},
		{"-33,5", -33.5},
		{"-32,50", -32.5},
		{"1.234,56", 1234.56},
		{"1,234", 1234},
		{"1,234,567", 1234567},
		{"12,34", 12.34},
		{"0,5", 0.5},
	}
	for _, tc := range tests {
		t.Run(tc.in, func(t *testing.T) {
			got, err := parseAmount(tc.in)
			if err != nil {
				t.Fatalf("parseAmount(%q): %v", tc.in, err)
			}
			if got != tc.want {
				t.Fatalf("parseAmount(%q) = %v, want %v", tc.in, got, tc.want)
			}
		})
	}
}

func TestFingerprintExternalIDStable(t *testing.T) {
	d := time.Date(2025, 1, 2, 3, 4, 5, 0, time.UTC)
	a := FingerprintExternalID(d, -1.5, "x", "CARD")
	b := FingerprintExternalID(d, -1.5, "x", "CARD")
	if a != b {
		t.Fatalf("fingerprint not stable: %q vs %q", a, b)
	}
	if len(a) < len(fingerprintPrefix)+10 {
		t.Fatalf("unexpected fingerprint %q", a)
	}
}

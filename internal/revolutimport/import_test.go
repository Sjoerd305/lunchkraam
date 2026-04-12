package revolutimport

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"lunchkraam/internal/revolutcsv"
)

func TestDebitPurposeFromCompletedTime(t *testing.T) {
	loc, err := time.LoadLocation(TZ)
	if err != nil {
		t.Fatal(err)
	}
	// 10:00 Amsterdam (stored as UTC instant)
	local := time.Date(2025, 6, 15, 10, 0, 0, 0, loc)
	if got := DebitPurposeFromCompletedTime(local.UTC(), loc, "avondeten"); got != "lunchkraam" {
		t.Fatalf("10:00 got %q want lunchkraam", got)
	}
	local = time.Date(2025, 6, 15, 17, 0, 0, 0, loc)
	if got := DebitPurposeFromCompletedTime(local.UTC(), loc, "lunchkraam"); got != "avondeten" {
		t.Fatalf("17:00 got %q want avondeten", got)
	}
	local = time.Date(2025, 6, 15, 14, 0, 0, 0, loc)
	if got := DebitPurposeFromCompletedTime(local.UTC(), loc, "lunchkraam"); got != "lunchkraam" {
		t.Fatalf("14:00 fallback got %q", got)
	}
	local = time.Date(2025, 6, 15, 13, 0, 0, 0, loc)
	if got := DebitPurposeFromCompletedTime(local.UTC(), loc, "avondeten"); got != "avondeten" {
		t.Fatalf("13:00 boundary got %q want fallback", got)
	}
	local = time.Date(2025, 6, 15, 19, 0, 0, 0, loc)
	if got := DebitPurposeFromCompletedTime(local.UTC(), loc, "lunchkraam"); got != "lunchkraam" {
		t.Fatalf("19:00 boundary got %q want fallback", got)
	}
}

func TestImportDebitsDryRunSample(t *testing.T) {
	b, err := os.ReadFile(filepath.Join("..", "revolutcsv", "testdata", "sample_revolut_nl.csv"))
	if err != nil {
		t.Fatal(err)
	}
	res, err := ImportDebits(context.Background(), nil, strings.NewReader(string(b)), Options{
		Purpose:              "lunchkraam",
		Currency:             "EUR",
		CompletedOnly:        true,
		FingerprintMissingID: false,
		DryRun:               true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.Imported != 2 || res.Skipped != 1 {
		t.Fatalf("got imported=%d skipped=%d", res.Imported, res.Skipped)
	}
}

func TestImportDebitRowsGuessPurposeByTimeEveningDebit(t *testing.T) {
	// 15:00 UTC in summer ≈ 17:00 Europe/Amsterdam → avondeten window; fallback is lunchkraam.
	csv := `Date completed (UTC);Type;Description;Amount;Payment currency;State;ID
2026-06-15 15:00:00;CARD_PAYMENT;AH;-5,00;EUR;COMPLETED;tx-evening
`
	var gotPurpose string
	res, err := ImportDebits(context.Background(), nil, strings.NewReader(csv), Options{
		Purpose:              "lunchkraam",
		GuessPurposeByTime:   true,
		Currency:             "EUR",
		CompletedOnly:        true,
		FingerprintMissingID: false,
		DryRun:               true,
		OnDryRunRow: func(_, _ string, _ float64, purpose, _ string) {
			gotPurpose = purpose
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.Imported != 1 {
		t.Fatalf("imported=%d", res.Imported)
	}
	if gotPurpose != "avondeten" {
		t.Fatalf("purpose=%q want avondeten", gotPurpose)
	}
}

func TestRowPassesFiltersVoltooid(t *testing.T) {
	row := revolutcsv.Row{State: "VOLTOOID", Currency: "EUR", Type: "X"}
	if !RowPassesFilters(row, "EUR", nil, true) {
		t.Fatal("expected VOLTOOID to pass completed filter")
	}
}

func TestImportDebitsDutchAppFingerprint(t *testing.T) {
	b, err := os.ReadFile(filepath.Join("..", "revolutcsv", "testdata", "sample_revolut_app_nl.csv"))
	if err != nil {
		t.Fatal(err)
	}
	res, err := ImportDebits(context.Background(), nil, strings.NewReader(string(b)), Options{
		Purpose:              "lunchkraam",
		Currency:             "EUR",
		CompletedOnly:        true,
		FingerprintMissingID: true,
		DryRun:               true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.Imported != 1 || res.Skipped != 1 {
		t.Fatalf("got imported=%d skipped=%d", res.Imported, res.Skipped)
	}
}

func TestImportCreditRowsDryRun15And10(t *testing.T) {
	csv := `Type,Product,Startdatum,Datum voltooid,Beschrijving,Bedrag,Kosten,Valuta,Status,Saldo
Geld toevoegen,Betaalrekening,2025-03-22 13:01:48,2025-03-22 13:01:49,Tikkie,15,0,EUR,VOLTOOID,15
Geld toevoegen,Betaalrekening,2025-04-01 10:00:00,2025-04-01 10:00:01,Tikkie,10,0,EUR,VOLTOOID,25
Geld toevoegen,Betaalrekening,2025-04-02 10:00:00,2025-04-02 10:00:01,Anders,"1,8",0,EUR,VOLTOOID,26
`
	rows, err := revolutcsv.Parse(strings.NewReader(csv))
	if err != nil {
		t.Fatal(err)
	}
	res, err := ImportCreditRows(context.Background(), nil, rows, CreditOptions{
		Currency:             "EUR",
		CompletedOnly:        true,
		FingerprintMissingID: true,
		DryRun:               true,
		LunchkraamAmountEUR:  15,
		AvondetenAmountEUR:   10,
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.Imported != 2 || res.Skipped != 1 {
		t.Fatalf("got imported=%d skipped=%d", res.Imported, res.Skipped)
	}
}

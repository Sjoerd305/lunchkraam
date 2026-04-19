// Command revolut-import imports Revolut statement CSV rows as shop_expenses (debits)
// or prints a monthly revenue comparison (credits vs fulfilled card_requests in the app).
//
// Usage:
//
//	DATABASE_URL=... revolut-import import [flags] statement.csv
//	DATABASE_URL=... revolut-import reconcile [flags] statement.csv
//
// Dry-run import does not require DATABASE_URL.
package main

import (
	"bytes"
	"context"
	"flag"
	"fmt"
	"io"
	"log"
	"math"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"lunchkraam/internal/db"
	"lunchkraam/internal/revolutcsv"
	"lunchkraam/internal/revolutimport"
	"lunchkraam/internal/store"
)

func main() {
	log.SetFlags(0)
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	switch os.Args[1] {
	case "import":
		os.Exit(runImport(os.Args[2:]))
	case "reconcile":
		os.Exit(runReconcile(os.Args[2:]))
	case "-h", "--help", "help":
		usage()
		os.Exit(0)
	default:
		log.Printf("unknown subcommand %q\n", os.Args[1])
		usage()
		os.Exit(2)
	}
}

func usage() {
	fmt.Fprintf(os.Stderr, `Usage:
  %s import [flags] <statement.csv>   — import debits as shop_expenses (source revolut)
  %s reconcile [flags] <statement.csv> — compare Revolut credits per month to app omzet

Import flags:
  -dry-run                 Parse and print actions; no database writes
  -purpose string          lunchkraam or avondeten (default lunchkraam)
  -created-by int          users.id for created_by, or 0 for NULL (default 0)
  -currency string         Only rows with this payment currency (default EUR; use "" to disable)
  -skip-types string       Comma-separated Type values to skip (e.g. TOPUP,EXCHANGE)
  -completed-only          Skip rows with a non-empty State other than COMPLETED (default true)
  -fingerprint-missing-id  Derive external_id when the CSV has no id column
  -migrate                 Run goose migrations from -migrations dir before import
  -import-credits          Also import positive lines as omzet (exact -credit-* match or inferred purpose like debits)
  -credit-lunch-eur float  Standard lunchkraam (tosti) card amount (default 15; 0 = skip this tier)
  -credit-avondeten-eur float  Standard avondeten card amount (default 10; 0 = skip this tier)
  -guess-purpose-time      Infer debit purpose from transaction time in Europe/Amsterdam (default true; use=false for fixed -purpose)

Reconcile flags:
  -year int                Only this calendar year (Amsterdam); 0 = all years in file
  -currency string         Same as import (default EUR)
  -skip-types string       Same as import
  -completed-only          Same as import (default true)
  -migrate                 Run goose migrations before querying

Common:
  -migrations string      Migrations directory (default ./migrations)

Environment:
  DATABASE_URL            Required except for import -dry-run
`, filepath.Base(os.Args[0]), filepath.Base(os.Args[0]))
}

func runImport(args []string) int {
	fs := flag.NewFlagSet("import", flag.ExitOnError)
	dryRun := fs.Bool("dry-run", false, "")
	purpose := fs.String("purpose", "lunchkraam", "")
	createdBy := fs.Int64("created-by", 0, "")
	currency := fs.String("currency", "EUR", "")
	skipTypes := fs.String("skip-types", "", "")
	completedOnly := fs.Bool("completed-only", true, "")
	fingerprint := fs.Bool("fingerprint-missing-id", false, "")
	migrate := fs.Bool("migrate", false, "")
	migrationsDir := fs.String("migrations", "./migrations", "")
	importCredits := fs.Bool("import-credits", false, "")
	creditLunch := fs.Float64("credit-lunch-eur", 15, "")
	creditAvo := fs.Float64("credit-avondeten-eur", 10, "")
	guessPurposeTime := fs.Bool("guess-purpose-time", true, "Set purpose from clock time in Europe/Amsterdam: 08:00–13:00 lunchkraam, 16:00–19:00 avondeten; else -purpose")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	path := strings.TrimSpace(fs.Arg(0))
	if path == "" {
		log.Print("import: statement.csv path is required")
		return 2
	}
	if *purpose != "lunchkraam" && *purpose != "avondeten" {
		log.Printf("import: invalid -purpose %q", *purpose)
		return 2
	}
	f, err := os.Open(path)
	if err != nil {
		log.Printf("import: open file: %v", err)
		return 1
	}
	defer f.Close()

	raw, err := io.ReadAll(f)
	if err != nil {
		log.Printf("import: read file: %v", err)
		return 1
	}
	rows, err := revolutcsv.Parse(bytes.NewReader(raw))
	if err != nil {
		log.Printf("import: parse csv: %v", err)
		return 1
	}

	var st *store.Store
	ctx := context.Background()
	if !*dryRun {
		dbURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
		if dbURL == "" {
			log.Print("import: DATABASE_URL is required (unless -dry-run)")
			return 1
		}
		pool, err := db.Connect(ctx, dbURL)
		if err != nil {
			log.Printf("import: database: %v", err)
			return 1
		}
		defer pool.Close()
		if *migrate {
			if err := db.Migrate(ctx, pool, *migrationsDir); err != nil {
				log.Printf("import: migrate: %v", err)
				return 1
			}
		}
		st = store.New(pool)
	}

	var createdPtr *int64
	if v := *createdBy; v > 0 {
		vv := v
		createdPtr = &vv
	}

	opts := revolutimport.Options{
		Purpose:              *purpose,
		GuessPurposeByTime:   *guessPurposeTime,
		Currency:             *currency,
		SkipTypesCSV:         *skipTypes,
		CompletedOnly:        *completedOnly,
		FingerprintMissingID: *fingerprint,
		CreatedBy:            createdPtr,
		DryRun:               *dryRun,
	}
	if *dryRun {
		opts.OnDryRunRow = func(extID, spentOnISO string, amt float64, purpose, desc string) {
			log.Printf("would upsert revolut expense id=%s date=%s amount=%.2f purpose=%s desc=%q",
				extID, spentOnISO, amt, purpose, desc)
		}
	}
	res, err := revolutimport.ImportDebitRows(ctx, st, rows, opts)
	if err != nil {
		log.Printf("import debits: %v", err)
		return 1
	}
	log.Printf("debits: %d upserts (dry-run=%v), %d skipped %+v", res.Imported, res.DryRun, res.Skipped, res.SkipReasons)

	if *importCredits {
		co := revolutimport.CreditOptions{
			Purpose:              *purpose,
			GuessPurposeByTime:   *guessPurposeTime,
			Currency:             *currency,
			SkipTypesCSV:         *skipTypes,
			CompletedOnly:        *completedOnly,
			FingerprintMissingID: *fingerprint,
			CreatedBy:            createdPtr,
			DryRun:               *dryRun,
			LunchkraamAmountEUR:  *creditLunch,
			AvondetenAmountEUR:   *creditAvo,
		}
		if *dryRun {
			co.OnDryRunCreditRow = func(extID, receivedISO string, amt float64, purpose, desc string) {
				log.Printf("would upsert revolut credit id=%s date=%s amount=%.2f purpose=%s desc=%q",
					extID, receivedISO, amt, purpose, desc)
			}
		}
		cres, cerr := revolutimport.ImportCreditRows(ctx, st, rows, co)
		if cerr != nil {
			log.Printf("import credits: %v", cerr)
			return 1
		}
		log.Printf("credits: %d upserts (dry-run=%v), %d skipped lunch=%d avo=%d inferred_non_std=%d %+v",
			cres.Imported, cres.DryRun, cres.Skipped, cres.CreditsLunchkraam, cres.CreditsAvondeten, cres.CreditsInferredNonStandard, cres.SkipReasons)
	}

	if !*dryRun && st != nil {
		if bal, asOf, ok := revolutcsv.LatestEURStatementBalance(rows); ok {
			if err := st.UpsertRevolutBalanceSnapshot(ctx, bal, asOf); err != nil {
				log.Printf("revolut balance snapshot: %v", err)
			}
		}
	}
	return 0
}

func runReconcile(args []string) int {
	fs := flag.NewFlagSet("reconcile", flag.ExitOnError)
	yearFlag := fs.Int("year", 0, "")
	currency := fs.String("currency", "EUR", "")
	skipTypes := fs.String("skip-types", "", "")
	completedOnly := fs.Bool("completed-only", true, "")
	migrate := fs.Bool("migrate", false, "")
	migrationsDir := fs.String("migrations", "./migrations", "")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	path := strings.TrimSpace(fs.Arg(0))
	if path == "" {
		log.Print("reconcile: statement.csv path is required")
		return 2
	}
	dbURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if dbURL == "" {
		log.Print("reconcile: DATABASE_URL is required")
		return 1
	}

	f, err := os.Open(path)
	if err != nil {
		log.Printf("reconcile: open file: %v", err)
		return 1
	}
	defer f.Close()

	rows, err := revolutcsv.Parse(f)
	if err != nil {
		log.Printf("reconcile: parse csv: %v", err)
		return 1
	}

	skip := revolutimport.ParseSkipTypes(*skipTypes)
	loc, locErr := time.LoadLocation(revolutimport.TZ)
	if locErr != nil {
		log.Printf("reconcile: timezone: %v", locErr)
		return 1
	}

	// revolutMonthKey -> sum credits (positive amounts only)
	creditsByKey := make(map[int]float64)
	for _, row := range rows {
		if !revolutimport.RowPassesFilters(row, *currency, skip, *completedOnly) {
			continue
		}
		if row.AmountEUR <= 0 {
			continue
		}
		t := row.CompletedDate.In(loc)
		y, m := t.Year(), int(t.Month())
		if *yearFlag != 0 && y != *yearFlag {
			continue
		}
		key := y*100 + m
		creditsByKey[key] += row.AmountEUR
	}

	ctx := context.Background()
	pool, err := db.Connect(ctx, dbURL)
	if err != nil {
		log.Printf("reconcile: database: %v", err)
		return 1
	}
	defer pool.Close()
	if *migrate {
		if err := db.Migrate(ctx, pool, *migrationsDir); err != nil {
			log.Printf("reconcile: migrate: %v", err)
			return 1
		}
	}
	st := store.New(pool)

	years := map[int]struct{}{}
	for k := range creditsByKey {
		years[k/100] = struct{}{}
	}
	var yearList []int
	for y := range years {
		yearList = append(yearList, y)
	}
	slices.SortFunc(yearList, func(a, b int) int { return b - a })
	if *yearFlag != 0 {
		yearList = []int{*yearFlag}
	}

	fmt.Printf("Revolut credits (sum of positive %s amounts, %s calendar month) vs app omzet (fulfilled card_requests, same TZ).\n",
		strings.TrimSpace(*currency), revolutimport.TZ)
	fmt.Printf("Note: app totals exclude revenue not recorded as fulfilled card_requests (e.g. some edge cases).\n\n")

	for _, y := range yearList {
		buckets, err := st.AdminSalesByMonth(ctx, y)
		if err != nil {
			log.Printf("reconcile: sales %d: %v", y, err)
			return 1
		}
		fmt.Printf("Year %d\n", y)
		fmt.Printf("%-10s %14s %14s %14s\n", "Month", "Revolut+", "App_omzet", "Delta")
		for m := 1; m <= 12; m++ {
			key := y*100 + m
			rev := creditsByKey[key]
			app := buckets[m-1].RevenueEUR
			if rev == 0 && app == 0 {
				continue
			}
			delta := rev - app
			fmt.Printf("%04d-%02d    %14.2f %14.2f %14.2f\n", y, m, round2(rev), round2(app), round2(delta))
		}
		fmt.Println()
	}
	return 0
}

func round2(v float64) float64 {
	return math.Round(v*100) / 100
}

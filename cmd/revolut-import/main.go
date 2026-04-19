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
	"log/slog"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"lunchkraam/internal/db"
	"lunchkraam/internal/money"
	"lunchkraam/internal/revolutcsv"
	"lunchkraam/internal/revolutimport"
	"lunchkraam/internal/store"
)

// readStatementFile reads a user-chosen path by opening the parent with os.OpenRoot
// and only the file name in that root, so a single final path component is passed to Open (CWE-22 / G304).
func readStatementFile(path string) ([]byte, error) {
	abs, err := filepath.Abs(filepath.Clean(path))
	if err != nil {
		return nil, err
	}
	base := filepath.Base(abs)
	if base == "." || base == ".." || base == "" {
		return nil, fmt.Errorf("ongeldig pad: %q", path)
	}
	parent := filepath.Dir(abs)
	r, err := os.OpenRoot(parent)
	if err != nil {
		return nil, err
	}
	defer r.Close()
	f, err := r.Open(base)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return io.ReadAll(f)
}

func main() {
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo})))
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
		slog.Warn("unknown subcommand", "arg", os.Args[1])
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
		slog.Warn("import: statement.csv path is required")
		return 2
	}
	if *purpose != "lunchkraam" && *purpose != "avondeten" {
		slog.Warn("import: invalid -purpose", "purpose", *purpose)
		return 2
	}
	raw, err := readStatementFile(path)
	if err != nil {
		slog.Error("import: read file", "err", err)
		return 1
	}
	rows, err := revolutcsv.Parse(bytes.NewReader(raw))
	if err != nil {
		slog.Error("import: parse csv", "err", err)
		return 1
	}

	var st *store.Store
	ctx := context.Background()
	if !*dryRun {
		dbURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
		if dbURL == "" {
			slog.Error("import: DATABASE_URL is required (unless -dry-run)")
			return 1
		}
		pool, err := db.Connect(ctx, dbURL)
		if err != nil {
			slog.Error("import: database", "err", err)
			return 1
		}
		defer pool.Close()
		if *migrate {
			if err := db.Migrate(ctx, pool, *migrationsDir); err != nil {
				slog.Error("import: migrate", "err", err)
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
			slog.Info("would upsert revolut expense",
				"external_id", extID,
				"spent_on", spentOnISO,
				"amount_eur", amt,
				"purpose", purpose,
				"description", desc,
			)
		}
	}
	res, err := revolutimport.ImportDebitRows(ctx, st, rows, opts)
	if err != nil {
		slog.Error("import debits", "err", err)
		return 1
	}
	slog.Info("import debits done",
		"upserts", res.Imported,
		"dry_run", res.DryRun,
		"skipped", res.Skipped,
		"skip_reasons", res.SkipReasons,
	)

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
				slog.Info("would upsert revolut credit",
					"external_id", extID,
					"received_on", receivedISO,
					"amount_eur", amt,
					"purpose", purpose,
					"description", desc,
				)
			}
		}
		cres, cerr := revolutimport.ImportCreditRows(ctx, st, rows, co)
		if cerr != nil {
			slog.Error("import credits", "err", cerr)
			return 1
		}
		slog.Info("import credits done",
			"upserts", cres.Imported,
			"dry_run", cres.DryRun,
			"skipped", cres.Skipped,
			"credits_lunchkraam", cres.CreditsLunchkraam,
			"credits_avondeten", cres.CreditsAvondeten,
			"credits_inferred_non_standard", cres.CreditsInferredNonStandard,
			"skip_reasons", cres.SkipReasons,
		)
	}

	if !*dryRun && st != nil {
		if bal, asOf, ok := revolutcsv.LatestEURStatementBalance(rows); ok {
			if err := st.UpsertRevolutBalanceSnapshot(ctx, bal, asOf); err != nil {
				slog.Warn("revolut balance snapshot upsert after import", "err", err)
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
		slog.Warn("reconcile: statement.csv path is required")
		return 2
	}
	dbURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if dbURL == "" {
		slog.Error("reconcile: DATABASE_URL is required")
		return 1
	}

	raw, err := readStatementFile(path)
	if err != nil {
		slog.Error("reconcile: read file", "err", err)
		return 1
	}

	rows, err := revolutcsv.Parse(bytes.NewReader(raw))
	if err != nil {
		slog.Error("reconcile: parse csv", "err", err)
		return 1
	}

	skip := revolutimport.ParseSkipTypes(*skipTypes)
	loc, locErr := time.LoadLocation(revolutimport.TZ)
	if locErr != nil {
		slog.Error("reconcile: timezone", "err", locErr)
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
		slog.Error("reconcile: database", "err", err)
		return 1
	}
	defer pool.Close()
	if *migrate {
		if err := db.Migrate(ctx, pool, *migrationsDir); err != nil {
			slog.Error("reconcile: migrate", "err", err)
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
			slog.Error("reconcile: sales by month", "year", y, "err", err)
			return 1
		}
		fmt.Printf("Year %d\n", y)
		fmt.Printf("%-10s %14s %14s %14s\n", "Month", "Revolut+", "App_omzet", "Delta")
		// 12 = len(buckets); iterate index i so static analysis (G602) can prove bucket access in range.
		for i := 0; i < 12; i++ {
			m := i + 1
			key := y*100 + m
			rev := creditsByKey[key]
			app := buckets[i].RevenueEUR
			if rev == 0 && app == 0 {
				continue
			}
			delta := rev - app
			fmt.Printf("%04d-%02d    %14.2f %14.2f %14.2f\n", y, m, money.RoundEUR(rev), money.RoundEUR(app), money.RoundEUR(delta))
		}
		fmt.Println()
	}
	return 0
}

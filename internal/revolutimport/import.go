package revolutimport

import (
	"context"
	"fmt"
	"io"
	"math"
	"strings"
	"time"

	"lunchkraam/internal/revolutcsv"
	"lunchkraam/internal/store"
)

const TZ = "Europe/Amsterdam"

// DebitPurposeFromCompletedTime maps the transaction clock in loc (via t.In(loc)) to lunchkraam or avondeten.
// Windows: morning 08:00–13:00, evening 16:00–19:00 (end-exclusive on the hour). Outside those ranges, fallback is used.
func DebitPurposeFromCompletedTime(t time.Time, loc *time.Location, fallback string) string {
	local := t.In(loc)
	h, m := local.Hour(), local.Minute()
	mins := h*60 + m
	if mins >= 8*60 && mins < 13*60 {
		return "lunchkraam"
	}
	if mins >= 16*60 && mins < 19*60 {
		return "avondeten"
	}
	return fallback
}

// Options configures a Revolut debit import into shop_expenses.
type Options struct {
	Purpose              string
	GuessPurposeByTime   bool   // if true, set purpose per row from CompletedDate (Amsterdam); else use Purpose for every row
	Currency             string // empty = no currency filter; otherwise match payment currency (e.g. EUR)
	SkipTypesCSV         string // comma-separated Type values to skip
	CompletedOnly        bool
	FingerprintMissingID bool
	CreatedBy            *int64 // optional users.id for created_by
	DryRun               bool
	// OnDryRunRow is called for each row that would be upserted when DryRun is true (optional).
	OnDryRunRow func(externalID, spentOnISO string, amount float64, purpose, description string)
}

// CreditOptions configures importing positive Revolut lines as bank_credit_imports (omzet).
// Rows match if the (rounded) amount equals LunchkraamAmountEUR and/or AvondetenAmountEUR (>0).
type CreditOptions struct {
	Currency             string
	SkipTypesCSV         string
	CompletedOnly        bool
	FingerprintMissingID bool
	CreatedBy            *int64
	DryRun               bool
	LunchkraamAmountEUR  float64 // e.g. 15; 0 = do not match this amount
	AvondetenAmountEUR   float64 // e.g. 10; 0 = do not match this amount
	OnDryRunCreditRow    func(externalID, receivedISO string, amount float64, purpose, description string)
}

// Result is returned after scanning the CSV (and optionally writing to the DB).
type Result struct {
	Imported      int
	Skipped       int
	PendingReview int // rows flagged for duplicate review instead of imported
	DryRun        bool
}

// ParseSkipTypes builds a set of uppercase type names to skip.
func ParseSkipTypes(s string) map[string]struct{} {
	out := make(map[string]struct{})
	for _, p := range strings.Split(s, ",") {
		p = strings.TrimSpace(strings.ToUpper(p))
		if p != "" {
			out[p] = struct{}{}
		}
	}
	return out
}

// BuildExpenseDescription matches the CLI import description format.
func BuildExpenseDescription(row revolutcsv.Row) string {
	var b strings.Builder
	if strings.TrimSpace(row.Type) != "" {
		b.WriteString(strings.TrimSpace(row.Type))
		b.WriteString(": ")
	}
	b.WriteString(strings.TrimSpace(row.Description))
	return strings.TrimSpace(b.String())
}

// RowPassesFilters applies currency, type-skip, and completed-state filters.
func RowPassesFilters(row revolutcsv.Row, currency string, skip map[string]struct{}, completedOnly bool) bool {
	if completedOnly {
		st := strings.TrimSpace(strings.ToUpper(row.State))
		if st != "" && !isCompletedState(st) {
			return false
		}
	}
	cur := strings.TrimSpace(strings.ToUpper(row.Currency))
	if currency != "" {
		if cur != "" && cur != strings.ToUpper(strings.TrimSpace(currency)) {
			return false
		}
	}
	typ := strings.TrimSpace(strings.ToUpper(row.Type))
	if typ != "" {
		if _, ok := skip[typ]; ok {
			return false
		}
	}
	return true
}

func isCompletedState(st string) bool {
	switch st {
	case "COMPLETED", "VOLTOOID", "COMPLETE", "AFGEHANDELD":
		return true
	default:
		return false
	}
}

// SpentOnDateAmsterdam returns midnight UTC on the Amsterdam calendar date of t.
func SpentOnDateAmsterdam(t time.Time, loc *time.Location) time.Time {
	x := t.In(loc)
	return time.Date(x.Year(), x.Month(), x.Day(), 0, 0, 0, 0, time.UTC)
}

func round2(v float64) float64 {
	return math.Round(v*100) / 100
}

// creditPurposeForAmount maps a positive statement amount to lunchkraam (tosti) or avondeten revenue.
func creditPurposeForAmount(amountEUR, lunchStandard, avondetenStandard float64) (purpose string, ok bool) {
	a := round2(amountEUR)
	if lunchStandard > 0 && round2(lunchStandard) == a {
		return "lunchkraam", true
	}
	if avondetenStandard > 0 && round2(avondetenStandard) == a {
		return "avondeten", true
	}
	return "", false
}

// ImportDebits parses CSV from r and upserts negative amounts as shop_expenses (source revolut).
// When DryRun is true, st may be nil and no DB writes occur.
func ImportDebits(ctx context.Context, st *store.Store, csv io.Reader, o Options) (Result, error) {
	rows, err := revolutcsv.Parse(csv)
	if err != nil {
		return Result{}, err
	}
	return ImportDebitRows(ctx, st, rows, o)
}

// ImportDebitRows upserts debits from pre-parsed rows.
func ImportDebitRows(ctx context.Context, st *store.Store, rows []revolutcsv.Row, o Options) (Result, error) {
	if o.Purpose != "lunchkraam" && o.Purpose != "avondeten" {
		return Result{}, fmt.Errorf("ongeldig doel %q", o.Purpose)
	}
	if !o.DryRun && st == nil {
		return Result{}, fmt.Errorf("database is verplicht zonder dry-run")
	}
	loc, err := time.LoadLocation(TZ)
	if err != nil {
		return Result{}, err
	}
	skip := ParseSkipTypes(o.SkipTypesCSV)

	var res Result
	res.DryRun = o.DryRun

	for _, row := range rows {
		if !RowPassesFilters(row, o.Currency, skip, o.CompletedOnly) {
			res.Skipped++
			continue
		}
		if row.AmountEUR >= 0 {
			res.Skipped++
			continue
		}
		amt := -row.AmountEUR
		extID := strings.TrimSpace(row.ExternalID)
		if extID == "" {
			if !o.FingerprintMissingID {
				res.Skipped++
				continue
			}
			extID = revolutcsv.FingerprintExternalID(row.CompletedDate, row.AmountEUR, row.Description, row.Type)
		}
		spentOn := SpentOnDateAmsterdam(row.CompletedDate, loc)
		desc := BuildExpenseDescription(row)
		purpose := o.Purpose
		if o.GuessPurposeByTime {
			purpose = DebitPurposeFromCompletedTime(row.CompletedDate, loc, o.Purpose)
		}
		if o.DryRun {
			if o.OnDryRunRow != nil {
				o.OnDryRunRow(extID, spentOn.Format("2006-01-02"), amt, purpose, desc)
			}
			res.Imported++
			continue
		}

		// Check if this Revolut row already exists in shop_expenses (re-import).
		alreadyImported, err := st.ShopExpenseExistsBySourceAndExternalID(ctx, store.ShopExpenseSourceRevolut, extID)
		if err != nil {
			return res, fmt.Errorf("exists check %s: %w", extID, err)
		}
		if alreadyImported {
			// Re-import: just update the existing row, no duplicate detection needed.
			if _, err := st.UpsertImportedShopExpense(ctx, store.ShopExpenseSourceRevolut, extID, o.CreatedBy, amt, spentOn, desc, purpose); err != nil {
				return res, fmt.Errorf("upsert %s: %w", extID, err)
			}
			res.Imported++
			continue
		}

		// New Revolut row: check for matching manual expenses (same amount + date).
		matches, err := st.FindMatchingManualExpenses(ctx, amt, spentOn)
		if err != nil {
			return res, fmt.Errorf("duplicate check %s: %w", extID, err)
		}
		if len(matches) > 0 {
			// Flag for review instead of importing directly.
			if _, err := st.InsertPendingImportReview(ctx, amt, spentOn, desc, purpose, store.ShopExpenseSourceRevolut, extID, matches[0].ID, o.CreatedBy); err != nil {
				return res, fmt.Errorf("pending review %s: %w", extID, err)
			}
			res.PendingReview++
			continue
		}

		if _, err := st.UpsertImportedShopExpense(ctx, store.ShopExpenseSourceRevolut, extID, o.CreatedBy, amt, spentOn, desc, purpose); err != nil {
			return res, fmt.Errorf("upsert %s: %w", extID, err)
		}
		res.Imported++
	}
	return res, nil
}

// ImportCreditRows upserts positive amounts that match configured standard prices into bank_credit_imports.
func ImportCreditRows(ctx context.Context, st *store.Store, rows []revolutcsv.Row, o CreditOptions) (Result, error) {
	if o.LunchkraamAmountEUR <= 0 && o.AvondetenAmountEUR <= 0 {
		return Result{}, fmt.Errorf("stel minstens één positief standaardbedrag in (lunch of avondeten)")
	}
	if !o.DryRun && st == nil {
		return Result{}, fmt.Errorf("database is verplicht zonder dry-run")
	}
	loc, err := time.LoadLocation(TZ)
	if err != nil {
		return Result{}, err
	}
	skip := ParseSkipTypes(o.SkipTypesCSV)

	var res Result
	res.DryRun = o.DryRun

	for _, row := range rows {
		if !RowPassesFilters(row, o.Currency, skip, o.CompletedOnly) {
			res.Skipped++
			continue
		}
		if row.AmountEUR <= 0 {
			res.Skipped++
			continue
		}
		purpose, ok := creditPurposeForAmount(row.AmountEUR, o.LunchkraamAmountEUR, o.AvondetenAmountEUR)
		if !ok {
			res.Skipped++
			continue
		}
		amt := row.AmountEUR
		extID := strings.TrimSpace(row.ExternalID)
		if extID == "" {
			if !o.FingerprintMissingID {
				res.Skipped++
				continue
			}
			extID = revolutcsv.FingerprintExternalID(row.CompletedDate, row.AmountEUR, row.Description, row.Type)
		}
		// Namespace apart from shop_expenses.revolut external_id (same table uses different rows; avoids duplicate constraint confusion if IDs overlap).
		extID = "credit:" + extID
		receivedOn := SpentOnDateAmsterdam(row.CompletedDate, loc)
		desc := BuildExpenseDescription(row)
		if o.DryRun {
			if o.OnDryRunCreditRow != nil {
				o.OnDryRunCreditRow(extID, receivedOn.Format("2006-01-02"), amt, purpose, desc)
			}
			res.Imported++
			continue
		}
		if err := st.UpsertImportedBankCredit(ctx, store.BankCreditSourceRevolut, extID, o.CreatedBy, amt, receivedOn, desc, purpose); err != nil {
			return res, fmt.Errorf("upsert credit %s: %w", extID, err)
		}
		res.Imported++
	}
	return res, nil
}

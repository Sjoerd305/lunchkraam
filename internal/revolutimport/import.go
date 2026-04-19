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
	// ExcludeDebitExternalIDs skips rows by effective Revolut expense external_id (after fingerprinting).
	ExcludeDebitExternalIDs map[string]struct{}
	// DebitPurposeOverrides sets waarvoor (lunchkraam|avondeten) per expense external_id after time/default logic.
	DebitPurposeOverrides map[string]string
	// OnDryRunRow is called for each row that would be upserted when DryRun is true (optional).
	OnDryRunRow func(externalID, spentOnISO string, amount float64, purpose, description string)
}

// CreditOptions configures importing positive Revolut lines as bank_credit_imports (omzet).
// Rows whose amount exactly matches LunchkraamAmountEUR and/or AvondetenAmountEUR (>0) get purpose from that match.
// Other positive inflows use Purpose and GuessPurposeByTime (same rules as debit import / shop_expenses).
type CreditOptions struct {
	Purpose              string // lunchkraam | avondeten; default when GuessPurposeByTime is false, or fallback for time windows
	GuessPurposeByTime   bool   // if true, infer lunchkraam vs avondeten from CompletedDate (Amsterdam) for non-standard amounts
	Currency             string
	SkipTypesCSV         string
	CompletedOnly        bool
	FingerprintMissingID bool
	CreatedBy            *int64
	DryRun               bool
	LunchkraamAmountEUR  float64 // e.g. 15; 0 = do not match this amount
	AvondetenAmountEUR   float64 // e.g. 10; 0 = do not match this amount
	// ExcludeCreditExternalIDs skips by full stored external_id (includes "credit:" prefix).
	ExcludeCreditExternalIDs map[string]struct{}
	// CreditPurposeOverrides sets waarvoor per full credit external_id (after "credit:" prefix), only for imported credits.
	CreditPurposeOverrides map[string]string
	OnDryRunCreditRow      func(externalID, receivedISO string, amount float64, purpose, description string)
}

// SkipReasonCounts explains non-imported rows for one import pass (debits or credits).
type SkipReasonCounts struct {
	FilterNotCompleted     int `json:"filter_not_completed"`
	FilterCurrencyMismatch int `json:"filter_currency_mismatch"`
	FilterTypeSkipped      int `json:"filter_type_skipped"`
	NotDebit               int `json:"not_debit"`                      // amount ≥ 0 (not an outflow line)
	NotCredit              int `json:"not_credit"`                     // amount ≤ 0 (not an inflow line)
	AmountNotStandard      int `json:"amount_not_standard_card_price"` // legacy: credit path no longer skips for this; kept for JSON stability
	MissingExternalID      int `json:"missing_external_id"`
	UserExcluded           int `json:"user_excluded"`
	Other                  int `json:"other"` // unexpected classifier; should stay zero
}

// Total returns the sum of all skip counters (must equal Result.Skipped for that pass).
func (s SkipReasonCounts) Total() int {
	return s.FilterNotCompleted + s.FilterCurrencyMismatch + s.FilterTypeSkipped +
		s.NotDebit + s.NotCredit + s.AmountNotStandard + s.MissingExternalID + s.UserExcluded + s.Other
}

// Result is returned after scanning the CSV (and optionally writing to the DB).
type Result struct {
	Imported      int
	Skipped       int
	PendingReview int // rows flagged for duplicate review instead of imported
	DryRun        bool
	SkipReasons   SkipReasonCounts
	// CreditsLunchkraam / CreditsAvondeten are set only by ImportCreditRows.
	CreditsLunchkraam int
	CreditsAvondeten  int
	// CreditsInferredNonStandard counts positive inflows booked as omzet without an exact standard card-amount match.
	CreditsInferredNonStandard int
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

// RowFilterOutcome returns whether the row passes global filters and, if not, a stable reason code.
func RowFilterOutcome(row revolutcsv.Row, currency string, skip map[string]struct{}, completedOnly bool) (ok bool, reason string) {
	if completedOnly {
		st := strings.TrimSpace(strings.ToUpper(row.State))
		if st != "" && !isCompletedState(st) {
			return false, "filter_not_completed"
		}
	}
	cur := strings.TrimSpace(strings.ToUpper(row.Currency))
	if currency != "" {
		if cur != "" && cur != strings.ToUpper(strings.TrimSpace(currency)) {
			return false, "filter_currency_mismatch"
		}
	}
	typ := strings.TrimSpace(strings.ToUpper(row.Type))
	if typ != "" {
		if _, ok := skip[typ]; ok {
			return false, "filter_type_skipped"
		}
	}
	return true, ""
}

func incSkipReason(sr *SkipReasonCounts, reason string) {
	switch reason {
	case "filter_not_completed":
		sr.FilterNotCompleted++
	case "filter_currency_mismatch":
		sr.FilterCurrencyMismatch++
	case "filter_type_skipped":
		sr.FilterTypeSkipped++
	case "not_debit":
		sr.NotDebit++
	case "not_credit":
		sr.NotCredit++
	case "amount_not_standard_card_price":
		sr.AmountNotStandard++
	case "missing_external_id":
		sr.MissingExternalID++
	case "user_excluded":
		sr.UserExcluded++
	default:
		sr.Other++
	}
}

// RowPassesFilters applies currency, type-skip, and completed-state filters.
func RowPassesFilters(row revolutcsv.Row, currency string, skip map[string]struct{}, completedOnly bool) bool {
	ok, _ := RowFilterOutcome(row, currency, skip, completedOnly)
	return ok
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

// NormalizeShopExpensePurpose returns lunchkraam or avondeten when s is a valid purpose label.
func NormalizeShopExpensePurpose(s string) (string, bool) {
	s = strings.TrimSpace(strings.ToLower(s))
	if s == "lunchkraam" || s == "avondeten" {
		return s, true
	}
	return "", false
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
		c, err := classifyDebitRow(ctx, st, row, o, skip, loc)
		if err != nil {
			return res, err
		}
		if c.Skip {
			res.Skipped++
			incSkipReason(&res.SkipReasons, c.SkipReason)
			continue
		}
		if o.DryRun {
			if c.PendingReview {
				res.PendingReview++
				continue
			}
			if c.NewOrUpdate {
				if o.OnDryRunRow != nil {
					o.OnDryRunRow(c.ExtID, c.SpentOn.Format("2006-01-02"), c.Amt, c.Purpose, c.Desc)
				}
				res.Imported++
			}
			continue
		}
		if c.PendingReview {
			if _, err := st.InsertPendingImportReview(ctx, c.Amt, c.SpentOn, c.Desc, c.Purpose, store.ShopExpenseSourceRevolut, c.ExtID, c.PendingMatchedManualID, o.CreatedBy); err != nil {
				return res, fmt.Errorf("pending review %s: %w", c.ExtID, err)
			}
			res.PendingReview++
			continue
		}
		if _, err := st.UpsertImportedShopExpense(ctx, store.ShopExpenseSourceRevolut, c.ExtID, o.CreatedBy, c.Amt, c.SpentOn, c.Desc, c.Purpose); err != nil {
			return res, fmt.Errorf("upsert %s: %w", c.ExtID, err)
		}
		res.Imported++
	}
	if res.Skipped != res.SkipReasons.Total() {
		return res, fmt.Errorf("interne fout: uitgaven skipped=%d vs redenen som=%d", res.Skipped, res.SkipReasons.Total())
	}
	return res, nil
}

// ImportCreditRows upserts positive amounts into bank_credit_imports (omzet): exact standard amounts and other inflows (purpose from time/default).
func ImportCreditRows(ctx context.Context, st *store.Store, rows []revolutcsv.Row, o CreditOptions) (Result, error) {
	if o.Purpose != "lunchkraam" && o.Purpose != "avondeten" {
		return Result{}, fmt.Errorf("ongeldig doel %q", o.Purpose)
	}
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
		c := classifyCreditRow(row, o, skip, loc)
		if c.Skip {
			res.Skipped++
			incSkipReason(&res.SkipReasons, c.SkipReason)
			continue
		}
		if o.DryRun {
			if o.OnDryRunCreditRow != nil {
				o.OnDryRunCreditRow(c.ExtID, c.ReceivedOn.Format("2006-01-02"), c.Amt, c.Purpose, c.Desc)
			}
			res.Imported++
			if c.Purpose == "lunchkraam" {
				res.CreditsLunchkraam++
			} else if c.Purpose == "avondeten" {
				res.CreditsAvondeten++
			}
			if !c.MatchedStandardCardAmount {
				res.CreditsInferredNonStandard++
			}
			continue
		}
		if err := st.UpsertImportedBankCredit(ctx, store.BankCreditSourceRevolut, c.ExtID, o.CreatedBy, c.Amt, c.ReceivedOn, c.Desc, c.Purpose); err != nil {
			return res, fmt.Errorf("upsert credit %s: %w", c.ExtID, err)
		}
		res.Imported++
		if c.Purpose == "lunchkraam" {
			res.CreditsLunchkraam++
		} else if c.Purpose == "avondeten" {
			res.CreditsAvondeten++
		}
		if !c.MatchedStandardCardAmount {
			res.CreditsInferredNonStandard++
		}
	}
	if res.Skipped != res.SkipReasons.Total() {
		return res, fmt.Errorf("interne fout: inkomsten skipped=%d vs redenen som=%d", res.Skipped, res.SkipReasons.Total())
	}
	return res, nil
}

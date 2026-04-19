package revolutimport

import (
	"context"
	"fmt"
	"strings"
	"time"

	"lunchkraam/internal/revolutcsv"
	"lunchkraam/internal/store"
)

// debitClass is the planned handling for one row on the debit (shop_expense) path.
type debitClass struct {
	Skip       bool
	SkipReason string

	PendingReview bool
	// PendingMatchedManualID is set when PendingReview (manual shop_expense id to pair in pending_import_reviews).
	PendingMatchedManualID int64
	NewOrUpdate            bool
	UpdateExisting         bool

	ExtID   string
	Amt     float64
	SpentOn time.Time
	Desc    string
	Purpose string
}

// creditClass is the planned handling for one row on the credit (bank omzet) path.
type creditClass struct {
	Skip       bool
	SkipReason string

	Import bool
	// MatchedStandardCardAmount is true when purpose came from creditPurposeForAmount (exact configured lunch/avond price).
	MatchedStandardCardAmount bool

	ExtID      string // includes "credit:" prefix for rows that will be imported (when not Skip)
	Amt        float64
	ReceivedOn time.Time
	Desc       string
	Purpose    string // lunchkraam | avondeten
}

func classifyDebitRow(
	ctx context.Context,
	st *store.Store,
	row revolutcsv.Row,
	o Options,
	skipTypes map[string]struct{},
	loc *time.Location,
) (debitClass, error) {
	var z debitClass
	if pass, why := RowFilterOutcome(row, o.Currency, skipTypes, o.CompletedOnly); !pass {
		z.Skip = true
		z.SkipReason = why
		return z, nil
	}
	if row.AmountEUR >= 0 {
		z.Skip = true
		z.SkipReason = "not_debit"
		return z, nil
	}
	amt := -row.AmountEUR
	extID := strings.TrimSpace(row.ExternalID)
	if extID == "" {
		if !o.FingerprintMissingID {
			z.Skip = true
			z.SkipReason = "missing_external_id"
			return z, nil
		}
		extID = revolutcsv.FingerprintExternalID(row.CompletedDate, row.AmountEUR, row.Description, row.Type)
	}
	if o.ExcludeDebitExternalIDs != nil {
		if _, excluded := o.ExcludeDebitExternalIDs[extID]; excluded {
			z.Skip = true
			z.SkipReason = "user_excluded"
			return z, nil
		}
	}
	spentOn := SpentOnDateAmsterdam(row.CompletedDate, loc)
	desc := BuildExpenseDescription(row)
	purpose := o.Purpose
	if o.GuessPurposeByTime {
		purpose = DebitPurposeFromCompletedTime(row.CompletedDate, loc, o.Purpose)
	}
	if o.DebitPurposeOverrides != nil {
		if p, ok := o.DebitPurposeOverrides[extID]; ok {
			if np, ok2 := NormalizeShopExpensePurpose(p); ok2 {
				purpose = np
			}
		}
	}
	z.ExtID = extID
	z.Amt = amt
	z.SpentOn = spentOn
	z.Desc = desc
	z.Purpose = purpose

	if st == nil {
		z.NewOrUpdate = true
		return z, nil
	}
	alreadyImported, err := st.ShopExpenseExistsBySourceAndExternalID(ctx, store.ShopExpenseSourceRevolut, extID)
	if err != nil {
		return z, fmt.Errorf("exists check %s: %w", extID, err)
	}
	if alreadyImported {
		z.NewOrUpdate = true
		z.UpdateExisting = true
		return z, nil
	}
	matches, err := st.FindMatchingManualExpenses(ctx, amt, spentOn)
	if err != nil {
		return z, fmt.Errorf("duplicate check %s: %w", extID, err)
	}
	if len(matches) > 0 {
		z.PendingReview = true
		z.PendingMatchedManualID = matches[0].ID
		return z, nil
	}
	z.NewOrUpdate = true
	return z, nil
}

func classifyCreditRow(
	row revolutcsv.Row,
	o CreditOptions,
	skipTypes map[string]struct{},
	loc *time.Location,
) creditClass {
	var z creditClass
	if pass, why := RowFilterOutcome(row, o.Currency, skipTypes, o.CompletedOnly); !pass {
		z.Skip = true
		z.SkipReason = why
		return z
	}
	if row.AmountEUR <= 0 {
		z.Skip = true
		z.SkipReason = "not_credit"
		return z
	}
	amt := row.AmountEUR
	rawExt := strings.TrimSpace(row.ExternalID)
	if rawExt == "" {
		if !o.FingerprintMissingID {
			z.Skip = true
			z.SkipReason = "missing_external_id"
			return z
		}
		rawExt = revolutcsv.FingerprintExternalID(row.CompletedDate, row.AmountEUR, row.Description, row.Type)
	}
	extID := "credit:" + rawExt
	if o.ExcludeCreditExternalIDs != nil {
		if _, excluded := o.ExcludeCreditExternalIDs[extID]; excluded {
			z.Skip = true
			z.SkipReason = "user_excluded"
			return z
		}
	}
	receivedOn := SpentOnDateAmsterdam(row.CompletedDate, loc)
	desc := BuildExpenseDescription(row)

	// Explicit purpose from user (import): allow any positive inflow amount.
	if o.CreditPurposeOverrides != nil {
		if p, ok := o.CreditPurposeOverrides[extID]; ok {
			if np, ok2 := NormalizeShopExpensePurpose(p); ok2 {
				z.Import = true
				z.MatchedStandardCardAmount = false
				z.ExtID = extID
				z.Amt = amt
				z.ReceivedOn = receivedOn
				z.Desc = desc
				z.Purpose = np
				return z
			}
		}
	}

	purpose, ok := creditPurposeForAmount(amt, o.LunchkraamAmountEUR, o.AvondetenAmountEUR)
	if ok {
		z.Import = true
		z.MatchedStandardCardAmount = true
		z.ExtID = extID
		z.Amt = amt
		z.ReceivedOn = receivedOn
		z.Desc = desc
		z.Purpose = purpose
		return z
	}

	inferred := o.Purpose
	if o.GuessPurposeByTime {
		inferred = DebitPurposeFromCompletedTime(row.CompletedDate, loc, o.Purpose)
	}
	z.Import = true
	z.MatchedStandardCardAmount = false
	z.Skip = false
	z.ExtID = extID
	z.Amt = amt
	z.ReceivedOn = receivedOn
	z.Desc = desc
	z.Purpose = inferred
	return z
}

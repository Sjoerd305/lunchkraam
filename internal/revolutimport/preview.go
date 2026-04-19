package revolutimport

import (
	"context"
	"fmt"
	"time"

	"lunchkraam/internal/revolutcsv"
	"lunchkraam/internal/store"
)

// PreviewBranch describes one side (debit or credit) of a CSV row for UI review.
type PreviewBranch struct {
	Outcome    string `json:"outcome"`
	LabelNL    string `json:"label_nl"`
	Selectable bool   `json:"selectable"`
	RowKey     string `json:"row_key,omitempty"`
	// Purpose is lunchkraam|avondeten when Selectable (planned waarvoor for import).
	Purpose string `json:"purpose,omitempty"`
}

// PreviewRow is one CSV data row plus planned import actions.
type PreviewRow struct {
	Line        int           `json:"line"`
	CompletedAt string        `json:"completed_at"`
	AmountEUR   float64       `json:"amount_eur"`
	Description string        `json:"description"`
	Type        string        `json:"type"`
	State       string        `json:"state"`
	Currency    string        `json:"currency"`
	ExternalRaw string        `json:"external_id_raw"`
	Debit       PreviewBranch `json:"debit"`
	Credit      PreviewBranch `json:"credit"`
}

func debitPreviewBranch(d debitClass) PreviewBranch {
	if d.Skip {
		return PreviewBranch{
			Outcome:    d.SkipReason,
			LabelNL:    skipReasonLabelNL(d.SkipReason, true),
			Selectable: false,
		}
	}
	if d.PendingReview {
		return PreviewBranch{
			Outcome:    "debit_pending_review",
			LabelNL:    "Mogelijke dubbele met handmatige uitgave — komt in de controlelijst.",
			Selectable: true,
			RowKey:     d.ExtID,
			Purpose:    d.Purpose,
		}
	}
	if d.NewOrUpdate && d.UpdateExisting {
		return PreviewBranch{
			Outcome:    "debit_import_update",
			LabelNL:    "Bestaande Revolut-uitgave wordt bijgewerkt.",
			Selectable: true,
			RowKey:     d.ExtID,
			Purpose:    d.Purpose,
		}
	}
	if d.NewOrUpdate {
		return PreviewBranch{
			Outcome:    "debit_import_new",
			LabelNL:    "Nieuwe uitgave (Revolut) in Boekingen.",
			Selectable: true,
			RowKey:     d.ExtID,
			Purpose:    d.Purpose,
		}
	}
	return PreviewBranch{Outcome: "debit_none", LabelNL: "Geen actie.", Selectable: false}
}

func creditPreviewBranch(c creditClass, creditsEnabled bool) PreviewBranch {
	if !creditsEnabled {
		return PreviewBranch{
			Outcome:    "credit_import_disabled",
			LabelNL:    "Inkomsten-importeren staat uit.",
			Selectable: false,
		}
	}
	if c.Skip {
		return PreviewBranch{
			Outcome:    c.SkipReason,
			LabelNL:    skipReasonLabelNL(c.SkipReason, false),
			Selectable: false,
		}
	}
	if !c.MatchedStandardCardAmount {
		if c.Purpose == "lunchkraam" {
			return PreviewBranch{
				Outcome:    "credit_import_lunchkraam_inferred",
				LabelNL:    "Telt als lunchkraam-omzet (bankimport; bedrag wijkt af van ingestelde kaartprijs — doel via tijdvenster of standaard-doel, aanpasbaar hieronder).",
				Selectable: true,
				RowKey:     c.ExtID,
				Purpose:    c.Purpose,
			}
		}
		return PreviewBranch{
			Outcome:    "credit_import_avondeten_inferred",
			LabelNL:    "Telt als avondeten-omzet (bankimport; bedrag wijkt af van ingestelde kaartprijs — doel via tijdvenster of standaard-doel, aanpasbaar hieronder).",
			Selectable: true,
			RowKey:     c.ExtID,
			Purpose:    c.Purpose,
		}
	}
	if c.Purpose == "lunchkraam" {
		return PreviewBranch{
			Outcome:    "credit_import_lunchkraam",
			LabelNL:    "Telt als lunchkraam-omzet (bankimport, exact lunchbedrag).",
			Selectable: true,
			RowKey:     c.ExtID,
			Purpose:    c.Purpose,
		}
	}
	return PreviewBranch{
		Outcome:    "credit_import_avondeten",
		LabelNL:    "Telt als avondeten-omzet (bankimport, exact avondetenbedrag).",
		Selectable: true,
		RowKey:     c.ExtID,
		Purpose:    c.Purpose,
	}
}

func skipReasonLabelNL(code string, debitSide bool) string {
	switch code {
	case "filter_not_completed":
		return "Niet voltooid of geannuleerd (filter)."
	case "filter_currency_mismatch":
		return "Andere valuta dan filter."
	case "filter_type_skipped":
		return "Transactietype wordt overgeslagen."
	case "not_debit":
		return "Geen afschrijving (bedrag ≥ 0)."
	case "not_credit":
		return "Geen te importeren ontvangst (bedrag ≤ 0)."
	case "amount_not_standard_card_price":
		return "Positief maar niet exact het ingestelde kaartbedrag."
	case "missing_external_id":
		return "Geen transactie-ID en vingerafdruk staat uit."
	case "user_excluded":
		return "Door jou uitgesloten bij import."
	default:
		if debitSide {
			return "Uitgaven: overgeslagen."
		}
		return "Inkomsten: overgeslagen."
	}
}

// BuildRevolutImportPreview returns per-row plans and aggregate counters (same rules as import dry-run).
func BuildRevolutImportPreview(
	ctx context.Context,
	st *store.Store,
	rows []revolutcsv.Row,
	debitOpts Options,
	creditOpts CreditOptions,
	runCredits bool,
) ([]PreviewRow, Result, Result, error) {
	if st == nil {
		return nil, Result{}, Result{}, fmt.Errorf("preview vereist database")
	}
	loc, err := time.LoadLocation(TZ)
	if err != nil {
		return nil, Result{}, Result{}, err
	}
	skipDebit := ParseSkipTypes(debitOpts.SkipTypesCSV)
	skipCredit := ParseSkipTypes(creditOpts.SkipTypesCSV)

	var debitRes, creditRes Result
	debitRes.DryRun = true
	creditRes.DryRun = true

	out := make([]PreviewRow, 0, len(rows))
	for i, row := range rows {
		dClass, err := classifyDebitRow(ctx, st, row, debitOpts, skipDebit, loc)
		if err != nil {
			return nil, Result{}, Result{}, err
		}
		if dClass.Skip {
			debitRes.Skipped++
			incSkipReason(&debitRes.SkipReasons, dClass.SkipReason)
		} else if dClass.PendingReview {
			debitRes.PendingReview++
		} else if dClass.NewOrUpdate {
			debitRes.Imported++
		}

		var cClass creditClass
		if runCredits {
			cClass = classifyCreditRow(row, creditOpts, skipCredit, loc)
			if cClass.Skip {
				creditRes.Skipped++
				incSkipReason(&creditRes.SkipReasons, cClass.SkipReason)
			} else {
				creditRes.Imported++
				if cClass.Purpose == "lunchkraam" {
					creditRes.CreditsLunchkraam++
				} else if cClass.Purpose == "avondeten" {
					creditRes.CreditsAvondeten++
				}
				if !cClass.MatchedStandardCardAmount {
					creditRes.CreditsInferredNonStandard++
				}
			}
		}

		out = append(out, PreviewRow{
			Line:        i + 1,
			CompletedAt: row.CompletedDate.UTC().Format(time.RFC3339),
			AmountEUR:   row.AmountEUR,
			Description: row.Description,
			Type:        row.Type,
			State:       row.State,
			Currency:    row.Currency,
			ExternalRaw: row.ExternalID,
			Debit:       debitPreviewBranch(dClass),
			Credit:      creditPreviewBranch(cClass, runCredits),
		})
	}

	if debitRes.Skipped != debitRes.SkipReasons.Total() {
		return nil, Result{}, Result{}, fmt.Errorf("interne fout debit preview skipped=%d reasons=%d", debitRes.Skipped, debitRes.SkipReasons.Total())
	}
	if runCredits && creditRes.Skipped != creditRes.SkipReasons.Total() {
		return nil, Result{}, Result{}, fmt.Errorf("interne fout credit preview skipped=%d reasons=%d", creditRes.Skipped, creditRes.SkipReasons.Total())
	}
	return out, debitRes, creditRes, nil
}

package handlers

import (
	"log/slog"
	"net/http"

	"lunchkraam/internal/auth"
	"lunchkraam/internal/httpx"
	"lunchkraam/internal/revolutcsv"
	"lunchkraam/internal/revolutimport"
)

// APIShopExpensesRevolutPreview parses the same form as import and returns per-row plans (no DB writes).
func (d *Deps) APIShopExpensesRevolutPreview(w http.ResponseWriter, r *http.Request) {
	u := auth.MustUserFromContext(r.Context())
	uid := u.ID

	rows, ok := readRevolutShopExpenseCSV(w, r, "revolut preview: csv parse")
	if !ok {
		return
	}

	purpose, ok := parseRevolutDefaultPurpose(r)
	if !ok {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_purpose", "Doel moet lunchkraam of avondeten zijn.")
		return
	}

	ui := parseRevolutCommonUIForm(r)

	debitOpts := revolutimport.Options{
		Purpose:              purpose,
		GuessPurposeByTime:   ui.GuessPurposeByTime,
		Currency:             ui.Currency,
		SkipTypesCSV:         ui.SkipTypes,
		CompletedOnly:        ui.CompletedOnly,
		FingerprintMissingID: ui.Fingerprint,
		CreatedBy:            &uid,
		DryRun:               true,
	}

	co := revolutimport.CreditOptions{
		Purpose:              purpose,
		GuessPurposeByTime:   ui.GuessPurposeByTime,
		Currency:             ui.Currency,
		SkipTypesCSV:         ui.SkipTypes,
		CompletedOnly:        ui.CompletedOnly,
		FingerprintMissingID: ui.Fingerprint,
		CreatedBy:            &uid,
		DryRun:               true,
		LunchkraamAmountEUR:  ui.LunchCreditEUR,
		AvondetenAmountEUR:   ui.AvoCreditEUR,
	}

	if !validateRevolutCreditImportAmounts(ui.ImportCredits, ui.LunchCreditEUR, ui.AvoCreditEUR) {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_credit_amounts", "Voor inkomsten: vul minstens één positief bedrag in (lunch of avondeten), of schakel inkomsten uit.")
		return
	}

	previewRows, debitRes, creditRes, err := revolutimport.BuildRevolutImportPreview(
		r.Context(), d.Store, rows, debitOpts, co, ui.ImportCredits,
	)
	if err != nil {
		slog.ErrorContext(r.Context(), "revolut preview: build", slog.Any("err", err))
		httpx.JSONError(w, http.StatusBadRequest, "preview_failed", "Voorbeeld kon niet worden opgebouwd.")
		return
	}

	writeShopRevolutPreviewJSON(w, previewRows, debitRes, creditRes, ui.ImportCredits)
}

// APIShopExpensesRevolutImport accepts multipart/form-data: file (CSV), purpose, optional filters.
// Registered under /api/admin/... and /api/operator/... (same handler).
func (d *Deps) APIShopExpensesRevolutImport(w http.ResponseWriter, r *http.Request) {
	u := auth.MustUserFromContext(r.Context())
	uid := u.ID

	rows, ok := readRevolutShopExpenseCSV(w, r, "revolut shop expense import: csv parse")
	if !ok {
		return
	}

	purpose, ok := parseRevolutDefaultPurpose(r)
	if !ok {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_purpose", "Doel moet lunchkraam of avondeten zijn.")
		return
	}

	ui := parseRevolutCommonUIForm(r)
	dryRun := formTruthy(r.FormValue("dry_run"))

	exDebit, exCredit, exErr := parseRevolutExcludeMaps(r)
	if exErr != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_exclude_json", "exclude_json is geen geldige JSON.")
		return
	}
	purDebit, purCredit, purErr := parsePurposeOverridesMaps(r)
	if purErr != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_purpose_overrides", "purpose_overrides_json is ongeldig of bevat een onbekend doel.")
		return
	}

	debitOpts := revolutimport.Options{
		Purpose:                 purpose,
		GuessPurposeByTime:      ui.GuessPurposeByTime,
		Currency:                ui.Currency,
		SkipTypesCSV:            ui.SkipTypes,
		CompletedOnly:           ui.CompletedOnly,
		FingerprintMissingID:    ui.Fingerprint,
		CreatedBy:               &uid,
		DryRun:                  dryRun,
		ExcludeDebitExternalIDs: exDebit,
		DebitPurposeOverrides:   purDebit,
	}
	if len(exDebit) == 0 {
		debitOpts.ExcludeDebitExternalIDs = nil
	}

	debitRes, err := revolutimport.ImportDebitRows(r.Context(), d.Store, rows, debitOpts)
	if err != nil {
		slog.ErrorContext(r.Context(), "revolut shop expense import: debit rows", slog.Any("err", err))
		httpx.JSONError(w, http.StatusBadRequest, "import_failed", "Uitgaven-importeren mislukt. Controleer het CSV-bestand of probeer opnieuw.")
		return
	}

	creditRes := revolutimport.Result{DryRun: dryRun}
	if ui.ImportCredits {
		if !validateRevolutCreditImportAmounts(true, ui.LunchCreditEUR, ui.AvoCreditEUR) {
			httpx.JSONError(w, http.StatusBadRequest, "invalid_credit_amounts", "Voor inkomsten: vul minstens één positief bedrag in (lunch of avondeten), of schakel inkomsten uit.")
			return
		}
		co := revolutimport.CreditOptions{
			Purpose:                  purpose,
			GuessPurposeByTime:       ui.GuessPurposeByTime,
			Currency:                 ui.Currency,
			SkipTypesCSV:             ui.SkipTypes,
			CompletedOnly:            ui.CompletedOnly,
			FingerprintMissingID:     ui.Fingerprint,
			CreatedBy:                &uid,
			DryRun:                   dryRun,
			LunchkraamAmountEUR:      ui.LunchCreditEUR,
			AvondetenAmountEUR:       ui.AvoCreditEUR,
			ExcludeCreditExternalIDs: exCredit,
			CreditPurposeOverrides:   purCredit,
		}
		if len(exCredit) == 0 {
			co.ExcludeCreditExternalIDs = nil
		}

		var cerr error
		creditRes, cerr = revolutimport.ImportCreditRows(r.Context(), d.Store, rows, co)
		if cerr != nil {
			slog.ErrorContext(r.Context(), "revolut shop expense import: credit rows", slog.Any("err", cerr))
			httpx.JSONError(w, http.StatusBadRequest, "import_failed", "Inkomsten-importeren mislukt. Controleer de bedragen (standaard €15 / €10) of het CSV-bestand.")
			return
		}
	}

	if !dryRun {
		if bal, asOf, ok := revolutcsv.LatestEURStatementBalance(rows); ok {
			if err := d.Store.UpsertRevolutBalanceSnapshot(r.Context(), bal, asOf); err != nil {
				slog.WarnContext(r.Context(), "revolut balance snapshot upsert after import", slog.Any("err", err))
			}
		}
	}

	writeShopRevolutImportJSON(w, debitRes, creditRes, ui.ImportCredits, dryRun)
}

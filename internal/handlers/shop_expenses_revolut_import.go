package handlers

import (
	"bytes"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"

	"lunchkraam/internal/auth"
	"lunchkraam/internal/httpx"
	"lunchkraam/internal/revolutcsv"
	"lunchkraam/internal/revolutimport"
)

const maxRevolutCSVFormBytes = 8 << 20

func formTruthy(v string) bool {
	v = strings.TrimSpace(strings.ToLower(v))
	return v == "1" || v == "true" || v == "on" || v == "yes"
}

func parsePositiveFloatForm(s string, defaultVal float64) float64 {
	s = strings.TrimSpace(strings.ReplaceAll(s, ",", "."))
	if s == "" {
		return defaultVal
	}
	v, err := strconv.ParseFloat(s, 64)
	if err != nil || v < 0 {
		return defaultVal
	}
	return v
}

// APIShopExpensesRevolutImport accepts multipart/form-data: file (CSV), purpose, optional filters.
// Registered under /api/admin/... and /api/operator/... (same handler).
func (d *Deps) APIShopExpensesRevolutImport(w http.ResponseWriter, r *http.Request) {
	u := auth.MustUserFromContext(r.Context())
	uid := u.ID

	r.Body = http.MaxBytesReader(w, r.Body, maxRevolutCSVFormBytes)
	if err := r.ParseMultipartForm(maxRevolutCSVFormBytes); err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_upload", "Upload is ongeldig of te groot (max. 8 MB).")
		return
	}
	file, _, err := r.FormFile("file")
	if err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "missing_file", "Kies een CSV-bestand.")
		return
	}
	defer file.Close()

	raw, err := io.ReadAll(file)
	if err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_upload", "Bestand kon niet worden gelezen.")
		return
	}

	rows, err := revolutcsv.Parse(bytes.NewReader(raw))
	if err != nil {
		log.Printf("revolut shop expense import parse: %v", err)
		httpx.JSONError(w, http.StatusBadRequest, "import_failed", "CSV kon niet worden gelezen. Controleer het bestand.")
		return
	}

	purpose := strings.TrimSpace(strings.ToLower(r.FormValue("purpose")))
	if purpose == "" {
		purpose = "lunchkraam"
	}
	if purpose != "lunchkraam" && purpose != "avondeten" {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_purpose", "Doel moet lunchkraam of avondeten zijn.")
		return
	}

	currency := strings.TrimSpace(r.FormValue("currency"))
	skipTypes := r.FormValue("skip_types")
	fingerprint := formTruthy(r.FormValue("fingerprint_missing_id"))
	dryRun := formTruthy(r.FormValue("dry_run"))

	completedOnly := true
	if v := strings.TrimSpace(strings.ToLower(r.FormValue("completed_only"))); v == "0" || v == "false" || v == "no" || v == "off" {
		completedOnly = false
	}

	importCredits := formTruthy(r.FormValue("import_credits"))
	lunchCredit := parsePositiveFloatForm(r.FormValue("credit_lunch_eur"), 15)
	avoCredit := parsePositiveFloatForm(r.FormValue("credit_avondeten_eur"), 10)

	guessPurposeByTime := true
	switch strings.TrimSpace(strings.ToLower(r.FormValue("guess_purpose_by_time"))) {
	case "0", "false", "no", "off":
		guessPurposeByTime = false
	}

	debitOpts := revolutimport.Options{
		Purpose:              purpose,
		GuessPurposeByTime:   guessPurposeByTime,
		Currency:             currency,
		SkipTypesCSV:         skipTypes,
		CompletedOnly:        completedOnly,
		FingerprintMissingID: fingerprint,
		CreatedBy:            &uid,
		DryRun:               dryRun,
	}

	debitRes, err := revolutimport.ImportDebitRows(r.Context(), d.Store, rows, debitOpts)
	if err != nil {
		log.Printf("revolut debit import: %v", err)
		httpx.JSONError(w, http.StatusBadRequest, "import_failed", "Uitgaven-importeren mislukt. Controleer het CSV-bestand of probeer opnieuw.")
		return
	}

	creditRes := revolutimport.Result{DryRun: dryRun}
	if importCredits {
		if lunchCredit <= 0 && avoCredit <= 0 {
			httpx.JSONError(w, http.StatusBadRequest, "invalid_credit_amounts", "Voor inkomsten: vul minstens één positief bedrag in (lunch of avondeten), of schakel inkomsten uit.")
			return
		}
		co := revolutimport.CreditOptions{
			Currency:             currency,
			SkipTypesCSV:         skipTypes,
			CompletedOnly:        completedOnly,
			FingerprintMissingID: fingerprint,
			CreatedBy:            &uid,
			DryRun:               dryRun,
			LunchkraamAmountEUR:  lunchCredit,
			AvondetenAmountEUR:   avoCredit,
		}
		var cerr error
		creditRes, cerr = revolutimport.ImportCreditRows(r.Context(), d.Store, rows, co)
		if cerr != nil {
			log.Printf("revolut credit import: %v", cerr)
			httpx.JSONError(w, http.StatusBadRequest, "import_failed", "Inkomsten-importeren mislukt. Controleer de bedragen (standaard €15 / €10) of het CSV-bestand.")
			return
		}
	}

	if !dryRun {
		if bal, asOf, ok := revolutcsv.LatestEURStatementBalance(rows); ok {
			if err := d.Store.UpsertRevolutBalanceSnapshot(r.Context(), bal, asOf); err != nil {
				log.Printf("revolut balance snapshot: %v", err)
			}
		}
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"imported":               debitRes.Imported,
		"skipped":                debitRes.Skipped,
		"debits_imported":        debitRes.Imported,
		"debits_skipped":         debitRes.Skipped,
		"debits_pending_review":  debitRes.PendingReview,
		"credits_imported":       creditRes.Imported,
		"credits_skipped":        creditRes.Skipped,
		"credits_enabled":        importCredits,
		"dry_run":                dryRun,
	})
}

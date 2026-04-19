package handlers

import (
	"net/http"

	"lunchkraam/internal/httpx"
	"lunchkraam/internal/revolutimport"
)

func writeShopRevolutPreviewJSON(
	w http.ResponseWriter,
	previewRows []revolutimport.PreviewRow,
	debitRes, creditRes revolutimport.Result,
	importCredits bool,
) {
	httpx.JSON(w, http.StatusOK, map[string]any{
		"rows":                          previewRows,
		"debits_imported":               debitRes.Imported,
		"debits_skipped":                debitRes.Skipped,
		"debits_pending_review":         debitRes.PendingReview,
		"debit_skip_reasons":            debitRes.SkipReasons,
		"credits_imported":              creditRes.Imported,
		"credits_skipped":               creditRes.Skipped,
		"credits_enabled":               importCredits,
		"credit_skip_reasons":           creditRes.SkipReasons,
		"credits_imported_lunchkraam":   creditRes.CreditsLunchkraam,
		"credits_imported_avondeten":    creditRes.CreditsAvondeten,
		"credits_inferred_non_standard": creditRes.CreditsInferredNonStandard,
	})
}

func writeShopRevolutImportJSON(
	w http.ResponseWriter,
	debitRes, creditRes revolutimport.Result,
	importCredits, dryRun bool,
) {
	httpx.JSON(w, http.StatusOK, map[string]any{
		"imported":                      debitRes.Imported,
		"skipped":                       debitRes.Skipped,
		"debits_imported":               debitRes.Imported,
		"debits_skipped":                debitRes.Skipped,
		"debits_pending_review":         debitRes.PendingReview,
		"debit_skip_reasons":            debitRes.SkipReasons,
		"credits_imported":              creditRes.Imported,
		"credits_skipped":               creditRes.Skipped,
		"credits_enabled":               importCredits,
		"credit_skip_reasons":           creditRes.SkipReasons,
		"credits_imported_lunchkraam":   creditRes.CreditsLunchkraam,
		"credits_imported_avondeten":    creditRes.CreditsAvondeten,
		"credits_inferred_non_standard": creditRes.CreditsInferredNonStandard,
		"dry_run":                       dryRun,
	})
}

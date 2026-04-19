package handlers

import (
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"lunchkraam/internal/httpx"
	"lunchkraam/internal/store"
)

// APIPendingImportReviews lists all Revolut import rows flagged as possible duplicates.
func (d *Deps) APIPendingImportReviews(w http.ResponseWriter, r *http.Request) {
	reviews, err := d.Store.ListPendingImportReviews(r.Context())
	if err != nil {
		slog.ErrorContext(r.Context(), "list pending import reviews", slog.Any("err", err))
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Laden mislukt.")
		return
	}
	out := make([]map[string]any, 0, len(reviews))
	for i := range reviews {
		out = append(out, pendingReviewJSON(&reviews[i]))
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"reviews": out})
}

// APIPendingReviewMerge accepts the Revolut import and deletes the manual expense.
// Receipts are reassigned from the manual expense to the new Revolut expense.
func (d *Deps) APIPendingReviewMerge(w http.ResponseWriter, r *http.Request) {
	id, ok := parsePendingReviewID(r)
	if !ok {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_id", "Ongeldig review-id.")
		return
	}

	review, err := d.Store.DeletePendingImportReview(r.Context(), id)
	if err != nil {
		if httpx.RespondStoreNotFound(w, err, "Review niet gevonden.") {
			return
		}
		slog.ErrorContext(r.Context(), "delete pending import review", slog.Int64("review_id", id), slog.Any("err", err))
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Verwerken mislukt.")
		return
	}

	// Insert the Revolut row into shop_expenses.
	newExpense, err := d.Store.UpsertImportedShopExpense(
		r.Context(),
		review.Source, review.ExternalID, review.CreatedBy,
		review.AmountEUR, review.SpentOn, review.Description, review.Purpose,
	)
	if err != nil {
		slog.ErrorContext(r.Context(), "upsert merged shop expense from pending review",
			slog.String("external_id", review.ExternalID), slog.Any("err", err))
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Opslaan mislukt.")
		return
	}

	// Move receipts from the manual expense to the new Revolut expense.
	if err := d.Store.ReassignShopExpenseReceipts(r.Context(), review.MatchedExpenseID, newExpense.ID); err != nil {
		slog.WarnContext(r.Context(), "reassign shop expense receipts after merge",
			slog.Int64("from_expense_id", review.MatchedExpenseID), slog.Int64("to_expense_id", newExpense.ID), slog.Any("err", err))
	}

	// Delete the manual expense.
	if err := d.Store.DeleteShopExpense(r.Context(), review.MatchedExpenseID); err != nil && !errors.Is(err, store.ErrNotFound) {
		slog.WarnContext(r.Context(), "delete manual expense after merge",
			slog.Int64("expense_id", review.MatchedExpenseID), slog.Any("err", err))
	}

	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// APIPendingReviewDismiss discards the Revolut import row; the manual expense stays.
func (d *Deps) APIPendingReviewDismiss(w http.ResponseWriter, r *http.Request) {
	id, ok := parsePendingReviewID(r)
	if !ok {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_id", "Ongeldig review-id.")
		return
	}

	_, err := d.Store.DeletePendingImportReview(r.Context(), id)
	if err != nil {
		if httpx.RespondStoreNotFound(w, err, "Review niet gevonden.") {
			return
		}
		slog.ErrorContext(r.Context(), "dismiss pending import review", slog.Int64("review_id", id), slog.Any("err", err))
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Verwerken mislukt.")
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func parsePendingReviewID(r *http.Request) (int64, bool) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id < 1 {
		return 0, false
	}
	return id, true
}

func pendingReviewJSON(rv *store.PendingReviewWithMatch) map[string]any {
	return map[string]any{
		"id": rv.Review.ID,
		"revolut": map[string]any{
			"amount_eur":  rv.Review.AmountEUR,
			"spent_on":    rv.Review.SpentOn.UTC().Format("2006-01-02"),
			"description": rv.Review.Description,
			"purpose":     rv.Review.Purpose,
			"external_id": rv.Review.ExternalID,
		},
		"matched_manual": map[string]any{
			"id":               rv.MatchedExpense.ID,
			"amount_eur":       rv.MatchedExpense.AmountEUR,
			"spent_on":         rv.MatchedExpense.SpentOn.UTC().Format("2006-01-02"),
			"description":      rv.MatchedExpense.Description,
			"purpose":          rv.MatchedExpense.Purpose,
			"payment_channel":  rv.MatchedExpense.PaymentChannel,
			"source":           rv.MatchedExpense.Source,
		},
		"created_at": rv.Review.CreatedAt.UTC().Format(httpx.JSONTimeLayout),
	}
}

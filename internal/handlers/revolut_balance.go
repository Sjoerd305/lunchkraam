package handlers

import (
	"log/slog"
	"net/http"

	"lunchkraam/internal/httpx"
)

// APIRevolutBalance returns the EUR balance last captured from a Revolut CSV import (Saldo column).
func (d *Deps) APIRevolutBalance(w http.ResponseWriter, r *http.Request) {
	snap, err := d.Store.GetRevolutBalanceSnapshot(r.Context())
	if err != nil {
		slog.ErrorContext(r.Context(), "revolut balance snapshot get", slog.Any("err", err))
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Saldo kon niet worden geladen.")
		return
	}
	if snap == nil {
		httpx.JSON(w, http.StatusOK, map[string]any{
			"balance_eur":     nil,
			"statement_as_of": nil,
			"updated_at":      nil,
		})
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"balance_eur":     snap.BalanceEUR,
		"statement_as_of": snap.StatementAsOf,
		"updated_at":      snap.UpdatedAt,
	})
}

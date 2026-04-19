package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"lunchkraam/internal/auth"
	"lunchkraam/internal/httpx"
	"lunchkraam/internal/money"
	"lunchkraam/internal/store"
)

func parseFinanceCorrectionKind(s string) (string, bool) {
	switch strings.TrimSpace(strings.ToLower(s)) {
	case store.FinanceCorrectionKindRefundOutsideApp:
		return store.FinanceCorrectionKindRefundOutsideApp, true
	case store.FinanceCorrectionKindOtherBranchGuest:
		return store.FinanceCorrectionKindOtherBranchGuest, true
	case store.FinanceCorrectionKindInternalSettlement:
		return store.FinanceCorrectionKindInternalSettlement, true
	case store.FinanceCorrectionKindOther:
		return store.FinanceCorrectionKindOther, true
	default:
		return "", false
	}
}

func financeCorrectionJSON(c *store.FinanceCorrection) map[string]any {
	out := map[string]any{
		"id":            c.ID,
		"recorded_on":   c.RecordedOn.Format("2006-01-02"),
		"purpose":       c.Purpose,
		"kind":          c.Kind,
		"amount_eur":    c.AmountEUR,
		"description":   c.Description,
		"created_at":    c.CreatedAt.UTC().Format(httpx.JSONTimeLayout),
		"created_by_id": nil,
	}
	if c.CreatedBy != nil {
		out["created_by_id"] = *c.CreatedBy
	}
	return out
}

func (d *Deps) APIAdminFinanceCorrectionsList(w http.ResponseWriter, r *http.Request) {
	year, _ := parseSalesStatsYear(r)

	rows, err := d.Store.ListFinanceCorrectionsByYear(r.Context(), year)
	if err != nil {
		httpx.RespondInternalStoreError(w, r, "ListFinanceCorrectionsByYear", err)
		return
	}
	out := make([]map[string]any, 0, len(rows))
	for i := range rows {
		out = append(out, financeCorrectionJSON(&rows[i]))
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"year": year, "corrections": out})
}

func (d *Deps) APIAdminFinanceCorrectionCreate(w http.ResponseWriter, r *http.Request) {
	u := auth.MustUserFromContext(r.Context())
	var body struct {
		RecordedOn  string  `json:"recorded_on"`
		Purpose     string  `json:"purpose"`
		Kind        string  `json:"kind"`
		AmountEUR   float64 `json:"amount_eur"`
		Description string  `json:"description"`
	}
	if !httpx.ReadJSON(w, r, 1<<14, &body) {
		return
	}
	dateStr := strings.TrimSpace(body.RecordedOn)
	if dateStr == "" {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_date", "Datum (recorded_on) is verplicht.")
		return
	}
	t, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_date", "Ongeldige datum.")
		return
	}
	purpose, ok := parseShopExpensePurpose(body.Purpose)
	if !ok {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_purpose", "Doel moet lunchkraam of avondeten zijn.")
		return
	}
	kind, ok := parseFinanceCorrectionKind(body.Kind)
	if !ok {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_kind", "Ongeldig type correctie.")
		return
	}
	amount := money.RoundEUR(body.AmountEUR)
	if amount == 0 {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_amount", "Bedrag mag niet nul zijn.")
		return
	}
	c, err := d.Store.InsertFinanceCorrection(r.Context(), u.ID, t, purpose, kind, amount, body.Description)
	if err != nil {
		if msg := strings.TrimSpace(err.Error()); msg != "" && strings.Contains(strings.ToLower(msg), "omschrijving") {
			httpx.JSONError(w, http.StatusBadRequest, "invalid_description", msg)
			return
		}
		httpx.RespondInternalStoreError(w, r, "InsertFinanceCorrection", err)
		return
	}
	httpx.JSON(w, http.StatusCreated, financeCorrectionJSON(c))
}

func (d *Deps) APIAdminFinanceCorrectionDelete(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id < 1 {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_id", "Ongeldige correctie.")
		return
	}
	if err := d.Store.DeleteFinanceCorrection(r.Context(), id); err != nil {
		if httpx.RespondStoreNotFound(w, err, "Correctie niet gevonden.") {
			return
		}
		httpx.RespondInternalStoreError(w, r, "DeleteFinanceCorrection", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

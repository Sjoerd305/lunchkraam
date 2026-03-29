package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"tostikaart/internal/auth"
	"tostikaart/internal/httpx"
	"tostikaart/internal/store"
)

func parseShopExpenseAmount(s string) (float64, bool) {
	s = strings.TrimSpace(strings.ReplaceAll(s, ",", "."))
	if s == "" {
		return 0, false
	}
	v, err := strconv.ParseFloat(s, 64)
	if err != nil || v <= 0 {
		return 0, false
	}
	return v, true
}

func (d *Deps) APIAdminShopExpensesList(w http.ResponseWriter, r *http.Request) {
	year := time.Now().Year()
	if ys := strings.TrimSpace(r.URL.Query().Get("year")); ys != "" {
		if v, err := strconv.Atoi(ys); err == nil && v >= 2000 && v <= 2100 {
			year = v
		}
	}
	rows, err := d.Store.ListShopExpensesByYear(r.Context(), year)
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Databasefout.")
		return
	}
	out := make([]map[string]any, 0, len(rows))
	for _, e := range rows {
		out = append(out, map[string]any{
			"id":           e.ID,
			"amount_eur":   e.AmountEUR,
			"spent_on":     e.SpentOn.Format("2006-01-02"),
			"description":  e.Description,
			"created_at":   e.CreatedAt.UTC().Format("2006-01-02T15:04:05Z07:00"),
		})
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"year": year, "expenses": out})
}

func (d *Deps) APIAdminShopExpenseCreate(w http.ResponseWriter, r *http.Request) {
	u, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.JSONError(w, http.StatusUnauthorized, "unauthorized", "Niet ingelogd.")
		return
	}
	var body struct {
		AmountEUR   any    `json:"amount_eur"`
		SpentOn     string `json:"spent_on"`
		Description string `json:"description"`
	}
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<14))
	if err := dec.Decode(&body); err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_json", "Ongeldige aanvraag.")
		return
	}
	var amount float64
	switch v := body.AmountEUR.(type) {
	case float64:
		amount = v
	case string:
		var ok bool
		amount, ok = parseShopExpenseAmount(v)
		if !ok {
			httpx.JSONError(w, http.StatusBadRequest, "invalid_amount", "Ongeldig bedrag.")
			return
		}
	default:
		httpx.JSONError(w, http.StatusBadRequest, "invalid_amount", "Bedrag ontbreekt.")
		return
	}
	if amount <= 0 {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_amount", "Bedrag moet groter dan nul zijn.")
		return
	}
	spentOn := strings.TrimSpace(body.SpentOn)
	if spentOn == "" {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_date", "Datum (spent_on) is verplicht.")
		return
	}
	t, err := time.Parse("2006-01-02", spentOn)
	if err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_date", "Datum moet JJJJ-MM-DD zijn.")
		return
	}
	if y := t.Year(); y < 2000 || y > 2100 {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_date", "Jaar buiten bereik.")
		return
	}
	e, err := d.Store.InsertShopExpense(r.Context(), u.ID, amount, t, body.Description)
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Opslaan mislukt.")
		return
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{
		"id":           e.ID,
		"amount_eur":   e.AmountEUR,
		"spent_on":     e.SpentOn.Format("2006-01-02"),
		"description":  e.Description,
		"created_at":   e.CreatedAt.UTC().Format("2006-01-02T15:04:05Z07:00"),
	})
}

func (d *Deps) APIAdminShopExpenseDelete(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id < 1 {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_id", "Ongeldige uitgave.")
		return
	}
	err = d.Store.DeleteShopExpense(r.Context(), id)
	if err != nil {
		if err == store.ErrNotFound {
			httpx.JSONError(w, http.StatusNotFound, "not_found", "Uitgave niet gevonden.")
			return
		}
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Verwijderen mislukt.")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

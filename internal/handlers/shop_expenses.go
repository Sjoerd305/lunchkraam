package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"lunchkraam/internal/auth"
	"lunchkraam/internal/httpx"
	"lunchkraam/internal/store"
)

func parseShopExpensePurpose(s string) (string, bool) {
	s = strings.TrimSpace(strings.ToLower(s))
	switch s {
	case "lunchkraam", "avondeten":
		return s, true
	default:
		return "", false
	}
}

func parseShopExpenseMovement(s string) (string, bool) {
	s = strings.TrimSpace(strings.ToLower(s))
	switch s {
	case "", store.ShopExpenseMovementExpense:
		return store.ShopExpenseMovementExpense, true
	case store.ShopExpenseMovementCashIn:
		return store.ShopExpenseMovementCashIn, true
	default:
		return "", false
	}
}

// resolveShopExpensePaymentChannel maps API movement + optional payment_channel to DB values.
func resolveShopExpensePaymentChannel(movement, raw string) (string, bool) {
	if movement == store.ShopExpenseMovementCashIn {
		return store.ShopExpensePaymentKasBij, true
	}
	s := strings.TrimSpace(strings.ToLower(raw))
	switch s {
	case "", store.ShopExpensePaymentContant:
		return store.ShopExpensePaymentContant, true
	case store.ShopExpensePaymentDigitaal:
		return store.ShopExpensePaymentDigitaal, true
	default:
		return "", false
	}
}

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
		httpx.RespondInternalStoreError(w, r, "ListShopExpensesByYear", err)
		return
	}
	out := make([]map[string]any, 0, len(rows))
	for i := range rows {
		out = append(out, shopExpenseJSON(&rows[i]))
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"year": year, "expenses": out})
}

func (d *Deps) APIAdminShopExpenseCreate(w http.ResponseWriter, r *http.Request) {
	u := auth.MustUserFromContext(r.Context())
	var body struct {
		AmountEUR        any    `json:"amount_eur"`
		SpentOn          string `json:"spent_on"`
		Description      string `json:"description"`
		Purpose          string `json:"purpose"`
		Movement         string `json:"movement"`
		PaymentChannel   string `json:"payment_channel"`
	}
	if !httpx.ReadJSON(w, r, 1<<14, &body) {
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
	purpose, ok := parseShopExpensePurpose(body.Purpose)
	if !ok {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_purpose", "Doel moet lunchkraam of avondeten zijn.")
		return
	}
	movement, ok := parseShopExpenseMovement(body.Movement)
	if !ok {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_movement", "Soort is ongeldig (kies uitgave of contant bij).")
		return
	}
	signedAmount := amount
	if movement == store.ShopExpenseMovementCashIn {
		signedAmount = -amount
	}
	paymentChannel, ok := resolveShopExpensePaymentChannel(movement, body.PaymentChannel)
	if !ok {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_payment_channel", "Betaalmethode is ongeldig (kies contant of digitaal voor een uitgave).")
		return
	}
	e, err := d.Store.InsertShopExpense(r.Context(), u.ID, signedAmount, t, body.Description, purpose, paymentChannel)
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Opslaan mislukt.")
		return
	}
	httpx.JSON(w, http.StatusCreated, shopExpenseJSON(e))
}

func shopExpenseJSON(e *store.ShopExpense) map[string]any {
	return map[string]any{
		"id":               e.ID,
		"amount_eur":       e.AmountEUR,
		"spent_on":         e.SpentOn.Format("2006-01-02"),
		"description":      e.Description,
		"purpose":          e.Purpose,
		"payment_channel":  e.PaymentChannel,
		"created_at":       e.CreatedAt.UTC().Format(httpx.JSONTimeLayout),
		"source":           e.Source,
		"external_id":      e.ExternalID,
	}
}

// APIShopExpensePatch updates allowed fields on a shop expense (currently only purpose). Used for /api/admin and /api/operator.
func (d *Deps) APIShopExpensePatch(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id < 1 {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_id", "Ongeldige uitgave.")
		return
	}
	var body struct {
		Purpose string `json:"purpose"`
	}
	if !httpx.ReadJSON(w, r, 1<<14, &body) {
		return
	}
	purpose, ok := parseShopExpensePurpose(body.Purpose)
	if !ok {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_purpose", "Doel moet lunchkraam of avondeten zijn.")
		return
	}
	e, err := d.Store.UpdateShopExpensePurpose(r.Context(), id, purpose)
	if err != nil {
		if httpx.RespondStoreNotFound(w, err, "Uitgave niet gevonden.") {
			return
		}
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Bijwerken mislukt.")
		return
	}
	httpx.JSON(w, http.StatusOK, shopExpenseJSON(e))
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
		if httpx.RespondStoreNotFound(w, err, "Uitgave niet gevonden.") {
			return
		}
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Verwijderen mislukt.")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

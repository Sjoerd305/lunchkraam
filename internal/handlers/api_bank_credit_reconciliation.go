package handlers

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"lunchkraam/internal/auth"
	"lunchkraam/internal/httpx"
	"lunchkraam/internal/store"
)

func parseYearQueryBank(r *http.Request, def int) int {
	ys := strings.TrimSpace(r.URL.Query().Get("year"))
	if ys == "" {
		return def
	}
	v, err := strconv.Atoi(ys)
	if err != nil || v < 2000 || v > 2100 {
		return def
	}
	return v
}

// APIAdminBankCreditsUnmatched lists Revolut omzet lines not yet linked to a fulfilled card sale.
func (d *Deps) APIAdminBankCreditsUnmatched(w http.ResponseWriter, r *http.Request) {
	_ = auth.MustUserFromContext(r.Context())
	loc, locErr := time.LoadLocation("Europe/Amsterdam")
	y := time.Now().Year()
	if locErr == nil {
		y = time.Now().In(loc).Year()
	}
	year := parseYearQueryBank(r, y)
	rows, err := d.Store.ListBankCreditImportsUnmatched(r.Context(), year)
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Databasefout.")
		return
	}
	out := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		out = append(out, bankCreditListRowJSON(row))
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"year": year, "rows": out})
}

// APIAdminBankCreditsMatched lists Revolut omzet lines already linked to a fulfilled card sale.
func (d *Deps) APIAdminBankCreditsMatched(w http.ResponseWriter, r *http.Request) {
	_ = auth.MustUserFromContext(r.Context())
	loc, locErr := time.LoadLocation("Europe/Amsterdam")
	y := time.Now().Year()
	if locErr == nil {
		y = time.Now().In(loc).Year()
	}
	year := parseYearQueryBank(r, y)
	rows, err := d.Store.ListBankCreditImportsMatched(r.Context(), year)
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Databasefout.")
		return
	}
	out := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		out = append(out, bankCreditListRowJSON(row))
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"year": year, "rows": out})
}

// APIAdminBankCreditsWaived lists bank credits marked reconciled without a card sale.
func (d *Deps) APIAdminBankCreditsWaived(w http.ResponseWriter, r *http.Request) {
	_ = auth.MustUserFromContext(r.Context())
	loc, locErr := time.LoadLocation("Europe/Amsterdam")
	y := time.Now().Year()
	if locErr == nil {
		y = time.Now().In(loc).Year()
	}
	year := parseYearQueryBank(r, y)
	rows, err := d.Store.ListBankCreditImportsWaived(r.Context(), year)
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Databasefout.")
		return
	}
	out := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		out = append(out, bankCreditListRowJSON(row))
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"year": year, "rows": out})
}

func bankCreditListRowJSON(row store.BankCreditImportListRow) map[string]any {
	m := map[string]any{
		"id":                       row.ID,
		"amount_eur":               row.AmountEUR,
		"received_on":              row.ReceivedOn.Format("2006-01-02"),
		"description":              row.Description,
		"purpose":                  row.Purpose,
		"source":                   row.Source,
		"external_id":              row.ExternalID,
		"reconciliation_status":    row.ReconciliationStatus,
		"matched_card_request_id":  nil,
	}
	if row.MatchedCardRequestID != nil {
		m["matched_card_request_id"] = *row.MatchedCardRequestID
	}
	return m
}

// APIAdminBankCreditSuggestions returns likely fulfilled Tikkie card sales for a bank line.
func (d *Deps) APIAdminBankCreditSuggestions(w http.ResponseWriter, r *http.Request) {
	_ = auth.MustUserFromContext(r.Context())
	idStr := strings.TrimSpace(chi.URLParam(r, "id"))
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_id", "Ongeldige bankregel.")
		return
	}
	cands, err := d.Store.SuggestCardRequestsForBankCredit(r.Context(), id)
	if err != nil {
		switch {
		case errors.Is(err, store.ErrBankCreditNotFound):
			httpx.JSONError(w, http.StatusNotFound, "not_found", "Bankregel niet gevonden.")
		case errors.Is(err, store.ErrBankCreditNotOpen):
			httpx.JSONError(w, http.StatusConflict, "not_open", "Deze bankregel is niet meer open (al gekoppeld of afgehandeld).")
		default:
			httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Databasefout.")
		}
		return
	}
	out := make([]map[string]any, 0, len(cands))
	for _, c := range cands {
		out = append(out, bankCreditSuggestionCandidateJSON(c))
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"bank_credit_id": id, "candidates": out})
}

func bankCreditSuggestionCandidateJSON(c store.CardRequestMatchCandidate) map[string]any {
	return map[string]any{
		"card_request_id": c.CardRequestID,
		"fulfilled_at":    c.FulfilledAt.UTC().Format(time.RFC3339),
		"user_email":      c.UserEmail,
		"user_display":    c.UserName,
		"sale_price_eur":  c.SalePriceEUR,
		"kind":            c.Kind,
		"payment_method":  c.PaymentMethod,
	}
}

// APIAdminBankCreditMatchCandidates lists fulfilled Tikkie sales matching amount/purpose (no date window), split by digital vs physical card.
func (d *Deps) APIAdminBankCreditMatchCandidates(w http.ResponseWriter, r *http.Request) {
	_ = auth.MustUserFromContext(r.Context())
	idStr := strings.TrimSpace(chi.URLParam(r, "id"))
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_id", "Ongeldige bankregel.")
		return
	}
	online, physical, err := d.Store.ListManualMatchCardRequestsForBankCredit(r.Context(), id)
	if err != nil {
		switch {
		case errors.Is(err, store.ErrBankCreditNotFound):
			httpx.JSONError(w, http.StatusNotFound, "not_found", "Bankregel niet gevonden.")
		case errors.Is(err, store.ErrBankCreditNotOpen):
			httpx.JSONError(w, http.StatusConflict, "not_open", "Deze bankregel is niet meer open (al gekoppeld of afgehandeld).")
		default:
			httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Databasefout.")
		}
		return
	}
	digital := make([]map[string]any, 0, len(online))
	for _, c := range online {
		digital = append(digital, bankCreditSuggestionCandidateJSON(c))
	}
	phys := make([]map[string]any, 0, len(physical))
	for _, c := range physical {
		phys = append(phys, bankCreditSuggestionCandidateJSON(c))
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"bank_credit_id": id, "digital": digital, "physical": phys})
}

// APIAdminBankCreditMatch links a bank credit import to a fulfilled card_request (removes double-count in reports).
func (d *Deps) APIAdminBankCreditMatch(w http.ResponseWriter, r *http.Request) {
	_ = auth.MustUserFromContext(r.Context())
	idStr := strings.TrimSpace(chi.URLParam(r, "id"))
	bankID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || bankID <= 0 {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_id", "Ongeldige bankregel.")
		return
	}
	var body struct {
		CardRequestID int64 `json:"card_request_id"`
	}
	dec := json.NewDecoder(io.LimitReader(r.Body, 1<<14))
	if err := dec.Decode(&body); err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_json", "Ongeldige JSON.")
		return
	}
	if body.CardRequestID <= 0 {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_card_request", "card_request_id is verplicht.")
		return
	}
	if err := d.Store.LinkBankCreditToCardRequest(r.Context(), bankID, body.CardRequestID); err != nil {
		switch {
		case errors.Is(err, store.ErrBankCreditNotFound):
			httpx.JSONError(w, http.StatusNotFound, "not_found", "Bankregel niet gevonden.")
		case errors.Is(err, store.ErrBankCreditNotOpen):
			httpx.JSONError(w, http.StatusConflict, "not_open", "Deze bankregel is niet meer open (al gekoppeld of afgehandeld).")
		case errors.Is(err, store.ErrBankCreditAlreadyMatched):
			httpx.JSONError(w, http.StatusConflict, "already_matched", "Deze bankregel is al afgestemd.")
		case errors.Is(err, store.ErrCardRequestNotFound):
			httpx.JSONError(w, http.StatusNotFound, "card_not_found", "Kaartaanvraag niet gevonden.")
		case errors.Is(err, store.ErrCardRequestNotFulfilled):
			httpx.JSONError(w, http.StatusBadRequest, "not_fulfilled", "Alleen vervulde kaartverkopen kunnen gekoppeld worden.")
		case errors.Is(err, store.ErrCardRequestAlreadyMatched):
			httpx.JSONError(w, http.StatusConflict, "card_already_matched", "Deze kaartverkoop is al gekoppeld.")
		case errors.Is(err, store.ErrRevenueMatchMismatch):
			httpx.JSONError(w, http.StatusBadRequest, "mismatch", "Bedrag of doel komt niet overeen met de bankregel.")
		default:
			httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Koppelen mislukt.")
		}
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

// APIAdminBankCreditWaive marks a bank line as reconciled without a card sale (drops out of open bank omzet).
func (d *Deps) APIAdminBankCreditWaive(w http.ResponseWriter, r *http.Request) {
	_ = auth.MustUserFromContext(r.Context())
	idStr := strings.TrimSpace(chi.URLParam(r, "id"))
	bankID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || bankID <= 0 {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_id", "Ongeldige bankregel.")
		return
	}
	if err := d.Store.WaiveBankCreditFromOpenRevenue(r.Context(), bankID); err != nil {
		switch {
		case errors.Is(err, store.ErrBankCreditNotFound):
			httpx.JSONError(w, http.StatusNotFound, "not_found", "Bankregel niet gevonden.")
		case errors.Is(err, store.ErrBankCreditNotOpen):
			httpx.JSONError(w, http.StatusConflict, "not_open", "Alleen open regels kunnen zo worden afgehandeld.")
		default:
			httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Afhandelen mislukt.")
		}
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

// APIAdminBankCreditUnmatch clears the link so the bank line counts again as unmatched bank omzet until re-linked.
func (d *Deps) APIAdminBankCreditUnmatch(w http.ResponseWriter, r *http.Request) {
	_ = auth.MustUserFromContext(r.Context())
	idStr := strings.TrimSpace(chi.URLParam(r, "id"))
	bankID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || bankID <= 0 {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_id", "Ongeldige bankregel.")
		return
	}
	if err := d.Store.UnlinkBankCreditMatch(r.Context(), bankID); err != nil {
		switch {
		case errors.Is(err, store.ErrBankCreditNotFound):
			httpx.JSONError(w, http.StatusNotFound, "not_found", "Bankregel niet gevonden.")
		default:
			httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Ontkoppelen mislukt.")
		}
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

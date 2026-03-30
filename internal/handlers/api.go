package handlers

import (
	"encoding/json"
	"errors"
	"io"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"tostikaart/internal/auth"
	"tostikaart/internal/httpx"
	"tostikaart/internal/middleware"
	"tostikaart/internal/store"
)

type userPublicJSON struct {
	ID             int64   `json:"id"`
	Email          string  `json:"email"`
	Name           string  `json:"name"`
	IsAdmin        bool    `json:"is_admin"`
	IsOperator     bool    `json:"is_operator"`
	IsMatroosJeugd bool    `json:"is_matroos_jeugd"`
	AuthKind       string  `json:"auth_kind"`
	LocalUsername  *string `json:"local_username,omitempty"`
}

type cardJSON struct {
	ID               int64  `json:"id"`
	Kind             string `json:"kind"`
	KnipjesRemaining int    `json:"knipjes_remaining"`
	CreatedAt        string `json:"created_at"`
}

type adminRequestJSON struct {
	ID               int64  `json:"id"`
	Kind             string `json:"kind"`
	UserName         string `json:"user_name"`
	UserEmail        string `json:"user_email"`
	CreatedAt        string `json:"created_at"`
	KnipjesRemaining int    `json:"knipjes_remaining"`
}

type myPendingRequestJSON struct {
	ID               int64  `json:"id"`
	Kind             string `json:"kind"`
	CreatedAt        string `json:"created_at"`
	KnipjesRemaining int    `json:"knipjes_remaining"`
}

func toUserPublic(u *store.User) userPublicJSON {
	j := userPublicJSON{
		ID: u.ID, Email: u.Email, Name: u.Name, IsAdmin: u.IsAdmin, IsOperator: u.IsOperator,
		IsMatroosJeugd: u.IsMatroosJeugd,
	}
	if u.LoginUsername != nil && *u.LoginUsername != "" {
		j.AuthKind = "local"
		s := *u.LoginUsername
		j.LocalUsername = &s
	} else {
		j.AuthKind = "google"
	}
	return j
}

func (d *Deps) APIMe(w http.ResponseWriter, r *http.Request) {
	var user any
	pending := 0
	if u, ok := auth.UserFromContext(r.Context()); ok {
		user = toUserPublic(u)
		n, _ := d.Store.PendingCardRequestsByUser(r.Context(), u.ID)
		pending = n
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"user":                         user,
		"pending_card_requests":        pending,
		"csrf_token":                   "",
		"payment_amount_eur":           d.Config.PaymentAmountEUR,
		"payment_amount_avondeten_eur": d.Config.AvondetenPaymentAmountEUR,
	})
}

func (d *Deps) APILogout(w http.ResponseWriter, r *http.Request) {
	sess, ok := middleware.SessionFromContext(r.Context())
	if ok {
		auth.ClearSessionUser(sess)
		_ = sess.Save(r, w)
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (d *Deps) APICards(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFromContext(r.Context())
	cards, err := d.Store.CardsByUser(r.Context(), u.ID)
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Databasefout.")
		return
	}
	out := make([]cardJSON, 0, len(cards))
	for _, c := range cards {
		out = append(out, cardJSON{
			ID:               c.ID,
			Kind:             c.Kind,
			KnipjesRemaining: c.KnipjesRemaining,
			CreatedAt:        c.CreatedAt.UTC().Format("2006-01-02T15:04:05Z07:00"),
		})
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"cards": out})
}

func (d *Deps) APICardUse(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFromContext(r.Context())
	idStr := chi.URLParam(r, "id")
	cardID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_id", "Ongeldige kaart.")
		return
	}
	err = d.Store.UseKnipje(r.Context(), cardID, u)
	if err != nil {
		switch err {
		case store.ErrNoKnipjes:
			httpx.JSONError(w, http.StatusBadRequest, "no_knipjes", "Deze kaart heeft geen knipjes meer.")
		case store.ErrNotFound:
			httpx.JSONError(w, http.StatusNotFound, "not_found", "Kaart niet gevonden.")
		case store.ErrAvondetenManualUseDisabled:
			httpx.JSONError(w, http.StatusBadRequest, "avondeten_use_disabled", err.Error())
		default:
			httpx.JSONError(w, http.StatusBadRequest, "use_failed", "Kon geen knipje gebruiken.")
		}
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (d *Deps) APIBuy(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFromContext(r.Context())
	list, err := d.Store.ListPendingCardRequestsForUser(r.Context(), u.ID)
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Databasefout.")
		return
	}
	dbTikkie, err := d.Store.GetAppSetting(r.Context(), store.SettingKeyTikkieURL)
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Databasefout.")
		return
	}
	dbTikkieAvondeten, err := d.Store.GetAppSetting(r.Context(), store.SettingKeyTikkieURLAvondeten)
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Databasefout.")
		return
	}
	out := make([]myPendingRequestJSON, 0, len(list))
	for _, row := range list {
		out = append(out, myPendingRequestJSON{
			ID:               row.ID,
			Kind:             row.Kind,
			CreatedAt:        row.CreatedAt.UTC().Format("2006-01-02T15:04:05Z07:00"),
			KnipjesRemaining: row.KnipjesRemaining,
		})
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"payment_amount_eur":           d.Config.PaymentAmountEUR,
		"payment_amount_avondeten_eur": d.Config.AvondetenPaymentAmountEUR,
		"tikkie_url":                   store.EffectiveTikkieURL(dbTikkie, d.Config.TikkieURL),
		"tikkie_url_avondeten":         store.EffectiveTikkieURL(dbTikkieAvondeten, d.Config.TikkieURLAvondeten),
		"bank_transfer_instructions":   d.Config.BankTransferInstructions,
		"my_pending_requests":          out,
	})
}

func (d *Deps) APIBuyRequest(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFromContext(r.Context())
	var body struct {
		Kind string `json:"kind"`
	}
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<12))
	if err := dec.Decode(&body); err != nil && !errors.Is(err, io.EOF) {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_json", "Ongeldige aanvraag.")
		return
	}
	if _, err := store.NormalizeCardKind(body.Kind); err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_kind", "Ongeldig kaarttype.")
		return
	}
	_, err := d.Store.CreateCardRequest(r.Context(), u.ID, body.Kind)
	if err != nil {
		if errors.Is(err, store.ErrAlreadyPending) {
			httpx.JSONError(w, http.StatusConflict, "already_pending", "Er is al een open aanvraag voor dit kaarttype.")
			return
		}
		if errors.Is(err, store.ErrForbidden) {
			httpx.JSONError(w, http.StatusForbidden, "not_matroos_jeugd", "Avondetenkaart alleen voor matroos-jeugd.")
			return
		}
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Aanvraag opslaan mislukt.")
		return
	}
	d.notifyPaymentRequestsMutation()
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (d *Deps) APICancelMyRequest(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFromContext(r.Context())
	idStr := chi.URLParam(r, "id")
	reqID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_id", "Ongeldige aanvraag.")
		return
	}
	err = d.Store.CancelCardRequestForUser(r.Context(), reqID, u.ID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.JSONError(w, http.StatusNotFound, "not_found", "Aanvraag niet gevonden of al verwerkt.")
			return
		}
		if errors.Is(err, store.ErrCannotCancelTrustUsed) {
			httpx.JSONError(w, http.StatusConflict, "knipjes_used", "Annuleren niet mogelijk na knipjegebruik.")
			return
		}
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Annuleren mislukt.")
		return
	}
	d.notifyPaymentRequestsMutation()
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (d *Deps) APICancelAllMyPending(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFromContext(r.Context())
	n, err := d.Store.CancelAllPendingCardRequestsForUser(r.Context(), u.ID)
	if err != nil {
		if errors.Is(err, store.ErrCannotCancelTrustUsed) {
			httpx.JSONError(w, http.StatusConflict, "knipjes_used", "Annuleren niet mogelijk na knipjegebruik.")
			return
		}
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Annuleren mislukt.")
		return
	}
	if n > 0 {
		d.notifyPaymentRequestsMutation()
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true, "cancelled_count": n})
}

func (d *Deps) APIAdminDashboard(w http.ResponseWriter, r *http.Request) {
	st, err := d.Store.AdminDashboardStats(r.Context())
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Databasefout.")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"active_cards_total":                st.ActiveCardsTotal,
		"knipjes_remaining_total":           st.KnipjesRemainingTotal,
		"pending_requests":                  st.PendingRequests,
		"pending_with_card":                 st.PendingWithCard,
		"pending_knipjes_remaining":         st.PendingKnipjesRemaining,
		"pending_knipjes_consumed_estimate": st.PendingKnipjesConsumedEst,
		"fulfilled_requests":                st.FulfilledRequests,
		"fulfilled_knipjes_remaining":       st.FulfilledKnipjesRemaining,
		"cancelled_requests":                st.CancelledRequests,
		"payment_amount_eur":                d.Config.PaymentAmountEUR,
		"finance_year":                      st.FinanceYear,
		"year_revenue_eur":                  math.Round(st.YearRevenueEUR*100) / 100,
		"year_expenses_eur":                 math.Round(st.YearExpensesEUR*100) / 100,
		"year_net_eur":                      math.Round(st.YearNetEUR*100) / 100,
	})
}

func parsePaymentEURAmount(s string) float64 {
	s = strings.TrimSpace(strings.ReplaceAll(s, ",", "."))
	if s == "" {
		return 0
	}
	v, err := strconv.ParseFloat(s, 64)
	if err != nil || v < 0 {
		return 0
	}
	return v
}

func (d *Deps) APIAdminSalesStats(w http.ResponseWriter, r *http.Request) {
	loc, locErr := time.LoadLocation("Europe/Amsterdam")
	year := time.Now().Year()
	if locErr == nil {
		year = time.Now().In(loc).Year()
	}
	if ys := strings.TrimSpace(r.URL.Query().Get("year")); ys != "" {
		if v, err := strconv.Atoi(ys); err == nil && v >= 2000 && v <= 2100 {
			year = v
		}
	}

	buckets, err := d.Store.AdminSalesByMonth(r.Context(), year)
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Databasefout.")
		return
	}
	expenseBuckets, err := d.Store.AdminExpensesByMonth(r.Context(), year)
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Databasefout.")
		return
	}

	monthly := make([]map[string]any, 0, 12)
	var yearCount int64
	var yearRevenue float64
	var yearExpenses float64
	for i := 0; i < 12; i++ {
		b := buckets[i]
		yearCount += b.FulfilledCount
		rev := math.Round(b.RevenueEUR*100) / 100
		exp := math.Round(expenseBuckets[i]*100) / 100
		yearRevenue += rev
		yearExpenses += exp
		net := math.Round((rev-exp)*100) / 100
		monthly = append(monthly, map[string]any{
			"month":           i + 1,
			"fulfilled_count": b.FulfilledCount,
			"revenue_eur":     rev,
			"expenses_eur":    exp,
			"net_eur":         net,
			"label_nl":        monthLabelNL(i + 1),
		})
	}
	yearRevenue = math.Round(yearRevenue*100) / 100
	yearExpenses = math.Round(yearExpenses*100) / 100
	yearNet := math.Round((yearRevenue-yearExpenses)*100) / 100

	tostiMonthly, err := d.Store.AdminTostiDeliveredQuantitiesByMonth(r.Context(), year)
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Databasefout.")
		return
	}
	tostiByKind, err := d.Store.AdminTostiDeliveredByKind(r.Context(), year)
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Databasefout.")
		return
	}
	yearTostiQty, err := d.Store.AdminTostiDeliveredYearQuantity(r.Context(), year)
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Databasefout.")
		return
	}

	tostiMonthlyJSON := make([]map[string]any, 0, 12)
	for i := 0; i < 12; i++ {
		tostiMonthlyJSON = append(tostiMonthlyJSON, map[string]any{
			"month":    i + 1,
			"quantity": tostiMonthly[i],
			"label_nl": monthLabelNL(i + 1),
		})
	}
	tostiByKindJSON := make([]map[string]any, 0, len(tostiByKind))
	for _, row := range tostiByKind {
		tostiByKindJSON = append(tostiByKindJSON, map[string]any{
			"bread":    row.Bread,
			"filling":  row.Filling,
			"quantity": row.Quantity,
		})
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"year":                 year,
		"timezone":             "Europe/Amsterdam",
		"payment_amount_eur":   d.Config.PaymentAmountEUR,
		"monthly":              monthly,
		"year_fulfilled_count": yearCount,
		"year_revenue_eur":     yearRevenue,
		"year_expenses_eur":    yearExpenses,
		"year_net_eur":         yearNet,
		"year_tosti_quantity":  yearTostiQty,
		"tosti_monthly":        tostiMonthlyJSON,
		"tosti_by_kind":        tostiByKindJSON,
	})
}

func mergeFinanceYears(fulfilled, expense []int) []int {
	seen := make(map[int]struct{}, len(fulfilled)+len(expense))
	for _, y := range fulfilled {
		seen[y] = struct{}{}
	}
	for _, y := range expense {
		seen[y] = struct{}{}
	}
	out := make([]int, 0, len(seen))
	for y := range seen {
		out = append(out, y)
	}
	sort.Slice(out, func(i, j int) bool { return out[i] > out[j] })
	return out
}

func (d *Deps) APIAdminSalesYears(w http.ResponseWriter, r *http.Request) {
	fulfilled, err := d.Store.AdminFulfilledYears(r.Context())
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Databasefout.")
		return
	}
	expenseYears, err := d.Store.AdminExpenseYears(r.Context())
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Databasefout.")
		return
	}
	years := mergeFinanceYears(fulfilled, expenseYears)
	httpx.JSON(w, http.StatusOK, map[string]any{"years": years})
}

func monthLabelNL(m int) string {
	switch m {
	case 1:
		return "jan"
	case 2:
		return "feb"
	case 3:
		return "mrt"
	case 4:
		return "apr"
	case 5:
		return "mei"
	case 6:
		return "jun"
	case 7:
		return "jul"
	case 8:
		return "aug"
	case 9:
		return "sep"
	case 10:
		return "okt"
	case 11:
		return "nov"
	case 12:
		return "dec"
	default:
		return ""
	}
}

func (d *Deps) APIAdminRequests(w http.ResponseWriter, r *http.Request) {
	rows, err := d.Store.ListPendingRequests(r.Context())
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Databasefout.")
		return
	}
	out := make([]adminRequestJSON, 0, len(rows))
	for _, row := range rows {
		out = append(out, adminRequestJSON{
			ID:               row.ID,
			Kind:             row.Kind,
			UserName:         row.UserName,
			UserEmail:        row.UserEmail,
			CreatedAt:        row.CreatedAt.UTC().Format("2006-01-02T15:04:05Z07:00"),
			KnipjesRemaining: row.KnipjesRemaining,
		})
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"requests": out})
}

func (d *Deps) APIAdminFulfill(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFromContext(r.Context())
	idStr := chi.URLParam(r, "id")
	reqID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_id", "Ongeldige aanvraag.")
		return
	}
	kind, err := d.Store.CardRequestKind(r.Context(), reqID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.JSONError(w, http.StatusNotFound, "not_found", "Aanvraag niet gevonden.")
			return
		}
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Databasefout.")
		return
	}
	salePrice := parsePaymentEURAmount(d.Config.PaymentAmountEUR)
	if kind == store.CardKindAvondeten {
		salePrice = parsePaymentEURAmount(d.Config.AvondetenPaymentAmountEUR)
	}
	err = d.Store.FulfillCardRequest(r.Context(), reqID, u.ID, salePrice)
	if err != nil {
		switch err {
		case store.ErrNotFound:
			httpx.JSONError(w, http.StatusNotFound, "not_found", "Aanvraag niet gevonden.")
		case store.ErrForbidden:
			httpx.JSONError(w, http.StatusConflict, "already_fulfilled", "Deze aanvraag was al verwerkt.")
		default:
			httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Kon niet toekennen.")
		}
		return
	}
	d.notifyPaymentRequestsMutation()
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (d *Deps) APIAdminReject(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	reqID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_id", "Ongeldige aanvraag.")
		return
	}
	err = d.Store.AdminRejectCardRequest(r.Context(), reqID)
	if err != nil {
		switch {
		case errors.Is(err, store.ErrNotFound):
			httpx.JSONError(w, http.StatusNotFound, "not_found", "Aanvraag niet gevonden.")
		case errors.Is(err, store.ErrCannotRejectKnipjesUsed):
			httpx.JSONError(w, http.StatusConflict, "cannot_reject", "Weigeren niet mogelijk na knipjegebruik.")
		default:
			httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Kon aanvraag niet weigeren.")
		}
		return
	}
	d.notifyPaymentRequestsMutation()
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

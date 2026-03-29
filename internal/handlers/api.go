package handlers

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/csrf"

	"tostikaart/internal/auth"
	"tostikaart/internal/httpx"
	"tostikaart/internal/middleware"
	"tostikaart/internal/store"
)

type userPublicJSON struct {
	ID      int64  `json:"id"`
	Email   string `json:"email"`
	Name    string `json:"name"`
	IsAdmin bool   `json:"is_admin"`
}

type cardJSON struct {
	ID               int64  `json:"id"`
	KnipjesRemaining int    `json:"knipjes_remaining"`
	CreatedAt        string `json:"created_at"`
}

type adminRequestJSON struct {
	ID               int64  `json:"id"`
	UserName         string `json:"user_name"`
	UserEmail        string `json:"user_email"`
	CreatedAt        string `json:"created_at"`
	KnipjesRemaining int    `json:"knipjes_remaining"`
}

type myPendingRequestJSON struct {
	ID               int64  `json:"id"`
	CreatedAt        string `json:"created_at"`
	KnipjesRemaining int    `json:"knipjes_remaining"`
}

func toUserPublic(u *store.User) userPublicJSON {
	return userPublicJSON{
		ID: u.ID, Email: u.Email, Name: u.Name, IsAdmin: u.IsAdmin,
	}
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
		"user":                  user,
		"pending_card_requests": pending,
		"csrf_token":            csrf.Token(r),
		"payment_amount_eur":    d.Config.PaymentAmountEUR,
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
	err = d.Store.UseKnipje(r.Context(), cardID, u.ID)
	if err != nil {
		switch err {
		case store.ErrNoKnipjes:
			httpx.JSONError(w, http.StatusBadRequest, "no_knipjes", "Deze kaart heeft geen knipjes meer.")
		case store.ErrNotFound:
			httpx.JSONError(w, http.StatusNotFound, "not_found", "Kaart niet gevonden.")
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
	out := make([]myPendingRequestJSON, 0, len(list))
	for _, row := range list {
		out = append(out, myPendingRequestJSON{
			ID:               row.ID,
			CreatedAt:        row.CreatedAt.UTC().Format("2006-01-02T15:04:05Z07:00"),
			KnipjesRemaining: row.KnipjesRemaining,
		})
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"payment_amount_eur":         d.Config.PaymentAmountEUR,
		"tikkie_url":                 d.Config.TikkieURL,
		"bank_transfer_instructions": d.Config.BankTransferInstructions,
		"my_pending_requests":        out,
	})
}

func (d *Deps) APIBuyRequest(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFromContext(r.Context())
	_, err := d.Store.CreateCardRequest(r.Context(), u.ID)
	if err != nil {
		if errors.Is(err, store.ErrAlreadyPending) {
			httpx.JSONError(w, http.StatusConflict, "already_pending",
				"Je hebt al een openstaande aanvraag. Annuleer die eerst of wacht tot de beheerder de betaling heeft geaccordeerd.")
			return
		}
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Aanvraag opslaan mislukt.")
		return
	}
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
			httpx.JSONError(w, http.StatusConflict, "knipjes_used",
				"Annuleren kan niet: je hebt al knipjes gebruikt op deze kaart. Neem contact op met de beheerder.")
			return
		}
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Annuleren mislukt.")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (d *Deps) APICancelAllMyPending(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFromContext(r.Context())
	n, err := d.Store.CancelAllPendingCardRequestsForUser(r.Context(), u.ID)
	if err != nil {
		if errors.Is(err, store.ErrCannotCancelTrustUsed) {
			httpx.JSONError(w, http.StatusConflict, "knipjes_used",
				"Annuleren kan niet: je hebt al knipjes gebruikt op een openstaande kaart.")
			return
		}
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Annuleren mislukt.")
		return
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
	})
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
	err = d.Store.FulfillCardRequest(r.Context(), reqID, u.ID)
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
			httpx.JSONError(w, http.StatusConflict, "cannot_reject",
				"Weigeren kan niet: er is al minstens één knipje gebruikt. Accordeer de betaling zodra die binnen is.")
		default:
			httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Kon aanvraag niet weigeren.")
		}
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

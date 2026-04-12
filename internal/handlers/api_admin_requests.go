package handlers

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"lunchkraam/internal/auth"
	"lunchkraam/internal/httpx"
	"lunchkraam/internal/store"
)

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
			PaymentMethod:    row.PaymentMethod,
			UserName:         row.UserName,
			UserEmail:        row.UserEmail,
			CreatedAt:        row.CreatedAt.UTC().Format(httpx.JSONTimeLayout),
			KnipjesRemaining: row.KnipjesRemaining,
		})
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"requests": out})
}

func (d *Deps) APIAdminFulfill(w http.ResponseWriter, r *http.Request) {
	u := auth.MustUserFromContext(r.Context())
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
		if !u.IsAdmin {
			httpx.JSONError(w, http.StatusForbidden, "admin_required_for_avondeten", "Alleen beheerders mogen avondetenkaarten accorderen.")
			return
		}
		salePrice = parsePaymentEURAmount(d.Config.AvondetenPaymentAmountEUR)
	}
	err = d.Store.FulfillCardRequest(r.Context(), reqID, u.ID, salePrice)
	if err != nil {
		switch {
		case errors.Is(err, store.ErrNotFound):
			httpx.JSONError(w, http.StatusNotFound, "not_found", "Aanvraag niet gevonden.")
		case errors.Is(err, store.ErrForbidden):
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

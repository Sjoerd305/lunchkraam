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

type physicalCardSaleInput struct {
	Kind          string
	PaymentMethod string
}

type errPhysicalSaleInput struct {
	Code   string
	Msg    string
	Status int
}

func (e *errPhysicalSaleInput) Error() string { return e.Msg }

func parsePhysicalCardSaleInput(actor *store.User, buyerUserID int64, kind, paymentMethod string) (physicalCardSaleInput, error) {
	if actor == nil || (!actor.IsAdmin && !actor.IsOperator) {
		return physicalCardSaleInput{}, &errPhysicalSaleInput{
			Code:   "operator_or_admin_required",
			Msg:    "Alleen admin of operator kan fysieke kaartverkoop registreren.",
			Status: http.StatusForbidden,
		}
	}
	if buyerUserID <= 0 {
		return physicalCardSaleInput{}, &errPhysicalSaleInput{
			Code:   "invalid_user_id",
			Msg:    "Ongeldige gebruiker.",
			Status: http.StatusBadRequest,
		}
	}
	normalizedKind, err := store.NormalizeCardKind(kind)
	if err != nil {
		return physicalCardSaleInput{}, &errPhysicalSaleInput{
			Code:   "invalid_kind",
			Msg:    "Ongeldig kaarttype.",
			Status: http.StatusBadRequest,
		}
	}
	normalizedPaymentMethod, err := store.NormalizePaymentMethod(paymentMethod)
	if err != nil {
		return physicalCardSaleInput{}, &errPhysicalSaleInput{
			Code:   "invalid_payment_method",
			Msg:    "Ongeldig betaalmiddel.",
			Status: http.StatusBadRequest,
		}
	}
	return physicalCardSaleInput{Kind: normalizedKind, PaymentMethod: normalizedPaymentMethod}, nil
}

func (d *Deps) APICards(w http.ResponseWriter, r *http.Request) {
	u := auth.MustUserFromContext(r.Context())
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
			Source:           c.Source,
			KnipjesRemaining: c.KnipjesRemaining,
			CreatedAt:        c.CreatedAt.UTC().Format(httpx.JSONTimeLayout),
		})
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"cards": out})
}

func (d *Deps) APICardUse(w http.ResponseWriter, r *http.Request) {
	u := auth.MustUserFromContext(r.Context())
	if !u.IsAdmin && !u.IsOperator {
		httpx.JSONError(w, http.StatusForbidden, "operator_or_admin_required", "Alleen admin of operator kan handmatig een knipje gebruiken.")
		return
	}
	idStr := chi.URLParam(r, "id")
	cardID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_id", "Ongeldige kaart.")
		return
	}
	err = d.Store.UseKnipje(r.Context(), cardID, u)
	if err != nil {
		switch {
		case errors.Is(err, store.ErrNoKnipjes):
			httpx.JSONError(w, http.StatusBadRequest, "no_knipjes", "Deze kaart heeft geen knipjes meer.")
		case errors.Is(err, store.ErrNotFound):
			httpx.JSONError(w, http.StatusNotFound, "not_found", "Kaart niet gevonden.")
		case errors.Is(err, store.ErrCardPhysicalReadonly):
			httpx.JSONError(w, http.StatusBadRequest, "physical_card_readonly", "Fysieke kaarten zijn read-only in de app.")
		default:
			httpx.JSONError(w, http.StatusBadRequest, "use_failed", "Kon geen knipje gebruiken.")
		}
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (d *Deps) APIBuy(w http.ResponseWriter, r *http.Request) {
	u := auth.MustUserFromContext(r.Context())
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
			CreatedAt:        row.CreatedAt.UTC().Format(httpx.JSONTimeLayout),
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
	u := auth.MustUserFromContext(r.Context())
	var body struct {
		Kind string `json:"kind"`
	}
	if !httpx.ReadJSONAllowEmpty(w, r, 1<<12, &body) {
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

func (d *Deps) APIOperatorCardSale(w http.ResponseWriter, r *http.Request) {
	u := auth.MustUserFromContext(r.Context())
	var body struct {
		UserID        int64  `json:"user_id"`
		Kind          string `json:"kind"`
		PaymentMethod string `json:"payment_method"`
	}
	if !httpx.ReadJSONAllowEmpty(w, r, 1<<12, &body) {
		return
	}
	in, err := parsePhysicalCardSaleInput(u, body.UserID, body.Kind, body.PaymentMethod)
	if err != nil {
		var inv *errPhysicalSaleInput
		if errors.As(err, &inv) {
			httpx.JSONError(w, inv.Status, inv.Code, inv.Msg)
			return
		}
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Ongeldige invoer.")
		return
	}
	salePrice := parsePaymentEURAmount(d.Config.PaymentAmountEUR)
	if in.Kind == store.CardKindAvondeten {
		salePrice = parsePaymentEURAmount(d.Config.AvondetenPaymentAmountEUR)
	}
	reqID, err := d.Store.CreatePhysicalCardSale(r.Context(), store.PhysicalCardSaleInput{
		BuyerUserID:   body.UserID,
		SellerUserID:  u.ID,
		Kind:          in.Kind,
		PaymentMethod: in.PaymentMethod,
		SalePriceEUR:  salePrice,
	})
	if err != nil {
		switch {
		case errors.Is(err, store.ErrNotFound):
			httpx.JSONError(w, http.StatusNotFound, "not_found", "Gebruiker niet gevonden.")
		case errors.Is(err, store.ErrForbidden):
			httpx.JSONError(w, http.StatusForbidden, "forbidden", "Avondetenkaart alleen voor matroos-jeugd.")
		case errors.Is(err, store.ErrAlreadyPending):
			httpx.JSONError(w, http.StatusConflict, "already_pending", "Er is al een open aanvraag voor dit kaarttype.")
		default:
			httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Verkoop registreren mislukt.")
		}
		return
	}
	d.notifyPaymentRequestsMutation()
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true, "request_id": reqID})
}

func (d *Deps) APICancelMyRequest(w http.ResponseWriter, r *http.Request) {
	u := auth.MustUserFromContext(r.Context())
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
	u := auth.MustUserFromContext(r.Context())
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

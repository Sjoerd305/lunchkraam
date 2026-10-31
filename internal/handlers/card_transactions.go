package handlers

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"lunchkraam/internal/auth"
	"lunchkraam/internal/httpx"
	"lunchkraam/internal/store"
)

type cardTransactionJSON struct {
	ID                      int64   `json:"id"`
	CardID                  int64   `json:"card_id"`
	Delta                   int     `json:"delta"`
	BalanceAfter            *int    `json:"balance_after"`
	Reason                  string  `json:"reason"`
	ActorName               string  `json:"actor_name"`
	TostiOrderID            *int64  `json:"tosti_order_id"`
	AvondetenMealDate       *string `json:"avondeten_meal_date"`
	ReversesTransactionID   *int64  `json:"reverses_transaction_id"`
	ReversedByTransactionID *int64  `json:"reversed_by_transaction_id"`
	Note                    string  `json:"note"`
	CreatedAt               string  `json:"created_at"`
}

func cardTransactionToJSON(t store.CardTransaction) cardTransactionJSON {
	j := cardTransactionJSON{
		ID:                      t.ID,
		CardID:                  t.CardID,
		Delta:                   t.Delta,
		BalanceAfter:            t.BalanceAfter,
		Reason:                  t.Reason,
		ActorName:               t.ActorName,
		TostiOrderID:            t.TostiOrderID,
		ReversesTransactionID:   t.ReversesTransactionID,
		ReversedByTransactionID: t.ReversedByTransactionID,
		Note:                    t.Note,
		CreatedAt:               t.CreatedAt.UTC().Format(httpx.JSONTimeLayout),
	}
	if t.AvondetenMealDate != nil {
		s := t.AvondetenMealDate.Format("2006-01-02")
		j.AvondetenMealDate = &s
	}
	return j
}

// APICardTransactions returns the knipje-logboek for a card. Members see their own cards; staff see any card.
func (d *Deps) APICardTransactions(w http.ResponseWriter, r *http.Request) {
	u := auth.MustUserFromContext(r.Context())
	cardID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_id", "Ongeldige kaart.")
		return
	}
	ownerID, err := d.Store.CardOwnerID(r.Context(), cardID)
	if err != nil {
		if httpx.RespondStoreNotFound(w, err, "Kaart niet gevonden.") {
			return
		}
		httpx.RespondInternalStoreError(w, r, "CardOwnerID", err)
		return
	}
	isStaff := u.IsAdmin || u.IsOperator
	if ownerID != u.ID && !isStaff {
		httpx.JSONError(w, http.StatusForbidden, "forbidden", "Geen toegang tot deze kaart.")
		return
	}
	list, err := d.Store.ListCardTransactions(r.Context(), cardID, 200)
	if err != nil {
		httpx.RespondInternalStoreError(w, r, "ListCardTransactions", err)
		return
	}
	out := make([]cardTransactionJSON, 0, len(list))
	for _, t := range list {
		out = append(out, cardTransactionToJSON(t))
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"transactions": out, "can_undo": isStaff})
}

// APIOperatorUndoCardTransaction reverses one logged knipje-boeking (operator/admin).
func (d *Deps) APIOperatorUndoCardTransaction(w http.ResponseWriter, r *http.Request) {
	u := auth.MustUserFromContext(r.Context())
	txID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_id", "Ongeldige boeking.")
		return
	}
	if err := d.Store.UndoCardTransaction(r.Context(), txID, u.ID); err != nil {
		if httpx.WriteCardTransactionUndoError(w, err) {
			return
		}
		httpx.RespondInternalStoreError(w, r, "UndoCardTransaction", err)
		return
	}
	d.notifyAvondetenRegistration()
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// APIOperatorSetCardEstimate sets the estimated knipjes on a physical card.
func (d *Deps) APIOperatorSetCardEstimate(w http.ResponseWriter, r *http.Request) {
	u := auth.MustUserFromContext(r.Context())
	cardID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_id", "Ongeldige kaart.")
		return
	}
	var body struct {
		KnipjesRemaining int `json:"knipjes_remaining"`
	}
	if !httpx.ReadJSON(w, r, 1<<12, &body) {
		return
	}
	if err := d.Store.SetPhysicalCardEstimate(r.Context(), cardID, body.KnipjesRemaining, u.ID); err != nil {
		if httpx.WriteCardEstimateStoreError(w, err) {
			return
		}
		httpx.RespondInternalStoreError(w, r, "SetPhysicalCardEstimate", err)
		return
	}
	d.notifyAvondetenRegistration()
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

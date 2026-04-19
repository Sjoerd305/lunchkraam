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

type tostiOrderJSON struct {
	ID                int64   `json:"id"`
	UserID            int64   `json:"user_id"`
	CardID            *int64  `json:"card_id"`
	Quantity          int     `json:"quantity"`
	IsPhysicalCard    bool    `json:"is_physical_card"`
	Bread             string  `json:"bread"`
	Filling           string  `json:"filling"`
	Status            string  `json:"status"`
	CreatedAt         string  `json:"created_at"`
	DeliveredAt       *string `json:"delivered_at,omitempty"`
	DeliveredByUserID *int64  `json:"delivered_by_user_id,omitempty"`
	CancelledAt       *string `json:"cancelled_at,omitempty"`
	CancelledByUserID *int64  `json:"cancelled_by_user_id,omitempty"`
	Remark            string  `json:"remark,omitempty"`
}

type tostiOrderOperatorJSON struct {
	tostiOrderJSON
	CustomerName  string `json:"customer_name"`
	CustomerEmail string `json:"customer_email"`
}

// tostiQueueEntryJSON is a public queue row (FIFO); omits email.
type tostiQueueEntryJSON struct {
	Place          int    `json:"place"`
	ID             int64  `json:"id"`
	CardID         *int64 `json:"card_id"`
	IsPhysicalCard bool   `json:"is_physical_card"`
	Quantity       int    `json:"quantity"`
	Bread          string `json:"bread"`
	Filling        string `json:"filling"`
	CreatedAt      string `json:"created_at"`
	CustomerName   string `json:"customer_name"`
	IsMine         bool   `json:"is_mine"`
}

func tostiOrderToJSON(o store.TostiOrder) tostiOrderJSON {
	j := tostiOrderJSON{
		ID:                o.ID,
		UserID:            o.UserID,
		CardID:            o.CardID,
		Quantity:          o.Quantity,
		IsPhysicalCard:    o.IsPhysicalCard,
		Bread:             o.Bread,
		Filling:           o.Filling,
		Status:            o.Status,
		CreatedAt:         o.CreatedAt.UTC().Format(httpx.JSONTimeLayout),
		DeliveredByUserID: o.DeliveredByUserID,
		CancelledByUserID: o.CancelledByUserID,
		Remark:            o.Remark,
	}
	if o.DeliveredAt != nil {
		s := o.DeliveredAt.UTC().Format(httpx.JSONTimeLayout)
		j.DeliveredAt = &s
	}
	if o.CancelledAt != nil {
		s := o.CancelledAt.UTC().Format(httpx.JSONTimeLayout)
		j.CancelledAt = &s
	}
	return j
}

func (d *Deps) APITostiOrdersQueue(w http.ResponseWriter, r *http.Request) {
	u := auth.MustUserFromContext(r.Context())
	list, err := d.Store.ListPendingTostiOrdersForOperator(r.Context(), 200)
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Wachtrij laden mislukt.")
		return
	}
	out := make([]tostiQueueEntryJSON, 0, len(list))
	for i, row := range list {
		out = append(out, tostiQueueEntryJSON{
			Place:          i + 1,
			ID:             row.ID,
			CardID:         row.CardID,
			IsPhysicalCard: row.IsPhysicalCard,
			Quantity:       row.Quantity,
			Bread:          row.Bread,
			Filling:        row.Filling,
			CreatedAt:      row.CreatedAt.UTC().Format(httpx.JSONTimeLayout),
			CustomerName:   row.CustomerName,
			IsMine:         row.UserID == u.ID,
		})
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"orders": out})
}

func (d *Deps) APITostiOrdersMine(w http.ResponseWriter, r *http.Request) {
	u := auth.MustUserFromContext(r.Context())
	list, err := d.Store.ListTostiOrdersForUser(r.Context(), u.ID, 50)
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Bestellingen laden mislukt.")
		return
	}
	out := make([]tostiOrderJSON, 0, len(list))
	for _, o := range list {
		out = append(out, tostiOrderToJSON(o))
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"orders": out})
}

func (d *Deps) APITostiOrderCreate(w http.ResponseWriter, r *http.Request) {
	u := auth.MustUserFromContext(r.Context())
	var body struct {
		CardID       int64  `json:"card_id"`
		PhysicalCard bool   `json:"physical_card"`
		Quantity     int    `json:"quantity"`
		Bread        string `json:"bread"`
		Filling      string `json:"filling"`
		Remark       string `json:"remark"`
	}
	if !httpx.ReadJSON(w, r, 1<<12, &body) {
		return
	}
	var cardID *int64
	if body.PhysicalCard {
		cardID = nil
	} else {
		if body.CardID <= 0 {
			httpx.JSONError(w, http.StatusBadRequest, "invalid_card", "Kies een geldige kaart of kies fysieke tostikaart.")
			return
		}
		c := body.CardID
		cardID = &c
	}
	qty := body.Quantity
	if qty <= 0 {
		qty = 1
	}
	remark := strings.TrimSpace(body.Remark)
	o, err := d.Store.CreateTostiOrder(r.Context(), u.ID, cardID, body.Bread, body.Filling, qty, remark)
	if err != nil {
		if httpx.WriteTostiCreateStoreError(w, err, body.PhysicalCard) {
			return
		}
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Bestellen mislukt.")
		return
	}
	d.notifyTostiMutation(o.UserID)
	httpx.JSON(w, http.StatusOK, map[string]any{"order": tostiOrderToJSON(*o)})
}

func (d *Deps) APITostiOrderCancel(w http.ResponseWriter, r *http.Request) {
	u := auth.MustUserFromContext(r.Context())
	idStr := chi.URLParam(r, "id")
	oid, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_id", "Ongeldige bestelling.")
		return
	}
	err = d.Store.CancelTostiOrder(r.Context(), oid, u.ID, false)
	if err != nil {
		if httpx.WriteTostiMemberCancelStoreError(w, err) {
			return
		}
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Annuleren mislukt.")
		return
	}
	d.notifyTostiMutation(u.ID)
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (d *Deps) APIOperatorTostiOrders(w http.ResponseWriter, r *http.Request) {
	list, err := d.Store.ListPendingTostiOrdersForOperator(r.Context(), 100)
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Wachtrij laden mislukt.")
		return
	}
	out := make([]tostiOrderOperatorJSON, 0, len(list))
	for _, row := range list {
		out = append(out, tostiOrderOperatorJSON{
			tostiOrderJSON: tostiOrderToJSON(row.TostiOrder),
			CustomerName:   row.CustomerName,
			CustomerEmail:  row.CustomerEmail,
		})
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"orders": out})
}

func (d *Deps) APIOperatorTostiOrderDeliver(w http.ResponseWriter, r *http.Request) {
	u := auth.MustUserFromContext(r.Context())
	idStr := chi.URLParam(r, "id")
	oid, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_id", "Ongeldige bestelling.")
		return
	}
	ownerID, err := d.Store.TostiOrderOwnerID(r.Context(), oid)
	if err != nil {
		if httpx.RespondStoreNotFound(w, err, "Bestelling niet gevonden.") {
			return
		}
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Bestelling laden mislukt.")
		return
	}
	err = d.Store.DeliverTostiOrder(r.Context(), oid, u.ID)
	if err != nil {
		if httpx.WriteTostiOperatorDeliverStoreError(w, err) {
			return
		}
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Leveren mislukt.")
		return
	}
	d.notifyTostiMutation(ownerID)
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (d *Deps) APIOperatorTostiOrderCancel(w http.ResponseWriter, r *http.Request) {
	u := auth.MustUserFromContext(r.Context())
	idStr := chi.URLParam(r, "id")
	oid, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_id", "Ongeldige bestelling.")
		return
	}
	ownerID, err := d.Store.TostiOrderOwnerID(r.Context(), oid)
	if err != nil {
		if httpx.RespondStoreNotFound(w, err, "Bestelling niet gevonden.") {
			return
		}
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Bestelling laden mislukt.")
		return
	}
	err = d.Store.CancelTostiOrder(r.Context(), oid, u.ID, true)
	if err != nil {
		if httpx.WriteTostiOperatorCancelStoreError(w, err) {
			return
		}
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Annuleren mislukt.")
		return
	}
	d.notifyTostiMutation(ownerID)
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// APIOperatorTostiSoldToday returns delivered tosti count for today’s Amsterdam calendar date.
func (d *Deps) APIOperatorTostiSoldToday(w http.ResponseWriter, r *http.Request) {
	loc, err := time.LoadLocation("Europe/Amsterdam")
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Tijdzone niet beschikbaar.")
		return
	}
	dateStr := time.Now().In(loc).Format("2006-01-02")
	qty, err := d.Store.TostiDeliveredQuantityOnAmsterdamCalendarDate(r.Context(), dateStr)
	if err != nil {
		httpx.RespondInternalStoreError(w, r, "TostiDeliveredQuantityOnAmsterdamCalendarDate", err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"quantity":       qty,
		"amsterdam_date": dateStr,
		"timezone":       "Europe/Amsterdam",
	})
}

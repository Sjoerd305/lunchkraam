package handlers

import (
	"log/slog"
	"net/http"
	"time"

	"lunchkraam/internal/auth"
	"lunchkraam/internal/httpx"
	"lunchkraam/internal/middleware"
)

func (d *Deps) APIMe(w http.ResponseWriter, r *http.Request) {
	var user any
	pending := 0
	warnings := []tikkieWarningJSON{}
	if u, ok := auth.UserFromContext(r.Context()); ok {
		user = toUserPublic(u)
		n, err := d.Store.PendingCardRequestsByUser(r.Context(), u.ID)
		if err != nil {
			slog.WarnContext(r.Context(), "pending card requests by user",
				slog.Int64("user_id", u.ID), slog.Any("err", err))
		} else {
			pending = n
		}
		warnings = d.tikkieWarningsForUser(r.Context(), u, time.Now().UTC())
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"user":                         user,
		"pending_card_requests":        pending,
		"tikkie_warnings":              warnings,
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

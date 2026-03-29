package handlers

import (
	"net/http"
	"strings"

	"github.com/gorilla/websocket"

	"tostikaart/internal/auth"
)

func wsCheckOrigin(d *Deps, r *http.Request) bool {
	o := strings.TrimSpace(r.Header.Get("Origin"))
	if o == "" {
		return true
	}
	base := strings.TrimSuffix(strings.TrimSpace(d.Config.PublicBaseURL), "/")
	if base != "" {
		return strings.HasPrefix(o, base)
	}
	lo := strings.ToLower(o)
	return strings.HasPrefix(lo, "http://localhost") ||
		strings.HasPrefix(lo, "http://127.0.0.1") ||
		strings.HasPrefix(lo, "http://[::1]")
}

// WSKraam is a WebSocket for operators/admins; pushes tosti_queue and payment_requests refresh hints.
func (d *Deps) WSKraam(w http.ResponseWriter, r *http.Request) {
	if d.Hub == nil {
		http.Error(w, "realtime niet beschikbaar", http.StatusServiceUnavailable)
		return
	}
	u, ok := auth.UserFromContext(r.Context())
	if !ok {
		http.Error(w, "niet ingelogd", http.StatusUnauthorized)
		return
	}
	if !u.IsAdmin && !u.IsOperator {
		http.Error(w, "geen toegang", http.StatusForbidden)
		return
	}
	up := websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin:     func(req *http.Request) bool { return wsCheckOrigin(d, req) },
	}
	conn, err := up.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	d.Hub.ServeKraam(conn)
}

// WSMijnTosti is a WebSocket for the logged-in member; pushes my_tosti_orders refresh hints.
func (d *Deps) WSMijnTosti(w http.ResponseWriter, r *http.Request) {
	if d.Hub == nil {
		http.Error(w, "realtime niet beschikbaar", http.StatusServiceUnavailable)
		return
	}
	u, ok := auth.UserFromContext(r.Context())
	if !ok {
		http.Error(w, "niet ingelogd", http.StatusUnauthorized)
		return
	}
	up := websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin:     func(req *http.Request) bool { return wsCheckOrigin(d, req) },
	}
	conn, err := up.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	d.Hub.ServeMijnTosti(conn, u.ID)
}

// notifyTostiMutation broadcasts kraam refresh, member queue refresh, and notifies the order owner (if non-zero).
func (d *Deps) notifyTostiMutation(ownerUserID int64) {
	if d.Hub == nil {
		return
	}
	d.Hub.BroadcastKraam()
	d.Hub.BroadcastMemberTostiQueue()
	d.Hub.NotifyUserTostiOrders(ownerUserID)
}

// notifyPaymentRequestsMutation tells kraam WebSocket clients to refetch the payment queue.
func (d *Deps) notifyPaymentRequestsMutation() {
	if d.Hub == nil {
		return
	}
	d.Hub.BroadcastKraamPaymentRequests()
}

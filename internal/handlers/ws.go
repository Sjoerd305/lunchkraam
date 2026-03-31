package handlers

import (
	"net/http"
	"net/url"
	"strings"

	"github.com/gorilla/websocket"

	"lunchkraam/internal/auth"
)

func wsCheckOrigin(d *Deps, r *http.Request) bool {
	originURL, ok := parseOriginURL(r.Header.Get("Origin"))
	if !ok {
		return true
	}
	baseURL, ok := parseOriginURL(d.Config.PublicBaseURL)
	if ok {
		return sameOrigin(originURL, baseURL)
	}
	return isLocalOrigin(originURL)
}

func parseOriginURL(raw string) (*url.URL, bool) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil, false
	}
	parsed, err := url.Parse(trimmed)
	if err != nil {
		return nil, false
	}
	if parsed.Scheme == "" || parsed.Host == "" {
		return nil, false
	}
	return parsed, true
}

func sameOrigin(a, b *url.URL) bool {
	return strings.EqualFold(a.Scheme, b.Scheme) && strings.EqualFold(a.Host, b.Host)
}

func isLocalOrigin(originURL *url.URL) bool {
	if !strings.EqualFold(originURL.Scheme, "http") && !strings.EqualFold(originURL.Scheme, "https") {
		return false
	}
	host := strings.ToLower(originURL.Hostname())
	return host == "localhost" || host == "127.0.0.1" || host == "::1"
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

// notifyAvondetenRegistration refreshes kraam clients (kaartenlijst).
func (d *Deps) notifyAvondetenRegistration() {
	if d.Hub == nil {
		return
	}
	d.Hub.BroadcastKraam()
}

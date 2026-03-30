package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strconv"
	"strings"
	"time"

	"golang.org/x/oauth2"

	"lunchkraam/internal/auth"
	"lunchkraam/internal/config"
	"lunchkraam/internal/middleware"
	"lunchkraam/internal/realtime"
	"lunchkraam/internal/store"
)

type Deps struct {
	Config *config.Config
	Store  *store.Store
	OAuth  *oauth2.Config
	Hub    *realtime.Hub
}

func (d *Deps) GoogleStart(w http.ResponseWriter, r *http.Request) {
	sess, ok := middleware.SessionFromContext(r.Context())
	if !ok {
		http.Error(w, "geen sessie", http.StatusInternalServerError)
		return
	}
	state := randomState()
	auth.SetOAuthState(sess, state)
	if err := sess.Save(r, w); err != nil {
		http.Error(w, "sessie opslaan mislukt", http.StatusInternalServerError)
		return
	}
	url := d.OAuth.AuthCodeURL(state, oauth2.AccessTypeOffline)
	http.Redirect(w, r, url, http.StatusFound)
}

func (d *Deps) GoogleCallback(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	sess, ok := middleware.SessionFromContext(r.Context())
	if !ok {
		http.Error(w, "geen sessie", http.StatusInternalServerError)
		return
	}
	q := r.URL.Query()
	if errParam := strings.TrimSpace(q.Get("error")); errParam != "" {
		http.Redirect(w, r, "/login?error=oauth", http.StatusSeeOther)
		return
	}
	state := q.Get("state")
	saved, ok := auth.OAuthState(sess)
	if !ok || saved == "" || state != saved {
		http.Redirect(w, r, "/login?error=state", http.StatusSeeOther)
		return
	}
	auth.ClearOAuthState(sess)
	saveSess := func() bool {
		if err := sess.Save(r, w); err != nil {
			http.Error(w, "sessie opslaan mislukt", http.StatusInternalServerError)
			return false
		}
		return true
	}
	code := q.Get("code")
	if code == "" {
		if !saveSess() {
			return
		}
		http.Redirect(w, r, "/login?error=code", http.StatusSeeOther)
		return
	}
	tok, err := d.OAuth.Exchange(ctx, code)
	if err != nil {
		if !saveSess() {
			return
		}
		http.Redirect(w, r, "/login?error=token", http.StatusSeeOther)
		return
	}
	client := d.OAuth.Client(ctx, tok)
	profile, err := auth.FetchGoogleProfile(ctx, client)
	if err != nil {
		if !saveSess() {
			return
		}
		http.Redirect(w, r, "/login?error=profile", http.StatusSeeOther)
		return
	}
	if !auth.DomainAllowed(profile, d.Config.AllowedGoogleDomain) {
		if !saveSess() {
			return
		}
		http.Redirect(w, r, "/login?error=domain", http.StatusSeeOther)
		return
	}
	bootstrap := d.Config.IsBootstrapAdmin(profile.Email)
	u, err := d.Store.UpsertUser(ctx, profile.ID, profile.Email, profile.Name, bootstrap)
	if err != nil {
		if !saveSess() {
			return
		}
		http.Redirect(w, r, "/login?error=db", http.StatusSeeOther)
		return
	}
	auth.SetSessionUserID(sess, u.ID)
	if !saveSess() {
		return
	}
	http.Redirect(w, r, "/", http.StatusSeeOther)
}

func randomState() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "st-" + strconv.FormatInt(time.Now().UnixNano(), 16)
	}
	return hex.EncodeToString(b[:])
}

package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"lunchkraam/internal/auth"
	"lunchkraam/internal/httpx"
)

// APIAdminSetUserGoogleEmail stores the Workspace address on a local account so the first Google login
// with that address takes over this account (same id: cards, aanvragen en historie blijven).
func (d *Deps) APIAdminSetUserGoogleEmail(w http.ResponseWriter, r *http.Request) {
	uid, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_id", "Ongeldige gebruiker.")
		return
	}
	var body struct {
		Email string `json:"email"`
	}
	if !httpx.ReadJSON(w, r, 1<<12, &body) {
		return
	}
	email := strings.ToLower(strings.TrimSpace(body.Email))
	if email != "" {
		domain := strings.ToLower(strings.TrimSpace(d.Config.AllowedGoogleDomain))
		at := strings.LastIndex(email, "@")
		if at <= 0 || email[at+1:] != domain {
			httpx.JSONError(w, http.StatusBadRequest, "invalid_email", "Vul een Google-adres in op @"+domain+".")
			return
		}
	}
	err = d.Store.AdminSetLocalUserGoogleEmail(r.Context(), uid, email)
	if err != nil {
		if httpx.WriteAdminUserLifecycleError(w, err) {
			return
		}
		httpx.RespondInternalStoreError(w, r, "AdminSetLocalUserGoogleEmail", err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// APIAdminMergeUserInto moves a local account into an existing Google account and deletes the local one.
func (d *Deps) APIAdminMergeUserInto(w http.ResponseWriter, r *http.Request) {
	me := auth.MustUserFromContext(r.Context())
	uid, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_id", "Ongeldige gebruiker.")
		return
	}
	var body struct {
		TargetUserID int64 `json:"target_user_id"`
	}
	if !httpx.ReadJSON(w, r, 1<<12, &body) {
		return
	}
	if body.TargetUserID <= 0 {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_target", "Kies een Google-account om mee samen te voegen.")
		return
	}
	err = d.Store.AdminMergeLocalUserIntoGoogle(r.Context(), uid, body.TargetUserID, me.ID)
	if err != nil {
		if httpx.WriteAdminUserLifecycleError(w, err) {
			return
		}
		httpx.RespondInternalStoreError(w, r, "AdminMergeLocalUserIntoGoogle", err)
		return
	}
	d.notifyUserProfileMutation(uid)
	d.notifyUserProfileMutation(body.TargetUserID)
	d.notifyPaymentRequestsMutation()
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// APIAdminDeleteUser removes a deactivated account; history stays under the placeholder "Verwijderde leden".
func (d *Deps) APIAdminDeleteUser(w http.ResponseWriter, r *http.Request) {
	me := auth.MustUserFromContext(r.Context())
	uid, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_id", "Ongeldige gebruiker.")
		return
	}
	err = d.Store.AdminDeleteUser(r.Context(), uid, me.ID)
	if err != nil {
		if httpx.WriteAdminUserLifecycleError(w, err) {
			return
		}
		httpx.RespondInternalStoreError(w, r, "AdminDeleteUser", err)
		return
	}
	d.notifyUserProfileMutation(uid)
	d.notifyPaymentRequestsMutation()
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

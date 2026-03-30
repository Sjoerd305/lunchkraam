package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"tostikaart/internal/auth"
	"tostikaart/internal/httpx"
	"tostikaart/internal/middleware"
	"tostikaart/internal/store"
	"golang.org/x/crypto/bcrypt"
)

var localUsernamePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{2,31}$`)

func (d *Deps) APILocalLogin(w http.ResponseWriter, r *http.Request) {
	sess, ok := middleware.SessionFromContext(r.Context())
	if !ok {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Geen sessie.")
		return
	}
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<14))
	if err := dec.Decode(&body); err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_json", "Ongeldige aanvraag.")
		return
	}
	u, err := d.Store.AuthenticateLocalUser(r.Context(), body.Username, body.Password)
	if errors.Is(err, store.ErrInvalidCredentials) {
		httpx.JSONError(w, http.StatusUnauthorized, "invalid_credentials", "Onbekende gebruikersnaam of verkeerd wachtwoord.")
		return
	}
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Inloggen mislukt.")
		return
	}
	auth.SetSessionUserID(sess, u.ID)
	if err := sess.Save(r, w); err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Sessie opslaan mislukt.")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

type adminUserListJSON struct {
	ID               int64   `json:"id"`
	Name             string  `json:"name"`
	Email            string  `json:"email"`
	AuthKind         string  `json:"auth_kind"`
	LocalUsername    *string `json:"local_username,omitempty"`
	IsAdmin          bool    `json:"is_admin"`
	IsOperator       bool    `json:"is_operator"`
	IsMatroosJeugd   bool    `json:"is_matroos_jeugd"`
	CreatedAt        string  `json:"created_at"`
}

func (d *Deps) APIAdminUsers(w http.ResponseWriter, r *http.Request) {
	rows, err := d.Store.ListAdminUsers(r.Context())
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Databasefout.")
		return
	}
	out := make([]adminUserListJSON, 0, len(rows))
	for _, row := range rows {
		j := adminUserListJSON{
			ID: row.ID, Name: row.Name, Email: row.Email,
			IsAdmin: row.IsAdmin, IsOperator: row.IsOperator, IsMatroosJeugd: row.IsMatroosJeugd,
			CreatedAt: row.CreatedAt.UTC().Format("2006-01-02T15:04:05Z07:00"),
		}
		if row.LoginUsername != nil && *row.LoginUsername != "" {
			j.AuthKind = "local"
			s := *row.LoginUsername
			j.LocalUsername = &s
		} else {
			j.AuthKind = "google"
		}
		out = append(out, j)
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"users": out})
}

func (d *Deps) APIAdminCreateLocalUser(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Username   string `json:"username"`
		Name       string `json:"name"`
		Password   string `json:"password"`
		IsAdmin    bool   `json:"is_admin"`
		IsOperator bool   `json:"is_operator"`
	}
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<14))
	if err := dec.Decode(&body); err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_json", "Ongeldige aanvraag.")
		return
	}
	u := strings.TrimSpace(strings.ToLower(body.Username))
	if !localUsernamePattern.MatchString(u) {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_username",
			"Gebruikersnaam: 3–32 tekens, alleen kleine letters, cijfers, . _ -")
		return
	}
	if len(body.Password) < 8 {
		httpx.JSONError(w, http.StatusBadRequest, "weak_password", "Wachtwoord moet minstens 8 tekens zijn.")
		return
	}
	display := strings.TrimSpace(body.Name)
	if display == "" {
		display = u
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Wachtwoord verwerken mislukt.")
		return
	}
	nu, err := d.Store.CreateLocalUser(r.Context(), u, display, hash, body.IsAdmin, body.IsOperator)
	if errors.Is(err, store.ErrUsernameTaken) {
		httpx.JSONError(w, http.StatusConflict, "username_taken", "Deze gebruikersnaam bestaat al.")
		return
	}
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Account aanmaken mislukt.")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"user": toUserPublic(nu)})
}

func (d *Deps) APIAdminPatchLocalUser(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	uid, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_id", "Ongeldige gebruiker.")
		return
	}
	var body struct {
		Password   string `json:"password"`
		IsAdmin    bool   `json:"is_admin"`
		IsOperator bool   `json:"is_operator"`
	}
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<14))
	if err := dec.Decode(&body); err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_json", "Ongeldige aanvraag.")
		return
	}
	var pwd *string
	if t := strings.TrimSpace(body.Password); t != "" {
		if len(t) < 8 {
			httpx.JSONError(w, http.StatusBadRequest, "weak_password", "Wachtwoord moet minstens 8 tekens zijn.")
			return
		}
		pwd = &t
	}
	err = d.Store.AdminUpdateLocalUser(r.Context(), uid, pwd, body.IsAdmin, body.IsOperator)
	if errors.Is(err, store.ErrNotFound) {
		httpx.JSONError(w, http.StatusNotFound, "not_found", "Lokaal account niet gevonden.")
		return
	}
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Bijwerken mislukt.")
		return
	}
	u, err := d.Store.UserByID(r.Context(), uid)
	if err != nil {
		httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"user": toUserPublic(u)})
}

func (d *Deps) APIAdminPatchUserMatroosJeugd(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	uid, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_id", "Ongeldige gebruiker.")
		return
	}
	var body struct {
		IsMatroosJeugd bool `json:"is_matroos_jeugd"`
	}
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<14))
	if err := dec.Decode(&body); err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_json", "Ongeldige aanvraag.")
		return
	}
	err = d.Store.AdminSetMatroosJeugd(r.Context(), uid, body.IsMatroosJeugd)
	if errors.Is(err, store.ErrNotFound) {
		httpx.JSONError(w, http.StatusNotFound, "not_found", "Gebruiker niet gevonden.")
		return
	}
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Bijwerken mislukt.")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (d *Deps) APIOperatorCards(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	rows, err := d.Store.SearchCardsWithOwners(r.Context(), q, 40)
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Databasefout.")
		return
	}
	out := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		out = append(out, map[string]any{
			"id":                  row.ID,
			"kind":                row.Kind,
			"knipjes_remaining":   row.KnipjesRemaining,
			"created_at":          row.CreatedAt.UTC().Format("2006-01-02T15:04:05Z07:00"),
			"owner_name":          row.OwnerName,
			"owner_email":         row.OwnerEmail,
			"owner_user_id":       row.UserID,
		})
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"cards": out})
}

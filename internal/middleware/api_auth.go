package middleware

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/httprate"

	"tostikaart/internal/auth"
	"tostikaart/internal/store"
)

func writeAPIUnauthorized(w http.ResponseWriter, msg string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusUnauthorized)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized", "message": msg})
}

// RequireUserAPI ensures a logged-in user is loaded (JSON errors, no redirect).
func RequireUserAPI(st *store.Store) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			sess, ok := SessionFromContext(r.Context())
			if !ok {
				writeAPIUnauthorized(w, "Niet ingelogd.")
				return
			}
			id, ok := auth.SessionUserID(sess)
			if !ok || id == 0 {
				writeAPIUnauthorized(w, "Niet ingelogd.")
				return
			}
			u, err := st.UserByID(r.Context(), id)
			if err != nil {
				auth.ClearSessionUser(sess)
				_ = sess.Save(r, w)
				writeAPIUnauthorized(w, "Sessie ongeldig.")
				return
			}
			next.ServeHTTP(w, r.WithContext(auth.WithUser(r.Context(), u)))
		})
	}
}

// RequireAdminAPI requires is_admin (JSON 403).
func RequireAdminAPI() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			u, ok := auth.UserFromContext(r.Context())
			if !ok || !u.IsAdmin {
				w.Header().Set("Content-Type", "application/json; charset=utf-8")
				w.WriteHeader(http.StatusForbidden)
				_ = json.NewEncoder(w).Encode(map[string]string{
					"error":   "forbidden",
					"message": "Geen beheerderrechten.",
				})
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// KeyByUserID is for httprate when the user is already in context.
func KeyByUserID(r *http.Request) (string, error) {
	u, ok := auth.UserFromContext(r.Context())
	if !ok {
		return httprate.KeyByIP(r)
	}
	return strconv.FormatInt(u.ID, 10), nil
}

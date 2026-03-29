package middleware

import (
	"net/http"

	"tostikaart/internal/auth"
	"tostikaart/internal/store"
)

// OptionalUser loads the logged-in user into the request context when a valid session exists.
func OptionalUser(st *store.Store) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			sess, ok := SessionFromContext(r.Context())
			if !ok {
				next.ServeHTTP(w, r)
				return
			}
			id, ok := auth.SessionUserID(sess)
			if !ok || id == 0 {
				next.ServeHTTP(w, r)
				return
			}
			u, err := st.UserByID(r.Context(), id)
			if err != nil {
				next.ServeHTTP(w, r)
				return
			}
			next.ServeHTTP(w, r.WithContext(auth.WithUser(r.Context(), u)))
		})
	}
}

func RequireUser(st *store.Store) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			sess, ok := SessionFromContext(r.Context())
			if !ok {
				http.Redirect(w, r, "/login", http.StatusSeeOther)
				return
			}
			id, ok := auth.SessionUserID(sess)
			if !ok || id == 0 {
				http.Redirect(w, r, "/login", http.StatusSeeOther)
				return
			}
			u, err := st.UserByID(r.Context(), id)
			if err != nil {
				auth.ClearSessionUser(sess)
				_ = sess.Save(r, w)
				http.Redirect(w, r, "/login", http.StatusSeeOther)
				return
			}
			next.ServeHTTP(w, r.WithContext(auth.WithUser(r.Context(), u)))
		})
	}
}

func RequireAdmin() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			u, ok := auth.UserFromContext(r.Context())
			if !ok || !u.IsAdmin {
				http.Error(w, "geen toegang", http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

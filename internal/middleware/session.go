package middleware

import (
	"context"
	"net/http"

	"github.com/gorilla/sessions"
	"lunchkraam/internal/auth"
)

type sessionCtxKey struct{}

func Session(store *sessions.CookieStore) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			sess, err := auth.GetSession(store, r)
			if err != nil {
				http.Error(w, "sessie fout", http.StatusInternalServerError)
				return
			}
			ctx := context.WithValue(r.Context(), sessionCtxKey{}, sess)
			next.ServeHTTP(w, r.WithContext(ctx))
			// Do not Save here after the handler: http.Redirect calls WriteHeader, and
			// Set-Cookie after that is ignored — OAuth and logout handlers save explicitly.
		})
	}
}

func SessionFromContext(ctx context.Context) (*sessions.Session, bool) {
	sess, ok := ctx.Value(sessionCtxKey{}).(*sessions.Session)
	return sess, ok
}

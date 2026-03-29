package middleware

import (
	"encoding/json"
	"net/http"

	"tostikaart/internal/auth"
)

// RequireOperatorOrAdminAPI allows kraam-staff (matroos) or admins to search cards and use knipjes on any card.
func RequireOperatorOrAdminAPI() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			u, ok := auth.UserFromContext(r.Context())
			if !ok || (!u.IsAdmin && !u.IsOperator) {
				w.Header().Set("Content-Type", "application/json; charset=utf-8")
				w.WriteHeader(http.StatusForbidden)
				_ = json.NewEncoder(w).Encode(map[string]string{
					"error":   "forbidden",
					"message": "Geen rechten voor de lunchkraam.",
				})
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

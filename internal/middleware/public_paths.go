package middleware

import (
	"net/http"
	"path"
	"strings"
)

// AllowOnlyKnownPublicPaths answers GET/HEAD only for URLs this app actually serves.
// Everything else gets 404 (no SPA index.html), which stops arbitrary scanner paths.
//
// When you add a new browser route, extend this list and keep it in sync with frontend/src/App.tsx.
func AllowOnlyKnownPublicPaths(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			next.ServeHTTP(w, r)
			return
		}
		p := path.Clean(r.URL.Path)
		if p == "." {
			p = "/"
		}
		if !strings.HasPrefix(p, "/") {
			p = "/" + p
		}
		if isKnownPublicPath(p) {
			next.ServeHTTP(w, r)
			return
		}
		w.WriteHeader(http.StatusNotFound)
	})
}

func isKnownPublicPath(p string) bool {
	switch {
	case strings.HasPrefix(p, "/api/"),
		strings.HasPrefix(p, "/auth/"),
		strings.HasPrefix(p, "/ws/"),
		strings.HasPrefix(p, "/assets/"):
		return true
	case p == "/health", p == "/robots.txt":
		return true
	case strings.HasPrefix(p, "/.well-known/"):
		return true
	case p == "/favicon.svg":
		return true
	case p == "/", p == "/login", p == "/cards", p == "/buy", p == "/tosti", p == "/kraam":
		return true
	case p == "/admin" || strings.HasPrefix(p, "/admin/"):
		return true
	default:
		return false
	}
}

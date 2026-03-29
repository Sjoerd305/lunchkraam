package middleware

import (
	"net/http"
	"strings"
)

// RedirectHTTPToHTTPS sends a 308 redirect to HTTPS when the edge reports
// X-Forwarded-Proto: http (e.g. user opened http:// on Cloudflare Tunnel).
// Without this, Secure session/CSRF cookies are not sent on HTTP, so POSTs fail.
// Skips /health. Only active when trustProxy is true.
func RedirectHTTPToHTTPS(trustProxy bool, publicBaseURL string) func(http.Handler) http.Handler {
	if !trustProxy {
		return func(next http.Handler) http.Handler { return next }
	}
	publicBaseURL = strings.TrimSuffix(strings.TrimSpace(publicBaseURL), "/")
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/health" {
				next.ServeHTTP(w, r)
				return
			}
			proto := strings.ToLower(strings.TrimSpace(r.Header.Get("X-Forwarded-Proto")))
			if proto != "http" {
				next.ServeHTTP(w, r)
				return
			}
			loc := httpsRedirectLocation(r, publicBaseURL)
			http.Redirect(w, r, loc, http.StatusPermanentRedirect)
		})
	}
}

func httpsRedirectLocation(r *http.Request, publicBaseURL string) string {
	reqURI := r.URL.RequestURI()
	if reqURI == "" {
		reqURI = "/"
	}
	if publicBaseURL != "" && strings.HasPrefix(strings.ToLower(publicBaseURL), "https://") {
		return publicBaseURL + reqURI
	}
	host := strings.TrimSpace(r.Header.Get("X-Forwarded-Host"))
	if host == "" {
		host = r.Host
	}
	return "https://" + host + reqURI
}

// forwardedRequestHost returns the client-facing host (first X-Forwarded-Host value or r.Host).
func forwardedRequestHost(r *http.Request) string {
	if h := strings.TrimSpace(r.Header.Get("X-Forwarded-Host")); h != "" {
		if i := strings.IndexByte(h, ','); i >= 0 {
			h = strings.TrimSpace(h[:i])
		}
		return h
	}
	return r.Host
}

// TrustForwardedHTTPS should be used when the app sits behind a reverse proxy or tunnel
// (e.g. cloudflared) that terminates TLS and forwards HTTP to the origin with
// X-Forwarded-Proto: https. It sets r.URL.Scheme to "https" for a correct request URL behind
// TLS termination, sets Secure cookies via config, and sends HSTS for browsers.
//
// It also sets r.URL.Host when empty. Go's server often leaves URL.Host unset (Request-URI is
// only a path), which breaks checks that compare the request URL to Origin or Referer.
func TrustForwardedHTTPS(enabled bool) func(http.Handler) http.Handler {
	if !enabled {
		return func(next http.Handler) http.Handler { return next }
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.EqualFold(strings.TrimSpace(r.Header.Get("X-Forwarded-Proto")), "https") {
				if r.URL != nil {
					r.URL.Scheme = "https"
					if r.URL.Host == "" {
						if host := forwardedRequestHost(r); host != "" {
							r.URL.Host = host
						}
					}
				}
				w.Header().Set("Strict-Transport-Security", "max-age=15552000; includeSubDomains")
			}
			next.ServeHTTP(w, r)
		})
	}
}

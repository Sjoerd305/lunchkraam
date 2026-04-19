package handlers

import (
	"crypto/rand"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	csrf "filippo.io/csrf/gorilla"
	"github.com/go-chi/chi/v5"
	"github.com/gorilla/sessions"

	"lunchkraam/internal/config"
	"lunchkraam/internal/middleware"
)

func newTestSessionStore(t *testing.T) *sessions.CookieStore {
	t.Helper()
	var key [32]byte
	if _, err := rand.Read(key[:]); err != nil {
		t.Fatal(err)
	}
	s := sessions.NewCookieStore(key[:])
	s.Options = &sessions.Options{
		Path:     "/",
		MaxAge:   3600,
		HttpOnly: true,
		Secure:   false,
		SameSite: http.SameSiteLaxMode,
	}
	return s
}

func TestSmoke_Health(t *testing.T) {
	r := chi.NewRouter()
	r.Get("/health", Health)

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/health", nil))
	res := rec.Result()
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		t.Fatalf("status: %d", res.StatusCode)
	}
	body, _ := io.ReadAll(res.Body)
	if string(body) != "ok" {
		t.Fatalf("body: %q", body)
	}
	if ct := res.Header.Get("Content-Type"); ct != "text/plain; charset=utf-8" {
		t.Fatalf("content-type: %q", ct)
	}
}

func TestSmoke_RobotsTxt(t *testing.T) {
	r := chi.NewRouter()
	r.Get("/robots.txt", RobotsTxt)

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/robots.txt", nil))
	res := rec.Result()
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		t.Fatalf("status: %d", res.StatusCode)
	}
}

func TestSmoke_APIMe_anonymous(t *testing.T) {
	sessStore := newTestSessionStore(t)
	cfg := &config.Config{
		PaymentAmountEUR:          "15",
		AvondetenPaymentAmountEUR: "12",
	}
	h := &Deps{Config: cfg, Store: nil}

	r := chi.NewRouter()
	r.Use(middleware.Session(sessStore))
	r.Use(middleware.OptionalUser(nil))
	r.Route("/api", func(r chi.Router) {
		r.Use(csrf.Protect(nil))
		r.Get("/me", h.APIMe)
	})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	r.ServeHTTP(rec, req)
	res := rec.Result()
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		t.Fatalf("status: %d", res.StatusCode)
	}
	var body map[string]any
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body["user"] != nil {
		t.Fatalf("expected user null, got %v", body["user"])
	}
}

func TestSmoke_APICards_unauthorized(t *testing.T) {
	sessStore := newTestSessionStore(t)
	cfg := &config.Config{
		PaymentAmountEUR:          "15",
		AvondetenPaymentAmountEUR: "12",
	}
	h := &Deps{Config: cfg, Store: nil}

	r := chi.NewRouter()
	r.Use(middleware.Session(sessStore))
	r.Route("/api", func(r chi.Router) {
		r.Use(csrf.Protect(nil))
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequireUserAPI(nil))
			r.Get("/cards", h.APICards)
		})
	})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/cards", nil)
	r.ServeHTTP(rec, req)
	res := rec.Result()
	defer res.Body.Close()

	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status: %d", res.StatusCode)
	}
	var body map[string]string
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body["error"] != "unauthorized" {
		t.Fatalf("error field: %v", body)
	}
}

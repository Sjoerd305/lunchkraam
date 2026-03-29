package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/httprate"
	"github.com/gorilla/csrf"
	"github.com/gorilla/sessions"

	"tostikaart/internal/auth"
	"tostikaart/internal/config"
	"tostikaart/internal/db"
	"tostikaart/internal/handlers"
	apimw "tostikaart/internal/middleware"
	"tostikaart/internal/store"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	ctx := context.Background()
	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer pool.Close()

	if err := db.Migrate(ctx, pool, cfg.MigrationsDir); err != nil {
		log.Fatalf("migrate: %v", err)
	}

	sessionStore := sessions.NewCookieStore(cfg.SessionSecret)
	sessionStore.Options = &sessions.Options{
		Path:     "/",
		MaxAge:   int((7 * 24 * time.Hour).Seconds()),
		HttpOnly: true,
		Secure:   cfg.SecureCookies,
		SameSite: http.SameSiteLaxMode,
	}

	st := store.New(pool)
	oauthCfg := auth.NewGoogleOAuth(cfg)
	h := &handlers.Deps{
		Config: cfg,
		Store:  st,
		OAuth:  oauthCfg,
	}

	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.Timeout(60 * time.Second))

	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = w.Write([]byte("ok"))
	})

	r.Group(func(r chi.Router) {
		r.Use(apimw.Session(sessionStore))
		r.Use(apimw.OptionalUser(st))

		r.Group(func(r chi.Router) {
			r.Use(httprate.Limit(60, time.Minute, httprate.WithKeyFuncs(httprate.KeyByIP)))
			r.Get("/auth/google", h.GoogleStart)
			r.Get("/auth/google/callback", h.GoogleCallback)
		})

		r.Route("/api", func(r chi.Router) {
			r.Use(csrf.Protect(
				cfg.CsrfAuthKey[:],
				csrf.Secure(cfg.SecureCookies),
				csrf.Path("/"),
				csrf.SameSite(csrf.SameSiteLaxMode),
				csrf.RequestHeader("X-CSRF-Token"),
			))
			r.Get("/me", h.APIMe)
			r.Post("/logout", h.APILogout)

			r.Group(func(r chi.Router) {
				r.Use(apimw.RequireUserAPI(st))
				r.Get("/cards", h.APICards)
				r.Post("/cards/{id}/use", h.APICardUse)
				r.Get("/buy", h.APIBuy)
				r.With(httprate.Limit(5, time.Minute, httprate.WithKeyFuncs(apimw.KeyByUserID))).Post("/buy/request", h.APIBuyRequest)
				r.Post("/buy/requests/{id}/cancel", h.APICancelMyRequest)
				r.Post("/buy/cancel-all-pending", h.APICancelAllMyPending)
			})

			r.Group(func(r chi.Router) {
				r.Use(apimw.RequireUserAPI(st))
				r.Use(apimw.RequireAdminAPI())
				r.Get("/admin/dashboard", h.APIAdminDashboard)
				r.Get("/admin/sales-years", h.APIAdminSalesYears)
				r.Get("/admin/sales-stats", h.APIAdminSalesStats)
				r.Get("/admin/requests", h.APIAdminRequests)
				r.Post("/admin/requests/{id}/fulfill", h.APIAdminFulfill)
				r.Post("/admin/requests/{id}/reject", h.APIAdminReject)
			})
		})
	})

	dist := cfg.FrontendDist
	if fi, err := os.Stat(dist); err == nil && fi.IsDir() {
		assetsDir := filepath.Join(dist, "assets")
		if _, err := os.Stat(assetsDir); err == nil {
			r.Handle("/assets/*", http.StripPrefix("/assets/", http.FileServer(http.Dir(assetsDir))))
		}
		r.Get("/*", spaFallback(dist))
		log.Printf("serving SPA from %s", dist)
	} else {
		log.Printf("warning: frontend dist not found at %s (use Vite dev server + proxy, or run npm run build)", dist)
	}

	srv := &http.Server{
		Addr:              cfg.ListenAddr,
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	go func() {
		log.Printf("listening on %s", cfg.ListenAddr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown: %v", err)
	}
}

func spaFallback(dist string) http.HandlerFunc {
	root := http.Dir(dist)
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		rel := strings.TrimPrefix(r.URL.Path, "/")
		if rel != "" {
			f, err := root.Open(rel)
			if err == nil {
				defer f.Close()
				if st, err := f.Stat(); err == nil && !st.IsDir() {
					http.ServeFile(w, r, filepath.Join(dist, rel))
					return
				}
			}
		}
		http.ServeFile(w, r, filepath.Join(dist, "index.html"))
	}
}

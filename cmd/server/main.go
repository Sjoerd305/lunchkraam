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

	csrf "filippo.io/csrf/gorilla"
	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/httprate"
	"github.com/gorilla/sessions"

	"lunchkraam/internal/auth"
	"lunchkraam/internal/config"
	"lunchkraam/internal/db"
	"lunchkraam/internal/handlers"
	apimw "lunchkraam/internal/middleware"
	"lunchkraam/internal/realtime"
	"lunchkraam/internal/store"
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
	hub := realtime.NewHub()
	h := &handlers.Deps{
		Config: cfg,
		Store:  st,
		OAuth:  oauthCfg,
		Hub:    hub,
	}

	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(apimw.RedirectHTTPToHTTPS(cfg.TrustProxyHeaders, cfg.PublicBaseURL))
	r.Use(apimw.TrustForwardedHTTPS(cfg.TrustProxyHeaders))
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(apimw.AllowOnlyKnownPublicPaths)

	r.Group(func(r chi.Router) {
		r.Use(apimw.Session(sessionStore))
		r.Use(apimw.OptionalUser(st))
		r.Get("/ws/kraam", h.WSKraam)
		r.Get("/ws/mijn-tosti", h.WSMijnTosti)
	})

	r.Group(func(r chi.Router) {
		r.Use(chimw.Timeout(60 * time.Second))

		r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			_, _ = w.Write([]byte("ok"))
		})

		r.Get("/robots.txt", func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			_, _ = w.Write([]byte("User-agent: *\nDisallow: /\n"))
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
				// CSRF via filippo.io/csrf/gorilla (Sec-Fetch-Site / Origin). Auth key is ignored.
				r.Use(csrf.Protect(nil))
				r.Get("/me", h.APIMe)
				r.Post("/logout", h.APILogout)

				r.Group(func(r chi.Router) {
					r.Use(httprate.Limit(30, time.Minute, httprate.WithKeyFuncs(httprate.KeyByIP)))
					r.Post("/auth/local/login", h.APILocalLogin)
				})

				r.Group(func(r chi.Router) {
					r.Use(apimw.RequireUserAPI(st))
					r.Use(apimw.RequireOperatorOrAdminAPI())
					r.Get("/admin/requests", h.APIAdminRequests)
					r.Post("/admin/requests/{id}/fulfill", h.APIAdminFulfill)
					r.Post("/admin/requests/{id}/reject", h.APIAdminReject)
					r.Get("/operator/cards", h.APIOperatorCards)
					r.Get("/operator/tosti-orders", h.APIOperatorTostiOrders)
					r.Get("/operator/tosti-sold-today", h.APIOperatorTostiSoldToday)
					r.Post("/operator/tosti-orders/{id}/deliver", h.APIOperatorTostiOrderDeliver)
					r.Post("/operator/tosti-orders/{id}/cancel", h.APIOperatorTostiOrderCancel)
					r.Get("/operator/avondeten/registrations", h.APIOperatorAvondetenList)
					r.With(httprate.Limit(30, time.Minute, httprate.WithKeyFuncs(apimw.KeyByUserID))).Post("/operator/avondeten/register", h.APIOperatorAvondetenRegister)
					r.Get("/operator/sales-years", h.APIAdminSalesYears)
					r.Get("/operator/sales-stats", h.APIAdminSalesStats)
					r.Get("/operator/shop-expenses", h.APIAdminShopExpensesList)
					r.With(httprate.Limit(30, time.Minute, httprate.WithKeyFuncs(apimw.KeyByUserID))).Post("/operator/shop-expenses", h.APIAdminShopExpenseCreate)
				})

				r.Group(func(r chi.Router) {
					r.Use(apimw.RequireUserAPI(st))
					r.With(httprate.Limit(10, time.Minute, httprate.WithKeyFuncs(apimw.KeyByUserID))).Post("/account/password", h.APILocalChangeOwnPassword)
					r.Get("/tosti-orders/mine", h.APITostiOrdersMine)
					r.Get("/tosti-orders/queue", h.APITostiOrdersQueue)
					r.With(httprate.Limit(20, time.Minute, httprate.WithKeyFuncs(apimw.KeyByUserID))).Post("/tosti-orders", h.APITostiOrderCreate)
					r.Post("/tosti-orders/{id}/cancel", h.APITostiOrderCancel)
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
					r.Get("/admin/shop-expenses", h.APIAdminShopExpensesList)
					r.Post("/admin/shop-expenses", h.APIAdminShopExpenseCreate)
					r.Delete("/admin/shop-expenses/{id}", h.APIAdminShopExpenseDelete)
					r.Get("/admin/users", h.APIAdminUsers)
					r.Post("/admin/users/local", h.APIAdminCreateLocalUser)
					r.Patch("/admin/users/{id}/local", h.APIAdminPatchLocalUser)
					r.Patch("/admin/users/{id}/matroos-jeugd", h.APIAdminPatchUserMatroosJeugd)
					r.Get("/admin/settings", h.APIAdminSettingsGet)
					r.Patch("/admin/settings", h.APIAdminSettingsPatch)
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
	})

	srv := &http.Server{
		Addr:              cfg.ListenAddr,
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       0,
		WriteTimeout:      0,
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

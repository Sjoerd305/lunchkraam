package config

import (
	"crypto/sha256"
	"fmt"
	"os"
	"strings"
)

type Config struct {
	ListenAddr               string
	DatabaseURL              string
	MigrationsDir            string
	GoogleClientID           string
	GoogleClientSecret       string
	OAuthRedirectURL         string
	AllowedGoogleDomain      string
	SessionSecret            []byte
	PublicBaseURL            string
	TikkieURL                 string
	TikkieURLAvondeten        string
	PaymentAmountEUR           string
	AvondetenPaymentAmountEUR  string
	BankTransferInstructions   string
	BootstrapAdminEmails     map[string]struct{}
	SecureCookies            bool
	// TrustProxyHeaders: trust X-Forwarded-Proto from the edge (cloudflared, etc.).
	// Enables Secure cookies and forwarded-HTTPS handling even when the origin listens on HTTP.
	TrustProxyHeaders bool
	CsrfAuthKey       [32]byte
	FrontendDist      string
	ReceiptsDir       string
}

func Load() (*Config, error) {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	clientID := os.Getenv("GOOGLE_CLIENT_ID")
	clientSecret := os.Getenv("GOOGLE_CLIENT_SECRET")
	redirect := os.Getenv("OAUTH_REDIRECT_URL")
	if clientID == "" || clientSecret == "" || redirect == "" {
		return nil, fmt.Errorf("GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and OAUTH_REDIRECT_URL are required")
	}
	domain := strings.TrimSpace(strings.ToLower(os.Getenv("ALLOWED_GOOGLE_DOMAIN")))
	if domain == "" {
		return nil, fmt.Errorf("ALLOWED_GOOGLE_DOMAIN is required")
	}
	sessionSecret := os.Getenv("SESSION_SECRET")
	if len(sessionSecret) < 32 {
		return nil, fmt.Errorf("SESSION_SECRET must be at least 32 characters")
	}

	publicBase := strings.TrimSuffix(strings.TrimSpace(os.Getenv("PUBLIC_BASE_URL")), "/")

	csrfKey := csrfAuthKeyFromEnv(sessionSecret)

	secure := false
	if v := strings.TrimSpace(strings.ToLower(os.Getenv("COOKIE_SECURE"))); v == "1" || v == "true" || v == "yes" {
		secure = true
	}
	trustProxy := false
	if v := strings.TrimSpace(strings.ToLower(os.Getenv("TRUST_PROXY_HEADERS"))); v == "1" || v == "true" || v == "yes" {
		trustProxy = true
	}
	if trustProxy {
		secure = true
	}

	addr := os.Getenv("LISTEN_ADDR")
	if addr == "" {
		addr = ":8080"
	}

	migrationsDir := strings.TrimSpace(os.Getenv("MIGRATIONS_DIR"))
	if migrationsDir == "" {
		migrationsDir = "migrations"
	}

	amount := os.Getenv("PAYMENT_AMOUNT_EUR")
	if amount == "" {
		amount = "15"
	}
	avondetenAmount := strings.TrimSpace(os.Getenv("AVONDETEN_PAYMENT_AMOUNT_EUR"))
	if avondetenAmount == "" {
		avondetenAmount = "12"
	}

	frontendDist := strings.TrimSpace(os.Getenv("FRONTEND_DIST"))
	if frontendDist == "" {
		frontendDist = "frontend/dist"
	}
	receiptsDir := strings.TrimSpace(os.Getenv("RECEIPTS_DIR"))
	if receiptsDir == "" {
		receiptsDir = "data/receipts"
	}

	cfg := &Config{
		ListenAddr:               addr,
		DatabaseURL:              databaseURL,
		MigrationsDir:            migrationsDir,
		GoogleClientID:           clientID,
		GoogleClientSecret:       clientSecret,
		OAuthRedirectURL:         redirect,
		AllowedGoogleDomain:      domain,
		SessionSecret:            []byte(sessionSecret),
		PublicBaseURL:            publicBase,
		TikkieURL:                 strings.TrimSpace(os.Getenv("TIKKIE_URL")),
		TikkieURLAvondeten:        strings.TrimSpace(os.Getenv("TIKKIE_URL_AVONDETEN")),
		PaymentAmountEUR:          amount,
		AvondetenPaymentAmountEUR: avondetenAmount,
		BankTransferInstructions:  os.Getenv("BANK_TRANSFER_INSTRUCTIONS"),
		BootstrapAdminEmails:     parseEmailSet(os.Getenv("BOOTSTRAP_ADMIN_EMAILS")),
		SecureCookies:            secure,
		TrustProxyHeaders:        trustProxy,
		CsrfAuthKey:              csrfKey,
		FrontendDist:             frontendDist,
		ReceiptsDir:              receiptsDir,
	}
	return cfg, nil
}

func csrfAuthKeyFromEnv(sessionSecret string) [32]byte {
	raw := strings.TrimSpace(os.Getenv("CSRF_AUTH_KEY"))
	if len(raw) >= 32 {
		var k [32]byte
		copy(k[:], []byte(raw)[:32])
		return k
	}
	sum := sha256.Sum256([]byte(sessionSecret))
	return sum
}

func parseEmailSet(s string) map[string]struct{} {
	out := make(map[string]struct{})
	for _, part := range strings.Split(s, ",") {
		e := strings.TrimSpace(strings.ToLower(part))
		if e != "" {
			out[e] = struct{}{}
		}
	}
	return out
}

func (c *Config) IsBootstrapAdmin(email string) bool {
	if email == "" {
		return false
	}
	_, ok := c.BootstrapAdminEmails[strings.ToLower(strings.TrimSpace(email))]
	return ok
}

package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	"lunchkraam/internal/config"
)

const googleUserInfoURL = "https://www.googleapis.com/oauth2/v2/userinfo"

type GoogleProfile struct {
	ID            string `json:"id"`
	Email         string `json:"email"`
	VerifiedEmail bool   `json:"verified_email"`
	Name          string `json:"name"`
	Picture       string `json:"picture"`
	HostedDomain  string `json:"hd"`
}

func NewGoogleOAuth(cfg *config.Config) *oauth2.Config {
	return &oauth2.Config{
		ClientID:     cfg.GoogleClientID,
		ClientSecret: cfg.GoogleClientSecret,
		RedirectURL:  cfg.OAuthRedirectURL,
		Scopes:       []string{"openid", "email", "profile"},
		Endpoint:     google.Endpoint,
	}
}

func FetchGoogleProfile(ctx context.Context, client *http.Client) (*GoogleProfile, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, googleUserInfoURL, nil)
	if err != nil {
		return nil, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("google userinfo: status %d", resp.StatusCode)
	}
	var p GoogleProfile
	if err := json.Unmarshal(body, &p); err != nil {
		return nil, err
	}
	return &p, nil
}

func DomainAllowed(profile *GoogleProfile, allowedDomain string) bool {
	allowedDomain = strings.TrimSpace(strings.ToLower(allowedDomain))
	if allowedDomain == "" {
		return false
	}
	if !profile.VerifiedEmail {
		return false
	}
	hd := strings.TrimSpace(strings.ToLower(profile.HostedDomain))
	if hd == allowedDomain {
		return true
	}
	email := strings.TrimSpace(strings.ToLower(profile.Email))
	at := strings.LastIndex(email, "@")
	if at < 0 {
		return false
	}
	suffix := email[at+1:]
	return suffix == allowedDomain
}

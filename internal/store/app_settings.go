package store

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
)

const SettingKeyTikkieURL = "tikkie_url"

// SettingKeyTikkieURLAvondeten is the payment link for avondetenkaarten (separate amount).
const SettingKeyTikkieURLAvondeten = "tikkie_url_avondeten"

func (s *Store) GetAppSetting(ctx context.Context, key string) (string, error) {
	var v string
	err := s.pool.QueryRow(ctx, `SELECT value FROM app_settings WHERE key = $1`, key).Scan(&v)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return v, nil
}

func (s *Store) SetAppSetting(ctx context.Context, key, value string) error {
	_, err := s.pool.Exec(ctx, `
INSERT INTO app_settings (key, value) VALUES ($1, $2)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
`, key, value)
	return err
}

// EffectiveTikkieURL returns the DB value when non-empty after trim, otherwise envFallback (trimmed).
func EffectiveTikkieURL(dbValue, envFallback string) string {
	if t := strings.TrimSpace(dbValue); t != "" {
		return t
	}
	return strings.TrimSpace(envFallback)
}

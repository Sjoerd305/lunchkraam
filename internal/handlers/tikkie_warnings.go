package handlers

import (
	"context"
	"strings"
	"time"

	"lunchkraam/internal/store"
)

const (
	tikkieValidityWindow = 14 * 24 * time.Hour
	tikkieWarningWindow  = 2 * 24 * time.Hour
)

type tikkieWarningRule struct {
	kind     string
	urlKey   string
	setAtKey string
	label    string
}

var tikkieWarningRules = []tikkieWarningRule{
	{
		kind:     store.CardKindTosti,
		urlKey:   store.SettingKeyTikkieURL,
		setAtKey: store.SettingKeyTikkieURLSetAt,
		label:    "Tostikaart",
	},
	{
		kind:     store.CardKindAvondeten,
		urlKey:   store.SettingKeyTikkieURLAvondeten,
		setAtKey: store.SettingKeyTikkieURLAvondetenSetAt,
		label:    "Avondetenkaart",
	},
}

func (d *Deps) tikkieWarningsForUser(ctx context.Context, user *store.User, now time.Time) []tikkieWarningJSON {
	if user == nil || (!user.IsAdmin && !user.IsOperator) {
		return []tikkieWarningJSON{}
	}
	out := make([]tikkieWarningJSON, 0, len(tikkieWarningRules))
	for _, rule := range tikkieWarningRules {
		urlValue, err := d.Store.GetAppSetting(ctx, rule.urlKey)
		if err != nil || strings.TrimSpace(urlValue) == "" {
			continue
		}
		setAtRaw, err := d.Store.GetAppSetting(ctx, rule.setAtKey)
		if err != nil {
			continue
		}
		warning, ok := buildTikkieWarning(rule, setAtRaw, now)
		if !ok {
			continue
		}
		out = append(out, warning)
	}
	return out
}

func buildTikkieWarning(rule tikkieWarningRule, setAtRaw string, now time.Time) (tikkieWarningJSON, bool) {
	setAt, err := time.Parse(time.RFC3339, strings.TrimSpace(setAtRaw))
	if err != nil {
		return tikkieWarningJSON{}, false
	}
	expiresAt := setAt.UTC().Add(tikkieValidityWindow)
	remaining := expiresAt.Sub(now.UTC())
	if remaining <= 0 || remaining > tikkieWarningWindow {
		return tikkieWarningJSON{}, false
	}
	daysRemaining := int(remaining / (24 * time.Hour))
	if daysRemaining < 0 {
		daysRemaining = 0
	}
	return tikkieWarningJSON{
		Kind:          rule.kind,
		ExpiresAt:     expiresAt.Format(time.RFC3339),
		DaysRemaining: daysRemaining,
		Message:       rule.label + "-Tikkie verloopt binnenkort. Vernieuw deze link.",
	}, true
}

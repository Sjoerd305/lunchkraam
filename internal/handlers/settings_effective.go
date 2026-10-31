package handlers

import (
	"context"
	"fmt"
	"math"
	"strconv"
	"strings"

	"lunchkraam/internal/store"
)

// effectiveSetting returns the database value when set, otherwise the .env fallback.
// Without a store (e.g. HTTP smoke tests) the fallback is returned.
func (d *Deps) effectiveSetting(ctx context.Context, key, envFallback string) string {
	if d == nil || d.Store == nil {
		return strings.TrimSpace(envFallback)
	}
	v, err := d.Store.GetAppSetting(ctx, key)
	if err != nil {
		return strings.TrimSpace(envFallback)
	}
	return store.EffectiveTikkieURL(v, envFallback)
}

// effectivePaymentAmountStr is the card price for a kind as shown to members (e.g. "15" or "12.50").
func (d *Deps) effectivePaymentAmountStr(ctx context.Context, kind string) string {
	if kind == store.CardKindAvondeten {
		return d.effectiveSetting(ctx, store.SettingKeyPaymentAmountAvondetenEUR, d.Config.AvondetenPaymentAmountEUR)
	}
	return d.effectiveSetting(ctx, store.SettingKeyPaymentAmountEUR, d.Config.PaymentAmountEUR)
}

// effectivePaymentAmount is the card price for a kind as a number, used when recording a sale.
func (d *Deps) effectivePaymentAmount(ctx context.Context, kind string) float64 {
	return parsePaymentEURAmount(d.effectivePaymentAmountStr(ctx, kind))
}

func (d *Deps) effectiveBankTransferInstructions(ctx context.Context) string {
	return d.effectiveSetting(ctx, store.SettingKeyBankTransferInstructions, d.Config.BankTransferInstructions)
}

// normalizePaymentAmountInput accepts "15", "12,50" or "12.5" and returns a canonical string, or "" to clear.
func normalizePaymentAmountInput(s string) (string, error) {
	s = strings.TrimSpace(strings.ReplaceAll(s, ",", "."))
	if s == "" {
		return "", nil
	}
	v, err := strconv.ParseFloat(s, 64)
	if err != nil || math.IsNaN(v) || math.IsInf(v, 0) {
		return "", fmt.Errorf("ongeldig bedrag")
	}
	if v < 0 || v > 1000 {
		return "", fmt.Errorf("bedrag moet tussen 0 en 1000 liggen")
	}
	v = math.Round(v*100) / 100
	if v == math.Trunc(v) {
		return strconv.FormatInt(int64(v), 10), nil
	}
	return strconv.FormatFloat(v, 'f', 2, 64), nil
}

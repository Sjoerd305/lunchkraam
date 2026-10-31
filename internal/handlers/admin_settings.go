package handlers

import (
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"lunchkraam/internal/httpx"
	"lunchkraam/internal/store"
)

const maxBankTransferInstructionsLen = 2000

func validateTikkieURL(s string) (string, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return "", nil
	}
	u, err := url.Parse(s)
	if err != nil || u.Scheme != "http" && u.Scheme != "https" || u.Host == "" {
		return "", fmt.Errorf("ongeldige URL (alleen http(s) met host)")
	}
	return s, nil
}

// tikkieTimestamps returns set_at and expires_at (RFC3339) for a tikkie link, or empty strings when unknown.
func (d *Deps) tikkieTimestamps(r *http.Request, setAtKey string) (string, string) {
	raw, err := d.Store.GetAppSetting(r.Context(), setAtKey)
	if err != nil {
		return "", ""
	}
	setAt, err := time.Parse(time.RFC3339, strings.TrimSpace(raw))
	if err != nil {
		return "", ""
	}
	return setAt.UTC().Format(time.RFC3339), setAt.UTC().Add(tikkieValidityWindow).Format(time.RFC3339)
}

func (d *Deps) writeAdminSettings(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	values := make(map[string]string, 5)
	for _, key := range []string{
		store.SettingKeyTikkieURL,
		store.SettingKeyTikkieURLAvondeten,
		store.SettingKeyPaymentAmountEUR,
		store.SettingKeyPaymentAmountAvondetenEUR,
		store.SettingKeyBankTransferInstructions,
	} {
		v, err := d.Store.GetAppSetting(ctx, key)
		if err != nil {
			httpx.RespondInternalStoreError(w, r, "GetAppSetting "+key, err)
			return
		}
		values[key] = v
	}
	tikkieSetAt, tikkieExpiresAt := d.tikkieTimestamps(r, store.SettingKeyTikkieURLSetAt)
	tikkieAvondetenSetAt, tikkieAvondetenExpiresAt := d.tikkieTimestamps(r, store.SettingKeyTikkieURLAvondetenSetAt)

	httpx.JSON(w, http.StatusOK, map[string]any{
		"tikkie_url":                              values[store.SettingKeyTikkieURL],
		"tikkie_url_effective":                    store.EffectiveTikkieURL(values[store.SettingKeyTikkieURL], d.Config.TikkieURL),
		"tikkie_url_env_config":                   strings.TrimSpace(d.Config.TikkieURL),
		"tikkie_url_set_at":                       tikkieSetAt,
		"tikkie_url_expires_at":                   tikkieExpiresAt,
		"tikkie_url_avondeten":                    values[store.SettingKeyTikkieURLAvondeten],
		"tikkie_url_avondeten_effective":          store.EffectiveTikkieURL(values[store.SettingKeyTikkieURLAvondeten], d.Config.TikkieURLAvondeten),
		"tikkie_url_avondeten_env_config":         strings.TrimSpace(d.Config.TikkieURLAvondeten),
		"tikkie_url_avondeten_set_at":             tikkieAvondetenSetAt,
		"tikkie_url_avondeten_expires_at":         tikkieAvondetenExpiresAt,
		"tikkie_validity_days":                    int(tikkieValidityWindow / (24 * time.Hour)),
		"payment_amount_eur":                      values[store.SettingKeyPaymentAmountEUR],
		"payment_amount_eur_effective":            d.effectivePaymentAmountStr(ctx, store.CardKindTosti),
		"payment_amount_eur_env_config":           strings.TrimSpace(d.Config.PaymentAmountEUR),
		"payment_amount_avondeten_eur":            values[store.SettingKeyPaymentAmountAvondetenEUR],
		"payment_amount_avondeten_eur_effective":  d.effectivePaymentAmountStr(ctx, store.CardKindAvondeten),
		"payment_amount_avondeten_eur_env_config": strings.TrimSpace(d.Config.AvondetenPaymentAmountEUR),
		"bank_transfer_instructions":              values[store.SettingKeyBankTransferInstructions],
		"bank_transfer_instructions_effective":    d.effectiveBankTransferInstructions(ctx),
		"bank_transfer_instructions_env_config":   strings.TrimSpace(d.Config.BankTransferInstructions),
	})
}

func (d *Deps) APIAdminSettingsGet(w http.ResponseWriter, r *http.Request) {
	d.writeAdminSettings(w, r)
}

func (d *Deps) APIAdminSettingsPatch(w http.ResponseWriter, r *http.Request) {
	var body struct {
		TikkieURL                 *string `json:"tikkie_url"`
		TikkieURLAvondeten        *string `json:"tikkie_url_avondeten"`
		PaymentAmountEUR          *string `json:"payment_amount_eur"`
		PaymentAmountAvondetenEUR *string `json:"payment_amount_avondeten_eur"`
		BankTransferInstructions  *string `json:"bank_transfer_instructions"`
	}
	if !httpx.ReadJSON(w, r, 1<<14, &body) {
		return
	}
	if body.TikkieURL == nil && body.TikkieURLAvondeten == nil && body.PaymentAmountEUR == nil &&
		body.PaymentAmountAvondetenEUR == nil && body.BankTransferInstructions == nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_body", "Geen instellingen meegegeven.")
		return
	}
	if body.TikkieURL != nil {
		normalized, err := validateTikkieURL(*body.TikkieURL)
		if err != nil {
			httpx.JSONError(w, http.StatusBadRequest, "invalid_url", "Tostikaart-Tikkie: "+err.Error())
			return
		}
		if err := d.setTikkieURLIfChanged(r, store.SettingKeyTikkieURL, store.SettingKeyTikkieURLSetAt, normalized); err != nil {
			httpx.RespondInternalStoreError(w, r, "SetAppSetting tikkie_url", err)
			return
		}
	}
	if body.TikkieURLAvondeten != nil {
		normalized, err := validateTikkieURL(*body.TikkieURLAvondeten)
		if err != nil {
			httpx.JSONError(w, http.StatusBadRequest, "invalid_url", "Avondeten-Tikkie: "+err.Error())
			return
		}
		if err := d.setTikkieURLIfChanged(r, store.SettingKeyTikkieURLAvondeten, store.SettingKeyTikkieURLAvondetenSetAt, normalized); err != nil {
			httpx.RespondInternalStoreError(w, r, "SetAppSetting tikkie_url_avondeten", err)
			return
		}
	}
	if body.PaymentAmountEUR != nil {
		normalized, err := normalizePaymentAmountInput(*body.PaymentAmountEUR)
		if err != nil {
			httpx.JSONError(w, http.StatusBadRequest, "invalid_amount", "Prijs tostikaart: "+err.Error())
			return
		}
		if err := d.Store.SetAppSetting(r.Context(), store.SettingKeyPaymentAmountEUR, normalized); err != nil {
			httpx.RespondInternalStoreError(w, r, "SetAppSetting payment_amount_eur", err)
			return
		}
	}
	if body.PaymentAmountAvondetenEUR != nil {
		normalized, err := normalizePaymentAmountInput(*body.PaymentAmountAvondetenEUR)
		if err != nil {
			httpx.JSONError(w, http.StatusBadRequest, "invalid_amount", "Prijs avondetenkaart: "+err.Error())
			return
		}
		if err := d.Store.SetAppSetting(r.Context(), store.SettingKeyPaymentAmountAvondetenEUR, normalized); err != nil {
			httpx.RespondInternalStoreError(w, r, "SetAppSetting payment_amount_avondeten_eur", err)
			return
		}
	}
	if body.BankTransferInstructions != nil {
		text := strings.TrimSpace(*body.BankTransferInstructions)
		if len(text) > maxBankTransferInstructionsLen {
			httpx.JSONError(w, http.StatusBadRequest, "too_long", "Overschrijfinstructies: maximaal 2000 tekens.")
			return
		}
		if err := d.Store.SetAppSetting(r.Context(), store.SettingKeyBankTransferInstructions, text); err != nil {
			httpx.RespondInternalStoreError(w, r, "SetAppSetting bank_transfer_instructions", err)
			return
		}
	}
	d.writeAdminSettings(w, r)
}

func (d *Deps) setTikkieURLIfChanged(r *http.Request, urlKey, setAtKey, nextValue string) error {
	currentValue, err := d.Store.GetAppSetting(r.Context(), urlKey)
	if err != nil {
		return err
	}
	if !shouldUpdateTikkieTimestamp(currentValue, nextValue) {
		return nil
	}
	if err := d.Store.SetAppSetting(r.Context(), urlKey, nextValue); err != nil {
		return err
	}
	nowUTC := time.Now().UTC().Format(time.RFC3339)
	if err := d.Store.SetAppSetting(r.Context(), setAtKey, nowUTC); err != nil {
		return err
	}
	return nil
}

func shouldUpdateTikkieTimestamp(currentValue, nextValue string) bool {
	return currentValue != nextValue
}

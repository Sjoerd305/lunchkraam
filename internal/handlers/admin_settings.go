package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"lunchkraam/internal/httpx"
	"lunchkraam/internal/store"
)

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

func (d *Deps) APIAdminSettingsGet(w http.ResponseWriter, r *http.Request) {
	dbVal, err := d.Store.GetAppSetting(r.Context(), store.SettingKeyTikkieURL)
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Instellingen laden mislukt.")
		return
	}
	dbAvondeten, err := d.Store.GetAppSetting(r.Context(), store.SettingKeyTikkieURLAvondeten)
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Instellingen laden mislukt.")
		return
	}
	env := strings.TrimSpace(d.Config.TikkieURL)
	envAvondeten := strings.TrimSpace(d.Config.TikkieURLAvondeten)
	effective := store.EffectiveTikkieURL(dbVal, d.Config.TikkieURL)
	effectiveAvondeten := store.EffectiveTikkieURL(dbAvondeten, d.Config.TikkieURLAvondeten)
	httpx.JSON(w, http.StatusOK, map[string]any{
		"tikkie_url":                      dbVal,
		"tikkie_url_effective":            effective,
		"tikkie_url_env_config":           env,
		"tikkie_url_avondeten":            dbAvondeten,
		"tikkie_url_avondeten_effective":  effectiveAvondeten,
		"tikkie_url_avondeten_env_config": envAvondeten,
	})
}

func (d *Deps) APIAdminSettingsPatch(w http.ResponseWriter, r *http.Request) {
	var body struct {
		TikkieURL          *string `json:"tikkie_url"`
		TikkieURLAvondeten *string `json:"tikkie_url_avondeten"`
	}
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<12))
	if err := dec.Decode(&body); err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_json", "Ongeldige aanvraag.")
		return
	}
	if body.TikkieURL == nil && body.TikkieURLAvondeten == nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_body", "Minstens één van tikkie_url of tikkie_url_avondeten is vereist.")
		return
	}
	if body.TikkieURL != nil {
		normalized, err := validateTikkieURL(*body.TikkieURL)
		if err != nil {
			httpx.JSONError(w, http.StatusBadRequest, "invalid_url", "Tostikaart-Tikkie: "+err.Error())
			return
		}
		if err := d.setTikkieURLIfChanged(r, store.SettingKeyTikkieURL, store.SettingKeyTikkieURLSetAt, normalized); err != nil {
			httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Opslaan mislukt.")
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
			httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Opslaan mislukt.")
			return
		}
	}

	dbVal, err := d.Store.GetAppSetting(r.Context(), store.SettingKeyTikkieURL)
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Instellingen laden mislukt.")
		return
	}
	dbAvondeten, err := d.Store.GetAppSetting(r.Context(), store.SettingKeyTikkieURLAvondeten)
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Instellingen laden mislukt.")
		return
	}
	env := strings.TrimSpace(d.Config.TikkieURL)
	envAvondeten := strings.TrimSpace(d.Config.TikkieURLAvondeten)
	effective := store.EffectiveTikkieURL(dbVal, d.Config.TikkieURL)
	effectiveAvondeten := store.EffectiveTikkieURL(dbAvondeten, d.Config.TikkieURLAvondeten)
	httpx.JSON(w, http.StatusOK, map[string]any{
		"tikkie_url":                      dbVal,
		"tikkie_url_effective":            effective,
		"tikkie_url_env_config":           env,
		"tikkie_url_avondeten":            dbAvondeten,
		"tikkie_url_avondeten_effective":  effectiveAvondeten,
		"tikkie_url_avondeten_env_config": envAvondeten,
	})
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

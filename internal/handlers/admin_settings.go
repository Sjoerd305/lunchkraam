package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"tostikaart/internal/httpx"
	"tostikaart/internal/store"
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
	env := strings.TrimSpace(d.Config.TikkieURL)
	effective := store.EffectiveTikkieURL(dbVal, d.Config.TikkieURL)
	httpx.JSON(w, http.StatusOK, map[string]any{
		"tikkie_url":            dbVal,
		"tikkie_url_effective":  effective,
		"tikkie_url_env_config": env,
	})
}

func (d *Deps) APIAdminSettingsPatch(w http.ResponseWriter, r *http.Request) {
	var body struct {
		TikkieURL string `json:"tikkie_url"`
	}
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<12))
	if err := dec.Decode(&body); err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_json", "Ongeldige aanvraag.")
		return
	}
	normalized, err := validateTikkieURL(body.TikkieURL)
	if err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_url", err.Error())
		return
	}
	if err := d.Store.SetAppSetting(r.Context(), store.SettingKeyTikkieURL, normalized); err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Opslaan mislukt.")
		return
	}
	env := strings.TrimSpace(d.Config.TikkieURL)
	effective := store.EffectiveTikkieURL(normalized, d.Config.TikkieURL)
	httpx.JSON(w, http.StatusOK, map[string]any{
		"tikkie_url":            normalized,
		"tikkie_url_effective":  effective,
		"tikkie_url_env_config": env,
	})
}

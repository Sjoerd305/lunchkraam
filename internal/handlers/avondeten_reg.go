package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"lunchkraam/internal/auth"
	"lunchkraam/internal/httpx"
	"lunchkraam/internal/store"
)

func parseMealDateEuropeAmsterdam(s string) (time.Time, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}, fmt.Errorf("datum vereist")
	}
	loc, err := time.LoadLocation("Europe/Amsterdam")
	if err != nil {
		loc = time.UTC
	}
	t, err := time.ParseInLocation("2006-01-02", s, loc)
	if err != nil {
		return time.Time{}, fmt.Errorf("gebruik JJJJ-MM-DD")
	}
	mealDay := time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, loc)
	now := time.Now().In(loc)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	if mealDay.After(today) {
		return time.Time{}, fmt.Errorf("datum mag niet in de toekomst liggen")
	}
	return mealDay, nil
}

func (d *Deps) APIOperatorAvondetenList(w http.ResponseWriter, r *http.Request) {
	ds := strings.TrimSpace(r.URL.Query().Get("meal_date"))
	day, err := parseMealDateEuropeAmsterdam(ds)
	if err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_date", err.Error())
		return
	}
	rows, err := d.Store.ListAvondetenCardsForMealDate(r.Context(), day)
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Lijst laden mislukt.")
		return
	}
	out := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		out = append(out, map[string]any{
			"card_id":              row.CardID,
			"user_id":              row.UserID,
			"owner_name":           row.OwnerName,
			"owner_email":          row.OwnerEmail,
			"knipjes_remaining":    row.KnipjesRemaining,
			"registered_for_date":  row.RegisteredForDate,
		})
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"meal_date": day.Format("2006-01-02"),
		"cards":     out,
	})
}

func (d *Deps) APIOperatorAvondetenRegister(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFromContext(r.Context())
	var body struct {
		MealDate string  `json:"meal_date"`
		CardIDs  []int64 `json:"card_ids"`
	}
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<14))
	if err := dec.Decode(&body); err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_json", "Ongeldige aanvraag.")
		return
	}
	day, err := parseMealDateEuropeAmsterdam(body.MealDate)
	if err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_date", err.Error())
		return
	}
	if len(body.CardIDs) == 0 {
		httpx.JSONError(w, http.StatusBadRequest, "no_cards", "Kies minstens één persoon.")
		return
	}
	n, err := d.Store.RegisterAvondetenMealsForDate(r.Context(), day, body.CardIDs, u.ID)
	if err != nil {
		switch {
		case errors.Is(err, store.ErrNotFound):
			httpx.JSONError(w, http.StatusBadRequest, "not_found", "Onbekende kaart in de selectie.")
		case errors.Is(err, store.ErrAvondetenWrongCardKind):
			httpx.JSONError(w, http.StatusBadRequest, "wrong_card", "Alleen avondetenkaarten kunnen zo worden geregistreerd.")
		case errors.Is(err, store.ErrNoKnipjes):
			httpx.JSONError(w, http.StatusBadRequest, "no_knipjes", "Een van de kaarten heeft geen streepjes meer.")
		case errors.Is(err, store.ErrAvondetenAlreadyRegistered):
			httpx.JSONError(w, http.StatusConflict, "already_registered", "Een van de kaarten was al geregistreerd voor deze datum. Vernieuw de lijst en probeer opnieuw.")
		default:
			httpx.JSONError(w, http.StatusBadRequest, "register_failed", err.Error())
		}
		return
	}
	d.notifyAvondetenRegistration()
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true, "registered_count": n})
}

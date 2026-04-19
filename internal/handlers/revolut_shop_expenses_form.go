package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"lunchkraam/internal/revolutimport"
)

const maxRevolutCSVFormBytes = 8 << 20

func formTruthy(v string) bool {
	v = strings.TrimSpace(strings.ToLower(v))
	return v == "1" || v == "true" || v == "on" || v == "yes"
}

func parsePositiveFloatForm(s string, defaultVal float64) float64 {
	s = strings.TrimSpace(strings.ReplaceAll(s, ",", "."))
	if s == "" {
		return defaultVal
	}
	v, err := strconv.ParseFloat(s, 64)
	if err != nil || v < 0 {
		return defaultVal
	}
	return v
}

func parseRevolutExcludeMaps(r *http.Request) (debit, credit map[string]struct{}, err error) {
	debit = make(map[string]struct{})
	credit = make(map[string]struct{})
	raw := strings.TrimSpace(r.FormValue("exclude_json"))
	if raw == "" {
		return debit, credit, nil
	}
	var payload struct {
		Debit  []string `json:"debit"`
		Credit []string `json:"credit"`
	}
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		return nil, nil, err
	}
	for _, x := range payload.Debit {
		x = strings.TrimSpace(x)
		if x != "" {
			debit[x] = struct{}{}
		}
	}
	for _, x := range payload.Credit {
		x = strings.TrimSpace(x)
		if x != "" {
			credit[x] = struct{}{}
		}
	}
	return debit, credit, nil
}

func parsePurposeOverridesMaps(r *http.Request) (debit, credit map[string]string, err error) {
	raw := strings.TrimSpace(r.FormValue("purpose_overrides_json"))
	if raw == "" {
		return nil, nil, nil
	}
	var payload struct {
		Debit  map[string]string `json:"debit"`
		Credit map[string]string `json:"credit"`
	}
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		return nil, nil, err
	}
	debit = make(map[string]string)
	for k, v := range payload.Debit {
		k = strings.TrimSpace(k)
		if k == "" {
			continue
		}
		p, ok := revolutimport.NormalizeShopExpensePurpose(v)
		if !ok {
			return nil, nil, fmt.Errorf("ongeldig doel voor uitgave %q", k)
		}
		debit[k] = p
	}
	credit = make(map[string]string)
	for k, v := range payload.Credit {
		k = strings.TrimSpace(k)
		if k == "" {
			continue
		}
		p, ok := revolutimport.NormalizeShopExpensePurpose(v)
		if !ok {
			return nil, nil, fmt.Errorf("ongeldig doel voor inkomsten %q", k)
		}
		credit[k] = p
	}
	if len(debit) == 0 {
		debit = nil
	}
	if len(credit) == 0 {
		credit = nil
	}
	return debit, credit, nil
}

// parseRevolutDefaultPurpose returns normalized purpose or ok=false when invalid.
func parseRevolutDefaultPurpose(r *http.Request) (purpose string, ok bool) {
	purpose = strings.TrimSpace(strings.ToLower(r.FormValue("purpose")))
	if purpose == "" {
		purpose = "lunchkraam"
	}
	if purpose != "lunchkraam" && purpose != "avondeten" {
		return "", false
	}
	return purpose, true
}

// revolutCommonUIForm holds shared multipart fields for preview and import.
type revolutCommonUIForm struct {
	Currency           string
	SkipTypes          string
	Fingerprint        bool
	CompletedOnly      bool
	ImportCredits      bool
	LunchCreditEUR     float64
	AvoCreditEUR       float64
	GuessPurposeByTime bool
}

func parseRevolutCommonUIForm(r *http.Request) revolutCommonUIForm {
	currency := strings.TrimSpace(r.FormValue("currency"))
	skipTypes := r.FormValue("skip_types")
	fingerprint := formTruthy(r.FormValue("fingerprint_missing_id"))

	completedOnly := true
	if v := strings.TrimSpace(strings.ToLower(r.FormValue("completed_only"))); v == "0" || v == "false" || v == "no" || v == "off" {
		completedOnly = false
	}

	importCredits := formTruthy(r.FormValue("import_credits"))
	lunchCredit := parsePositiveFloatForm(r.FormValue("credit_lunch_eur"), 15)
	avoCredit := parsePositiveFloatForm(r.FormValue("credit_avondeten_eur"), 10)

	guessPurposeByTime := true
	switch strings.TrimSpace(strings.ToLower(r.FormValue("guess_purpose_by_time"))) {
	case "0", "false", "no", "off":
		guessPurposeByTime = false
	}

	return revolutCommonUIForm{
		Currency:           currency,
		SkipTypes:          skipTypes,
		Fingerprint:        fingerprint,
		CompletedOnly:      completedOnly,
		ImportCredits:      importCredits,
		LunchCreditEUR:     lunchCredit,
		AvoCreditEUR:       avoCredit,
		GuessPurposeByTime: guessPurposeByTime,
	}
}

func validateRevolutCreditImportAmounts(importCredits bool, lunchEur, avoEur float64) bool {
	if importCredits && lunchEur <= 0 && avoEur <= 0 {
		return false
	}
	return true
}

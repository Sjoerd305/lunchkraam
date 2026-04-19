package handlers

import (
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"lunchkraam/internal/httpx"
)

// parseSalesStatsYear reads ?year= for admin/operator sales-stats and finance-control handlers.
// The returned timezone label is the API-facing stats timezone (UTC only if Amsterdam fails to load).
func parseSalesStatsYear(r *http.Request) (year int, statsTimezone string) {
	loc, locErr := time.LoadLocation("Europe/Amsterdam")
	statsTimezone = "Europe/Amsterdam"
	year = time.Now().Year()
	if locErr != nil {
		statsTimezone = "UTC"
	} else {
		year = time.Now().In(loc).Year()
	}
	if ys := strings.TrimSpace(r.URL.Query().Get("year")); ys != "" {
		if v, err := strconv.Atoi(ys); err == nil && v >= 2000 && v <= 2100 {
			year = v
		}
	}
	return year, statsTimezone
}

func mergeFinanceYears(lists ...[]int) []int {
	seen := make(map[int]struct{})
	for _, list := range lists {
		for _, y := range list {
			seen[y] = struct{}{}
		}
	}
	out := make([]int, 0, len(seen))
	for y := range seen {
		out = append(out, y)
	}
	sort.Slice(out, func(i, j int) bool { return out[i] > out[j] })
	return out
}

func (d *Deps) APIAdminSalesYears(w http.ResponseWriter, r *http.Request) {
	fulfilled, err := d.Store.AdminFulfilledYears(r.Context())
	if err != nil {
		httpx.RespondInternalStoreError(w, r, "AdminFulfilledYears", err)
		return
	}
	expenseYears, err := d.Store.AdminExpenseYears(r.Context())
	if err != nil {
		httpx.RespondInternalStoreError(w, r, "AdminExpenseYears", err)
		return
	}
	bankYears, err := d.Store.AdminBankCreditImportYears(r.Context())
	if err != nil {
		httpx.RespondInternalStoreError(w, r, "AdminBankCreditImportYears", err)
		return
	}
	corrYears, err := d.Store.AdminFinanceCorrectionYears(r.Context())
	if err != nil {
		httpx.RespondInternalStoreError(w, r, "AdminFinanceCorrectionYears", err)
		return
	}
	years := mergeFinanceYears(fulfilled, expenseYears, bankYears, corrYears)
	httpx.JSON(w, http.StatusOK, map[string]any{"years": years})
}

func monthLabelNL(m int) string {
	switch m {
	case 1:
		return "jan"
	case 2:
		return "feb"
	case 3:
		return "mrt"
	case 4:
		return "apr"
	case 5:
		return "mei"
	case 6:
		return "jun"
	case 7:
		return "jul"
	case 8:
		return "aug"
	case 9:
		return "sep"
	case 10:
		return "okt"
	case 11:
		return "nov"
	case 12:
		return "dec"
	default:
		return ""
	}
}

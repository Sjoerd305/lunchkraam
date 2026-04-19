package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"lunchkraam/internal/httpx"
	"lunchkraam/internal/money"
)

const financeControlEpsilonEUR = 0.01

func classifyFinanceControlDelta(revolutImportedEUR, appRevenueEUR, deltaEUR float64) string {
	if revolutImportedEUR == 0 && appRevenueEUR == 0 {
		return "no_activity"
	}
	if deltaEUR > financeControlEpsilonEUR {
		return "revolut_imports_higher"
	}
	if deltaEUR < -financeControlEpsilonEUR {
		return "app_revenue_higher"
	}
	return "in_sync"
}

type financeControlMonthRow struct {
	Month             int     `json:"month"`
	LabelNL           string  `json:"label_nl"`
	RevolutImportsEUR float64 `json:"revolut_imports_eur"`
	AppRevenueEUR     float64 `json:"app_revenue_eur"`
	DeltaEUR          float64 `json:"delta_eur"`
	Status            string  `json:"status"`
}

type financeControlResponse struct {
	Year       int                      `json:"year"`
	Timezone   string                   `json:"timezone"`
	Months     []financeControlMonthRow `json:"months"`
	MethodNote string                   `json:"method_note_nl"`
}

// APIAdminFinanceControl returns per-month Revolut import totals vs app revenue (same basis as sales-stats).
// Registered for GET /api/operator/finance-control and GET /api/admin/finance-control.
func (d *Deps) APIAdminFinanceControl(w http.ResponseWriter, r *http.Request) {
	loc, locErr := time.LoadLocation("Europe/Amsterdam")
	year := time.Now().Year()
	if locErr == nil {
		year = time.Now().In(loc).Year()
	}
	if ys := strings.TrimSpace(r.URL.Query().Get("year")); ys != "" {
		if v, err := strconv.Atoi(ys); err == nil && v >= 2000 && v <= 2100 {
			year = v
		}
	}

	tz := "Europe/Amsterdam"
	if locErr != nil {
		tz = "UTC"
	}

	buckets, err := d.Store.AdminSalesByMonth(r.Context(), year)
	if err != nil {
		httpx.RespondInternalStoreError(w, r, "AdminSalesByMonth", err)
		return
	}
	revTotals, err := d.Store.AdminRevolutImportedTotalsByMonth(r.Context(), year)
	if err != nil {
		httpx.RespondInternalStoreError(w, r, "AdminRevolutImportedTotalsByMonth", err)
		return
	}

	months := make([]financeControlMonthRow, 0, 12)
	for i := 0; i < 12; i++ {
		app := money.RoundEUR(buckets[i].RevenueEUR)
		rev := money.RoundEUR(revTotals[i])
		delta := money.RoundEUR(rev - app)
		months = append(months, financeControlMonthRow{
			Month:             i + 1,
			LabelNL:           monthLabelNL(i + 1),
			RevolutImportsEUR: rev,
			AppRevenueEUR:     app,
			DeltaEUR:          delta,
			Status:            classifyFinanceControlDelta(rev, app, delta),
		})
	}

	resp := financeControlResponse{
		Year:     year,
		Timezone: tz,
		Months:   months,
		MethodNote: "Revolut-kolom: som van alle geïmporteerde bankregels (ontvangstdatum in die maand). " +
			"App-kolom: vervulde kaartverkopen in die maand (Europe/Amsterdam) plus open bank-omzet uit import. " +
			"Delta = Revolut − app (zelfde teken als cmd/revolut-import reconcile). " +
			"Afwijkingen komen door timing (bijv. import in één maand, accordering in een andere).",
	}
	httpx.JSON(w, http.StatusOK, resp)
}

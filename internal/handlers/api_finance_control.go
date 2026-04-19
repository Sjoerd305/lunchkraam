package handlers

import (
	"net/http"

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
	Month                     int     `json:"month"`
	LabelNL                   string  `json:"label_nl"`
	RevolutImportsEUR         float64 `json:"revolut_imports_eur"`
	AppRevenueEUR             float64 `json:"app_revenue_eur"`
	CorrectionsEUR            float64 `json:"corrections_eur"`
	AppInclCorrectionsEUR     float64 `json:"app_incl_corrections_eur"`
	DeltaEUR                  float64 `json:"delta_eur"`
	Status                    string  `json:"status"`
	DeltaInclCorrectionsEUR   float64 `json:"delta_incl_corrections_eur"`
	StatusInclCorrections     string  `json:"status_incl_corrections"`
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
	year, tz := parseSalesStatsYear(r)

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
	corrTotals, err := d.Store.SumFinanceCorrectionsByMonth(r.Context(), year)
	if err != nil {
		httpx.RespondInternalStoreError(w, r, "SumFinanceCorrectionsByMonth", err)
		return
	}

	months := make([]financeControlMonthRow, 0, 12)
	for i := 0; i < 12; i++ {
		app := money.RoundEUR(buckets[i].RevenueEUR)
		rev := money.RoundEUR(revTotals[i])
		corr := money.RoundEUR(corrTotals[i])
		appIncl := money.RoundEUR(app + corr)
		delta := money.RoundEUR(rev - app)
		deltaIncl := money.RoundEUR(rev - appIncl)
		months = append(months, financeControlMonthRow{
			Month:                   i + 1,
			LabelNL:                 monthLabelNL(i + 1),
			RevolutImportsEUR:       rev,
			AppRevenueEUR:           app,
			CorrectionsEUR:          corr,
			AppInclCorrectionsEUR:   appIncl,
			DeltaEUR:                delta,
			Status:                  classifyFinanceControlDelta(rev, app, delta),
			DeltaInclCorrectionsEUR: deltaIncl,
			StatusInclCorrections:   classifyFinanceControlDelta(rev, appIncl, deltaIncl),
		})
	}

	resp := financeControlResponse{
		Year:     year,
		Timezone: tz,
		Months:   months,
		MethodNote: "Revolut-kolom: som van alle geïmporteerde bankregels (ontvangstdatum in die maand). " +
			"App-kolom: vervulde kaartverkopen in die maand (Europe/Amsterdam) plus open bank-omzet uit import. " +
			"Correcties: administratieve aanpassingen (Financiën → overige correcties); meestal negatief bij terugbetaling buiten het standaardpad. " +
			"App incl. correcties = app + som correcties in die maand. " +
			"Delta = Revolut − app (zelfde teken als cmd/revolut-import reconcile); Delta incl. correcties gebruikt de aangepaste app-kolom. " +
			"Afwijkingen komen door timing (bijv. import in één maand, accordering in een andere).",
	}
	httpx.JSON(w, http.StatusOK, resp)
}

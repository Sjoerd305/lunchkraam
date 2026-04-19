package store

import (
	"context"
	"fmt"
)

// AdminRevolutImportedTotalsByMonth sums every Revolut bank_credit_import line by calendar month
// of received_on (all reconciliation statuses). Use next to AdminSalesByMonth RevenueEUR for
// reconcile-style deltas (cf. cmd/revolut-import reconcile: Revolut+ vs app omzet).
func (s *Store) AdminRevolutImportedTotalsByMonth(ctx context.Context, year int) ([12]float64, error) {
	var totals [12]float64
	rows, err := s.pool.Query(ctx, `
SELECT (EXTRACT(MONTH FROM received_on))::int AS m,
       COALESCE(SUM(amount_eur), 0)::float8 AS total
FROM bank_credit_imports
WHERE source = 'revolut'
  AND (EXTRACT(YEAR FROM received_on))::int = $1
GROUP BY 1
ORDER BY 1`,
		year,
	)
	if err != nil {
		return totals, fmt.Errorf("admin revolut imported totals by month: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var m int
		var total float64
		if err := rows.Scan(&m, &total); err != nil {
			return totals, err
		}
		if m >= 1 && m <= 12 {
			totals[m-1] = total
		}
	}
	return totals, rows.Err()
}

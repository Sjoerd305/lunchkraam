package store

import (
	"context"
	"fmt"
)

func (s *Store) AdminDashboardStats(ctx context.Context) (*AdminDashboardStats, error) {
	const q = `
SELECT
  (SELECT COUNT(*)::bigint FROM cards) AS active_cards,
  (SELECT COALESCE(SUM(knipjes_remaining), 0)::bigint FROM cards) AS knipjes_rem_total,
  (SELECT COUNT(*)::bigint FROM card_requests WHERE status = 'pending') AS pending_req,
  (SELECT COUNT(*)::bigint FROM card_requests cr
     INNER JOIN cards c ON c.id = cr.card_id WHERE cr.status = 'pending') AS pending_with_card,
  (SELECT COALESCE(SUM(c.knipjes_remaining), 0)::bigint FROM card_requests cr
     INNER JOIN cards c ON c.id = cr.card_id WHERE cr.status = 'pending') AS pending_knip_rem,
  (SELECT COALESCE(SUM(LEAST(10, GREATEST(0, 10 - c.knipjes_remaining))), 0)::bigint
     FROM card_requests cr
     INNER JOIN cards c ON c.id = cr.card_id WHERE cr.status = 'pending') AS pending_knip_used_est,
  (SELECT COUNT(*)::bigint FROM card_requests WHERE status = 'fulfilled') AS fulfilled_req,
  (SELECT COALESCE(SUM(c.knipjes_remaining), 0)::bigint FROM card_requests cr
     INNER JOIN cards c ON c.id = cr.card_id WHERE cr.status = 'fulfilled') AS fulfilled_knip_rem,
  (SELECT COUNT(*)::bigint FROM card_requests WHERE status = 'cancelled') AS cancelled_req,
  (EXTRACT(YEAR FROM (now() AT TIME ZONE $1)))::int AS finance_y,
  (
    (SELECT COALESCE(SUM(sale_price_eur), 0)::float8 FROM card_requests cr
       WHERE cr.status = 'fulfilled' AND cr.fulfilled_at IS NOT NULL
         AND (EXTRACT(YEAR FROM cr.fulfilled_at AT TIME ZONE $1))::int =
             (EXTRACT(YEAR FROM (now() AT TIME ZONE $1)))::int)
    +
    (SELECT COALESCE(SUM(bci.amount_eur), 0)::float8 FROM bank_credit_imports bci
       WHERE (EXTRACT(YEAR FROM bci.received_on))::int =
             (EXTRACT(YEAR FROM (now() AT TIME ZONE $1)))::int)
  ) AS year_rev,
  (SELECT COALESCE(SUM(se.amount_eur), 0)::float8 FROM shop_expenses se
     WHERE (EXTRACT(YEAR FROM se.spent_on))::int =
           (EXTRACT(YEAR FROM (now() AT TIME ZONE $1)))::int) AS year_exp`
	var st AdminDashboardStats
	var yearRev, yearExp float64
	err := s.pool.QueryRow(ctx, q, adminSalesTZ).Scan(
		&st.ActiveCardsTotal,
		&st.KnipjesRemainingTotal,
		&st.PendingRequests,
		&st.PendingWithCard,
		&st.PendingKnipjesRemaining,
		&st.PendingKnipjesConsumedEst,
		&st.FulfilledRequests,
		&st.FulfilledKnipjesRemaining,
		&st.CancelledRequests,
		&st.FinanceYear,
		&yearRev,
		&yearExp,
	)
	if err != nil {
		return nil, err
	}
	st.YearRevenueEUR = yearRev
	st.YearExpensesEUR = yearExp
	st.YearNetEUR = yearRev - yearExp
	return &st, nil
}

// AdminSalesByMonth aggregates fulfilled card_requests per calendar month in Europe/Amsterdam,
// plus Revolut-imported bank credits (bank_credit_imports) by received_on month.
// Revenue totals include both; kaartverkoop-aantallen komen alleen uit de app.
func (s *Store) AdminSalesByMonth(ctx context.Context, year int) ([12]AdminSalesMonthAgg, error) {
	buckets, err := s.adminCardRequestSalesByMonth(ctx, year)
	if err != nil {
		return buckets, err
	}
	credits, err := s.AdminBankCreditRevenueByMonth(ctx, year)
	if err != nil {
		return buckets, err
	}
	for i := 0; i < 12; i++ {
		c := credits[i]
		buckets[i].RevenueEUR += c.LunchkraamEUR + c.AvondetenEUR
		buckets[i].RevenueEURTosti += c.LunchkraamEUR
		buckets[i].RevenueEURAvondeten += c.AvondetenEUR
	}
	return buckets, nil
}

func (s *Store) adminCardRequestSalesByMonth(ctx context.Context, year int) ([12]AdminSalesMonthAgg, error) {
	var buckets [12]AdminSalesMonthAgg
	const q = `
SELECT (EXTRACT(MONTH FROM fulfilled_at AT TIME ZONE $2))::int AS m,
       COUNT(*)::bigint AS n,
       COALESCE(SUM(sale_price_eur), 0)::float8 AS rev,
       COUNT(*) FILTER (WHERE kind = 'tosti')::bigint AS n_tosti,
       COUNT(*) FILTER (WHERE kind = 'avondeten')::bigint AS n_avondeten,
       COALESCE(SUM(sale_price_eur) FILTER (WHERE kind = 'tosti'), 0)::float8 AS rev_tosti,
       COALESCE(SUM(sale_price_eur) FILTER (WHERE kind = 'avondeten'), 0)::float8 AS rev_avondeten
FROM card_requests
WHERE status = 'fulfilled'
  AND fulfilled_at IS NOT NULL
  AND (EXTRACT(YEAR FROM fulfilled_at AT TIME ZONE $2))::int = $1
GROUP BY 1
ORDER BY 1`
	rows, err := s.pool.Query(ctx, q, year, adminSalesTZ)
	if err != nil {
		return buckets, fmt.Errorf("admin card request sales by month: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var m int
		var n int64
		var rev float64
		var nTosti int64
		var nAvondeten int64
		var revTosti float64
		var revAvondeten float64
		if err := rows.Scan(&m, &n, &rev, &nTosti, &nAvondeten, &revTosti, &revAvondeten); err != nil {
			return buckets, err
		}
		idx := m - 1
		if idx >= 0 && idx < len(buckets) {
			buckets[idx].FulfilledCount = n
			buckets[idx].RevenueEUR = rev
			buckets[idx].FulfilledCountTosti = nTosti
			buckets[idx].FulfilledCountAvondeten = nAvondeten
			buckets[idx].RevenueEURTosti = revTosti
			buckets[idx].RevenueEURAvondeten = revAvondeten
		}
	}
	return buckets, rows.Err()
}

// AdminFulfilledYears returns calendar years (Europe/Amsterdam) that have at least one fulfilled sale, newest first.
func (s *Store) AdminFulfilledYears(ctx context.Context) ([]int, error) {
	const q = `
SELECT DISTINCT (EXTRACT(YEAR FROM fulfilled_at AT TIME ZONE $1))::int AS y
FROM card_requests
WHERE status = 'fulfilled' AND fulfilled_at IS NOT NULL
ORDER BY y DESC`
	rows, err := s.pool.Query(ctx, q, adminSalesTZ)
	if err != nil {
		return nil, fmt.Errorf("admin fulfilled years: %w", err)
	}
	defer rows.Close()
	var out []int
	for rows.Next() {
		var y int
		if err := rows.Scan(&y); err != nil {
			return nil, err
		}
		out = append(out, y)
	}
	return out, rows.Err()
}

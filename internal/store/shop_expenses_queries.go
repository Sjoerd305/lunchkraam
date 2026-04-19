package store

import (
	"context"
	"fmt"
)

// ListShopExpensesByYear returns expenses for a calendar year (spent_on), newest first.
func (s *Store) ListShopExpensesByYear(ctx context.Context, year int) ([]ShopExpense, error) {
	rows, err := s.pool.Query(ctx, `
SELECT id, amount_eur::float8, spent_on, COALESCE(description, ''), purpose, payment_channel, created_at, source, COALESCE(external_id, '')
FROM shop_expenses
WHERE (EXTRACT(YEAR FROM spent_on))::int = $1
ORDER BY spent_on DESC, id DESC`,
		year,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ShopExpense
	for rows.Next() {
		var e ShopExpense
		if err := rows.Scan(&e.ID, &e.AmountEUR, &e.SpentOn, &e.Description, &e.Purpose, &e.PaymentChannel, &e.CreatedAt, &e.Source, &e.ExternalID); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// AdminExpensesByMonth sums expenses per calendar month and purpose for spent_on in the given year.
// Indices 0–11 represent Jan–Dec.
func (s *Store) AdminExpensesByMonth(ctx context.Context, year int) ([12]AdminExpenseMonthAgg, error) {
	var buckets [12]AdminExpenseMonthAgg
	rows, err := s.pool.Query(ctx, `
SELECT (EXTRACT(MONTH FROM spent_on))::int AS m,
       COALESCE(SUM(amount_eur) FILTER (WHERE purpose = 'lunchkraam'), 0)::float8 AS lunchkraam_total,
       COALESCE(SUM(amount_eur) FILTER (WHERE purpose = 'avondeten'), 0)::float8 AS avondeten_total
FROM shop_expenses
WHERE (EXTRACT(YEAR FROM spent_on))::int = $1
GROUP BY 1
ORDER BY 1`,
		year,
	)
	if err != nil {
		return buckets, fmt.Errorf("admin expenses by month: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var m int
		var lunchkraamTotal float64
		var avondetenTotal float64
		if err := rows.Scan(&m, &lunchkraamTotal, &avondetenTotal); err != nil {
			return buckets, err
		}
		idx := m - 1
		if idx >= 0 && idx < 12 {
			buckets[idx] = AdminExpenseMonthAgg{
				LunchkraamEUR: lunchkraamTotal,
				AvondetenEUR:  avondetenTotal,
			}
		}
	}
	return buckets, rows.Err()
}

// AdminExpenseYears returns calendar years that have at least one expense, newest first.
func (s *Store) AdminExpenseYears(ctx context.Context) ([]int, error) {
	rows, err := s.pool.Query(ctx, `
SELECT DISTINCT (EXTRACT(YEAR FROM spent_on))::int AS y
FROM shop_expenses
ORDER BY y DESC`)
	if err != nil {
		return nil, fmt.Errorf("admin expense years: %w", err)
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

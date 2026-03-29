package store

import (
	"context"
	"fmt"
	"strings"
	"time"

)

// ShopExpense is a manual grocery / supply cost entry (amount on calendar date spent_on).
type ShopExpense struct {
	ID          int64
	AmountEUR   float64
	SpentOn     time.Time
	Description string
	CreatedAt   time.Time
}

// InsertShopExpense records a positive expense; spentOn is the calendar date (time-of-day ignored).
func (s *Store) InsertShopExpense(ctx context.Context, createdBy int64, amountEUR float64, spentOn time.Time, description string) (*ShopExpense, error) {
	if amountEUR <= 0 {
		return nil, fmt.Errorf("bedrag moet groter dan nul zijn")
	}
	desc := strings.TrimSpace(description)
	dateStr := spentOn.UTC().Format("2006-01-02")
	row := s.pool.QueryRow(ctx, `
INSERT INTO shop_expenses (amount_eur, spent_on, description, created_by)
VALUES ($1, $2::date, $3, $4)
RETURNING id, amount_eur::float8, spent_on, COALESCE(description, ''), created_at`,
		amountEUR, dateStr, desc, createdBy,
	)
	var e ShopExpense
	if err := row.Scan(&e.ID, &e.AmountEUR, &e.SpentOn, &e.Description, &e.CreatedAt); err != nil {
		return nil, err
	}
	return &e, nil
}

// DeleteShopExpense removes a row by id.
func (s *Store) DeleteShopExpense(ctx context.Context, id int64) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM shop_expenses WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ListShopExpensesByYear returns expenses for a calendar year (spent_on), newest first.
func (s *Store) ListShopExpensesByYear(ctx context.Context, year int) ([]ShopExpense, error) {
	rows, err := s.pool.Query(ctx, `
SELECT id, amount_eur::float8, spent_on, COALESCE(description, ''), created_at
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
		if err := rows.Scan(&e.ID, &e.AmountEUR, &e.SpentOn, &e.Description, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// AdminExpensesByMonth sums expenses per calendar month for spent_on in the given year (indices 0–11 = Jan–Dec).
func (s *Store) AdminExpensesByMonth(ctx context.Context, year int) ([12]float64, error) {
	var buckets [12]float64
	rows, err := s.pool.Query(ctx, `
SELECT (EXTRACT(MONTH FROM spent_on))::int AS m,
       COALESCE(SUM(amount_eur), 0)::float8 AS total
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
		var total float64
		if err := rows.Scan(&m, &total); err != nil {
			return buckets, err
		}
		idx := m - 1
		if idx >= 0 && idx < 12 {
			buckets[idx] = total
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

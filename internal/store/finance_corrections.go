package store

import (
	"context"
	"fmt"
	"strings"
	"time"
)

// Finance correction kinds (must match DB check constraint finance_corrections_kind_check).
const (
	FinanceCorrectionKindRefundOutsideApp   = "refund_outside_app"
	FinanceCorrectionKindOtherBranchGuest   = "other_branch_guest"
	FinanceCorrectionKindInternalSettlement = "internal_settlement"
	FinanceCorrectionKindOther              = "other"
)

// FinanceCorrection is an administrative adjustment to app-side control totals (not Revolut, not shop_expenses).
type FinanceCorrection struct {
	ID          int64
	RecordedOn  time.Time
	Purpose     string
	Kind        string
	AmountEUR   float64
	Description string
	CreatedBy   *int64
	CreatedAt   time.Time
}

// ListFinanceCorrectionsByYear returns corrections for calendar year of recorded_on, newest first.
func (s *Store) ListFinanceCorrectionsByYear(ctx context.Context, year int) ([]FinanceCorrection, error) {
	rows, err := s.pool.Query(ctx, `
SELECT id, recorded_on, purpose, kind, amount_eur::float8, COALESCE(description, ''), created_by, created_at
FROM finance_corrections
WHERE (EXTRACT(YEAR FROM recorded_on))::int = $1
ORDER BY recorded_on DESC, id DESC`,
		year,
	)
	if err != nil {
		return nil, fmt.Errorf("list finance corrections: %w", err)
	}
	defer rows.Close()
	var out []FinanceCorrection
	for rows.Next() {
		var c FinanceCorrection
		if err := rows.Scan(
			&c.ID, &c.RecordedOn, &c.Purpose, &c.Kind, &c.AmountEUR, &c.Description, &c.CreatedBy, &c.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// SumFinanceCorrectionsByMonth sums amount_eur per calendar month of recorded_on for the given year.
func (s *Store) SumFinanceCorrectionsByMonth(ctx context.Context, year int) ([12]float64, error) {
	var sums [12]float64
	rows, err := s.pool.Query(ctx, `
SELECT (EXTRACT(MONTH FROM recorded_on))::int AS m,
       COALESCE(SUM(amount_eur), 0)::float8 AS total
FROM finance_corrections
WHERE (EXTRACT(YEAR FROM recorded_on))::int = $1
GROUP BY 1
ORDER BY 1`,
		year,
	)
	if err != nil {
		return sums, fmt.Errorf("sum finance corrections by month: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var m int
		var total float64
		if err := rows.Scan(&m, &total); err != nil {
			return sums, err
		}
		if m >= 1 && m <= 12 {
			sums[m-1] = total
		}
	}
	return sums, rows.Err()
}

// AdminFinanceCorrectionYears returns distinct calendar years with at least one correction, newest first.
func (s *Store) AdminFinanceCorrectionYears(ctx context.Context) ([]int, error) {
	rows, err := s.pool.Query(ctx, `
SELECT DISTINCT (EXTRACT(YEAR FROM recorded_on))::int AS y
FROM finance_corrections
ORDER BY y DESC`)
	if err != nil {
		return nil, fmt.Errorf("finance correction years: %w", err)
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

// InsertFinanceCorrection records a signed adjustment (non-zero amount).
func (s *Store) InsertFinanceCorrection(
	ctx context.Context,
	createdBy int64,
	recordedOn time.Time,
	purpose, kind string,
	amountEUR float64,
	description string,
) (*FinanceCorrection, error) {
	if amountEUR == 0 {
		return nil, fmt.Errorf("bedrag mag niet nul zijn")
	}
	desc := strings.TrimSpace(description)
	if len(desc) > 500 {
		return nil, fmt.Errorf("omschrijving te lang (max 500 tekens)")
	}
	dateStr := recordedOn.UTC().Format("2006-01-02")
	row := s.pool.QueryRow(ctx, `
INSERT INTO finance_corrections (recorded_on, purpose, kind, amount_eur, description, created_by)
VALUES ($1::date, $2, $3, $4, $5, $6)
RETURNING id, recorded_on, purpose, kind, amount_eur::float8, COALESCE(description, ''), created_by, created_at`,
		dateStr, purpose, kind, amountEUR, desc, createdBy,
	)
	var c FinanceCorrection
	if err := row.Scan(
		&c.ID, &c.RecordedOn, &c.Purpose, &c.Kind, &c.AmountEUR, &c.Description, &c.CreatedBy, &c.CreatedAt,
	); err != nil {
		return nil, err
	}
	return &c, nil
}

// DeleteFinanceCorrection removes a row by id.
func (s *Store) DeleteFinanceCorrection(ctx context.Context, id int64) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM finance_corrections WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

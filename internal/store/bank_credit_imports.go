package store

import (
	"context"
	"fmt"
	"strings"
	"time"
)

const BankCreditSourceRevolut = "revolut"

// UpsertImportedBankCredit inserts or updates a row keyed by (source, external_id).
// source must be BankCreditSourceRevolut; externalID must be non-empty.
func (s *Store) UpsertImportedBankCredit(
	ctx context.Context,
	source, externalID string,
	createdBy *int64,
	amountEUR float64,
	receivedOn time.Time,
	description, purpose string,
) error {
	source = strings.TrimSpace(strings.ToLower(source))
	externalID = strings.TrimSpace(externalID)
	if source == "" || externalID == "" {
		return fmt.Errorf("bron en externe id zijn verplicht")
	}
	if source != BankCreditSourceRevolut {
		return fmt.Errorf("onbekende bron %q", source)
	}
	if amountEUR <= 0 {
		return fmt.Errorf("bedrag moet groter dan nul zijn")
	}
	if purpose != "lunchkraam" && purpose != "avondeten" {
		return fmt.Errorf("ongeldig doel %q", purpose)
	}
	desc := strings.TrimSpace(description)
	dateStr := receivedOn.UTC().Format("2006-01-02")
	var created any
	if createdBy != nil {
		created = *createdBy
	}
	_, err := s.pool.Exec(ctx, `
INSERT INTO bank_credit_imports (amount_eur, received_on, description, purpose, created_by, source, external_id)
VALUES ($1, $2::date, $3, $4, $5, $6, $7)
ON CONFLICT (source, external_id) DO UPDATE SET
    amount_eur = EXCLUDED.amount_eur,
    received_on = EXCLUDED.received_on,
    description = EXCLUDED.description,
    purpose = EXCLUDED.purpose`,
		amountEUR, dateStr, desc, purpose, created, source, externalID,
	)
	return err
}

// AdminBankCreditRevenueByMonth sums imported bank credits per calendar month (received_on) for spent year.
// Indices 0–11 are January–December. Lunchkraam maps to tosti revenue; avondeten to avondeten revenue in charts.
func (s *Store) AdminBankCreditRevenueByMonth(ctx context.Context, year int) ([12]AdminExpenseMonthAgg, error) {
	var buckets [12]AdminExpenseMonthAgg
	rows, err := s.pool.Query(ctx, `
SELECT (EXTRACT(MONTH FROM received_on))::int AS m,
       COALESCE(SUM(amount_eur) FILTER (WHERE purpose = 'lunchkraam'), 0)::float8 AS lunchkraam_total,
       COALESCE(SUM(amount_eur) FILTER (WHERE purpose = 'avondeten'), 0)::float8 AS avondeten_total
FROM bank_credit_imports
WHERE (EXTRACT(YEAR FROM received_on))::int = $1
GROUP BY 1
ORDER BY 1`,
		year,
	)
	if err != nil {
		return buckets, fmt.Errorf("admin bank credit revenue by month: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var m int
		var lunch, av float64
		if err := rows.Scan(&m, &lunch, &av); err != nil {
			return buckets, err
		}
		idx := m - 1
		if idx >= 0 && idx < 12 {
			buckets[idx] = AdminExpenseMonthAgg{LunchkraamEUR: lunch, AvondetenEUR: av}
		}
	}
	return buckets, rows.Err()
}

// AdminBankCreditImportYears returns calendar years that have at least one imported credit, newest first.
func (s *Store) AdminBankCreditImportYears(ctx context.Context) ([]int, error) {
	rows, err := s.pool.Query(ctx, `
SELECT DISTINCT (EXTRACT(YEAR FROM received_on))::int AS y
FROM bank_credit_imports
ORDER BY y DESC`)
	if err != nil {
		return nil, fmt.Errorf("admin bank credit years: %w", err)
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

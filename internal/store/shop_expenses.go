package store

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// Shop expense row sources (must match DB check constraint shop_expenses_source_check).
const (
	ShopExpenseSourceManual  = "manual"
	ShopExpenseSourceRevolut = "revolut"
)

// ShopExpense is a grocery / supply cost entry (amount on calendar date spent_on).
type ShopExpense struct {
	ID          int64
	AmountEUR   float64
	SpentOn     time.Time
	Description string
	Purpose     string
	Source      string
	ExternalID  string
	CreatedAt   time.Time
}

type ShopExpenseReceipt struct {
	ID            int64
	ShopExpenseID int64
	StoragePath   string
	ContentType   string
	SizeBytes     int64
	SHA256        string
	CreatedAt     time.Time
}

// AdminExpenseMonthAgg is the monthly expense split by purpose.
type AdminExpenseMonthAgg struct {
	LunchkraamEUR float64
	AvondetenEUR  float64
}

// InsertShopExpense records a positive expense; spentOn is the calendar date (time-of-day ignored).
// purpose must be lunchkraam or avondeten (caller validates).
func (s *Store) InsertShopExpense(ctx context.Context, createdBy int64, amountEUR float64, spentOn time.Time, description, purpose string) (*ShopExpense, error) {
	if amountEUR <= 0 {
		return nil, fmt.Errorf("bedrag moet groter dan nul zijn")
	}
	desc := strings.TrimSpace(description)
	dateStr := spentOn.UTC().Format("2006-01-02")
	row := s.pool.QueryRow(ctx, `
INSERT INTO shop_expenses (amount_eur, spent_on, description, purpose, created_by)
VALUES ($1, $2::date, $3, $4, $5)
RETURNING id, amount_eur::float8, spent_on, COALESCE(description, ''), purpose, created_at, source, COALESCE(external_id, '')`,
		amountEUR, dateStr, desc, purpose, createdBy,
	)
	var e ShopExpense
	if err := row.Scan(&e.ID, &e.AmountEUR, &e.SpentOn, &e.Description, &e.Purpose, &e.CreatedAt, &e.Source, &e.ExternalID); err != nil {
		return nil, err
	}
	return &e, nil
}

// UpsertImportedShopExpense inserts or updates a row keyed by (source, external_id).
// source must be a valid DB value (e.g. ShopExpenseSourceRevolut); externalID must be non-empty.
// amountEUR must be positive; createdBy may be nil to store NULL.
func (s *Store) UpsertImportedShopExpense(
	ctx context.Context,
	source, externalID string,
	createdBy *int64,
	amountEUR float64,
	spentOn time.Time,
	description, purpose string,
) (*ShopExpense, error) {
	source = strings.TrimSpace(strings.ToLower(source))
	externalID = strings.TrimSpace(externalID)
	if source == "" || externalID == "" {
		return nil, fmt.Errorf("bron en externe id zijn verplicht")
	}
	if source != ShopExpenseSourceRevolut {
		return nil, fmt.Errorf("onbekende bron %q", source)
	}
	if amountEUR <= 0 {
		return nil, fmt.Errorf("bedrag moet groter dan nul zijn")
	}
	desc := strings.TrimSpace(description)
	dateStr := spentOn.UTC().Format("2006-01-02")
	var created any
	if createdBy != nil {
		created = *createdBy
	}
	row := s.pool.QueryRow(ctx, `
INSERT INTO shop_expenses (amount_eur, spent_on, description, purpose, created_by, source, external_id)
VALUES ($1, $2::date, $3, $4, $5, $6, $7)
ON CONFLICT (source, external_id) DO UPDATE SET
    amount_eur = EXCLUDED.amount_eur,
    spent_on = EXCLUDED.spent_on,
    description = EXCLUDED.description,
    purpose = EXCLUDED.purpose
RETURNING id, amount_eur::float8, spent_on, COALESCE(description, ''), purpose, created_at, source, COALESCE(external_id, '')`,
		amountEUR, dateStr, desc, purpose, created, source, externalID,
	)
	var e ShopExpense
	if err := row.Scan(&e.ID, &e.AmountEUR, &e.SpentOn, &e.Description, &e.Purpose, &e.CreatedAt, &e.Source, &e.ExternalID); err != nil {
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

// UpdateShopExpensePurpose sets purpose to lunchkraam or avondeten.
func (s *Store) UpdateShopExpensePurpose(ctx context.Context, id int64, purpose string) (*ShopExpense, error) {
	if purpose != "lunchkraam" && purpose != "avondeten" {
		return nil, fmt.Errorf("purpose must be lunchkraam or avondeten")
	}
	row := s.pool.QueryRow(ctx, `
UPDATE shop_expenses SET purpose = $1 WHERE id = $2
RETURNING id, amount_eur::float8, spent_on, COALESCE(description, ''), purpose, created_at, source, COALESCE(external_id, '')`,
		purpose, id,
	)
	var e ShopExpense
	if err := row.Scan(&e.ID, &e.AmountEUR, &e.SpentOn, &e.Description, &e.Purpose, &e.CreatedAt, &e.Source, &e.ExternalID); err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &e, nil
}

func (s *Store) ShopExpenseByID(ctx context.Context, id int64) (*ShopExpense, error) {
	row := s.pool.QueryRow(ctx, `
SELECT id, amount_eur::float8, spent_on, COALESCE(description, ''), purpose, created_at, source, COALESCE(external_id, '')
FROM shop_expenses
WHERE id = $1`, id)
	var e ShopExpense
	if err := row.Scan(&e.ID, &e.AmountEUR, &e.SpentOn, &e.Description, &e.Purpose, &e.CreatedAt, &e.Source, &e.ExternalID); err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &e, nil
}

func (s *Store) UpsertShopExpenseReceipt(
	ctx context.Context,
	expenseID int64,
	storagePath string,
	contentType string,
	sizeBytes int64,
	sha256 string,
) (*ShopExpenseReceipt, error) {
	row := s.pool.QueryRow(ctx, `
INSERT INTO shop_expense_receipts (shop_expense_id, storage_path, content_type, size_bytes, sha256)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (shop_expense_id) DO UPDATE SET
    storage_path = EXCLUDED.storage_path,
    content_type = EXCLUDED.content_type,
    size_bytes = EXCLUDED.size_bytes,
    sha256 = EXCLUDED.sha256,
    created_at = now()
RETURNING id, shop_expense_id, storage_path, content_type, size_bytes, sha256, created_at`,
		expenseID, storagePath, contentType, sizeBytes, sha256,
	)
	var rec ShopExpenseReceipt
	if err := row.Scan(
		&rec.ID,
		&rec.ShopExpenseID,
		&rec.StoragePath,
		&rec.ContentType,
		&rec.SizeBytes,
		&rec.SHA256,
		&rec.CreatedAt,
	); err != nil {
		return nil, err
	}
	return &rec, nil
}

func (s *Store) ShopExpenseReceiptByExpenseID(ctx context.Context, expenseID int64) (*ShopExpenseReceipt, error) {
	row := s.pool.QueryRow(ctx, `
SELECT id, shop_expense_id, storage_path, content_type, size_bytes, sha256, created_at
FROM shop_expense_receipts
WHERE shop_expense_id = $1`, expenseID)
	var rec ShopExpenseReceipt
	if err := row.Scan(
		&rec.ID,
		&rec.ShopExpenseID,
		&rec.StoragePath,
		&rec.ContentType,
		&rec.SizeBytes,
		&rec.SHA256,
		&rec.CreatedAt,
	); err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &rec, nil
}

func (s *Store) DeleteShopExpenseReceipt(ctx context.Context, expenseID int64) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM shop_expense_receipts WHERE shop_expense_id = $1`, expenseID)
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
SELECT id, amount_eur::float8, spent_on, COALESCE(description, ''), purpose, created_at, source, COALESCE(external_id, '')
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
		if err := rows.Scan(&e.ID, &e.AmountEUR, &e.SpentOn, &e.Description, &e.Purpose, &e.CreatedAt, &e.Source, &e.ExternalID); err != nil {
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

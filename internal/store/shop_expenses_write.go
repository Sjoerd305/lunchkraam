package store

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// InsertShopExpense records a manual booking; spentOn is the calendar date (time-of-day ignored).
// amountEUR must be non-zero (positive = uitgave, negative = contant bij de kas).
// paymentChannel must be contant or digitaal when amountEUR > 0, or kas_bij when amountEUR < 0 (caller validates).
// purpose must be lunchkraam or avondeten (caller validates).
func (s *Store) InsertShopExpense(ctx context.Context, createdBy int64, amountEUR float64, spentOn time.Time, description, purpose, paymentChannel string) (*ShopExpense, error) {
	if amountEUR == 0 {
		return nil, fmt.Errorf("bedrag mag niet nul zijn")
	}
	desc := strings.TrimSpace(description)
	dateStr := spentOn.UTC().Format("2006-01-02")
	row := s.pool.QueryRow(ctx, `
INSERT INTO shop_expenses (amount_eur, spent_on, description, purpose, created_by, payment_channel)
VALUES ($1, $2::date, $3, $4, $5, $6)
RETURNING id, amount_eur::float8, spent_on, COALESCE(description, ''), purpose, payment_channel, created_at, source, COALESCE(external_id, '')`,
		amountEUR, dateStr, desc, purpose, createdBy, paymentChannel,
	)
	var e ShopExpense
	if err := row.Scan(&e.ID, &e.AmountEUR, &e.SpentOn, &e.Description, &e.Purpose, &e.PaymentChannel, &e.CreatedAt, &e.Source, &e.ExternalID); err != nil {
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
	return upsertImportedShopExpense(ctx, s.pool, source, externalID, createdBy, amountEUR, spentOn, description, purpose)
}

func upsertImportedShopExpense(
	ctx context.Context,
	conn pgConn,
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
	row := conn.QueryRow(ctx, `
INSERT INTO shop_expenses (amount_eur, spent_on, description, purpose, created_by, source, external_id, payment_channel)
VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8)
ON CONFLICT (source, external_id) DO UPDATE SET
    amount_eur = EXCLUDED.amount_eur,
    spent_on = EXCLUDED.spent_on,
    description = EXCLUDED.description,
    purpose = EXCLUDED.purpose,
    payment_channel = EXCLUDED.payment_channel
RETURNING id, amount_eur::float8, spent_on, COALESCE(description, ''), purpose, payment_channel, created_at, source, COALESCE(external_id, '')`,
		amountEUR, dateStr, desc, purpose, created, source, externalID, ShopExpensePaymentDigitaal,
	)
	var e ShopExpense
	if err := row.Scan(&e.ID, &e.AmountEUR, &e.SpentOn, &e.Description, &e.Purpose, &e.PaymentChannel, &e.CreatedAt, &e.Source, &e.ExternalID); err != nil {
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
RETURNING id, amount_eur::float8, spent_on, COALESCE(description, ''), purpose, payment_channel, created_at, source, COALESCE(external_id, '')`,
		purpose, id,
	)
	var e ShopExpense
	if err := row.Scan(&e.ID, &e.AmountEUR, &e.SpentOn, &e.Description, &e.Purpose, &e.PaymentChannel, &e.CreatedAt, &e.Source, &e.ExternalID); err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &e, nil
}

func (s *Store) ShopExpenseByID(ctx context.Context, id int64) (*ShopExpense, error) {
	row := s.pool.QueryRow(ctx, `
SELECT id, amount_eur::float8, spent_on, COALESCE(description, ''), purpose, payment_channel, created_at, source, COALESCE(external_id, '')
FROM shop_expenses
WHERE id = $1`, id)
	var e ShopExpense
	if err := row.Scan(&e.ID, &e.AmountEUR, &e.SpentOn, &e.Description, &e.Purpose, &e.PaymentChannel, &e.CreatedAt, &e.Source, &e.ExternalID); err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &e, nil
}

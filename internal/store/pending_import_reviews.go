package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

// PendingImportReview is a Revolut import row staged for admin review because it
// matches an existing manual expense (same amount + date).
type PendingImportReview struct {
	ID               int64
	AmountEUR        float64
	SpentOn          time.Time
	Description      string
	Purpose          string
	Source           string
	ExternalID       string
	MatchedExpenseID int64
	CreatedBy        *int64
	CreatedAt        time.Time
}

// PendingReviewWithMatch combines a pending review with the matched manual expense.
type PendingReviewWithMatch struct {
	Review         PendingImportReview
	MatchedExpense ShopExpense
}

// FindMatchingManualExpenses returns manual expenses with the exact amount and date.
func (s *Store) FindMatchingManualExpenses(ctx context.Context, amountEUR float64, spentOn time.Time) ([]ShopExpense, error) {
	dateStr := spentOn.UTC().Format("2006-01-02")
	rows, err := s.pool.Query(ctx, `
SELECT id, amount_eur::float8, spent_on, COALESCE(description, ''), purpose, created_at, source, COALESCE(external_id, '')
FROM shop_expenses
WHERE source = 'manual'
  AND amount_eur = $1
  AND spent_on = $2::date`,
		amountEUR, dateStr,
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

// ShopExpenseExistsBySourceAndExternalID checks whether a shop_expense row exists for (source, external_id).
func (s *Store) ShopExpenseExistsBySourceAndExternalID(ctx context.Context, source, externalID string) (bool, error) {
	var exists bool
	err := s.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM shop_expenses WHERE source = $1 AND external_id = $2)`,
		source, externalID).Scan(&exists)
	return exists, err
}

// InsertPendingImportReview stages a Revolut row for review. Uses ON CONFLICT DO NOTHING
// so re-importing the same CSV is idempotent. Returns true if a new row was inserted.
func (s *Store) InsertPendingImportReview(
	ctx context.Context,
	amountEUR float64,
	spentOn time.Time,
	description, purpose, source, externalID string,
	matchedExpenseID int64,
	createdBy *int64,
) (bool, error) {
	dateStr := spentOn.UTC().Format("2006-01-02")
	var created any
	if createdBy != nil {
		created = *createdBy
	}
	tag, err := s.pool.Exec(ctx, `
INSERT INTO pending_import_reviews (amount_eur, spent_on, description, purpose, source, external_id, matched_expense_id, created_by)
VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8)
ON CONFLICT (source, external_id) DO NOTHING`,
		amountEUR, dateStr, description, purpose, source, externalID, matchedExpenseID, created,
	)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

// ListPendingImportReviews returns all pending reviews joined with their matched manual expenses.
func (s *Store) ListPendingImportReviews(ctx context.Context) ([]PendingReviewWithMatch, error) {
	rows, err := s.pool.Query(ctx, `
SELECT
    p.id, p.amount_eur::float8, p.spent_on, COALESCE(p.description, ''), p.purpose,
    p.source, p.external_id, p.matched_expense_id, p.created_by, p.created_at,
    e.id, e.amount_eur::float8, e.spent_on, COALESCE(e.description, ''), e.purpose,
    e.created_at, e.source, COALESCE(e.external_id, '')
FROM pending_import_reviews p
JOIN shop_expenses e ON e.id = p.matched_expense_id
ORDER BY p.created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []PendingReviewWithMatch
	for rows.Next() {
		var r PendingReviewWithMatch
		if err := rows.Scan(
			&r.Review.ID, &r.Review.AmountEUR, &r.Review.SpentOn, &r.Review.Description, &r.Review.Purpose,
			&r.Review.Source, &r.Review.ExternalID, &r.Review.MatchedExpenseID, &r.Review.CreatedBy, &r.Review.CreatedAt,
			&r.MatchedExpense.ID, &r.MatchedExpense.AmountEUR, &r.MatchedExpense.SpentOn, &r.MatchedExpense.Description, &r.MatchedExpense.Purpose,
			&r.MatchedExpense.CreatedAt, &r.MatchedExpense.Source, &r.MatchedExpense.ExternalID,
		); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// DeletePendingImportReview removes a pending review by id and returns the deleted row.
func (s *Store) DeletePendingImportReview(ctx context.Context, id int64) (*PendingImportReview, error) {
	row := s.pool.QueryRow(ctx, `
DELETE FROM pending_import_reviews WHERE id = $1
RETURNING id, amount_eur::float8, spent_on, COALESCE(description, ''), purpose, source, external_id, matched_expense_id, created_by, created_at`, id)
	var r PendingImportReview
	if err := row.Scan(
		&r.ID, &r.AmountEUR, &r.SpentOn, &r.Description, &r.Purpose,
		&r.Source, &r.ExternalID, &r.MatchedExpenseID, &r.CreatedBy, &r.CreatedAt,
	); err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &r, nil
}

// ReassignShopExpenseReceipts moves all receipts from one expense to another.
func (s *Store) ReassignShopExpenseReceipts(ctx context.Context, fromExpenseID, toExpenseID int64) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE shop_expense_receipts SET shop_expense_id = $1 WHERE shop_expense_id = $2`,
		toExpenseID, fromExpenseID)
	return err
}

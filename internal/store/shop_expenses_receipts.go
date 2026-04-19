package store

import (
	"context"

	"github.com/jackc/pgx/v5"
)

// InsertShopExpenseReceipt adds another receipt image for an expense.
func (s *Store) InsertShopExpenseReceipt(
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

// CountShopExpenseReceipts returns how many receipt rows exist for an expense.
func (s *Store) CountShopExpenseReceipts(ctx context.Context, expenseID int64) (int64, error) {
	var n int64
	err := s.pool.QueryRow(ctx, `SELECT COUNT(*) FROM shop_expense_receipts WHERE shop_expense_id = $1`, expenseID).Scan(&n)
	return n, err
}

// ListShopExpenseReceiptsByExpenseID returns receipts oldest first.
func (s *Store) ListShopExpenseReceiptsByExpenseID(ctx context.Context, expenseID int64) ([]ShopExpenseReceipt, error) {
	rows, err := s.pool.Query(ctx, `
SELECT id, shop_expense_id, storage_path, content_type, size_bytes, sha256, created_at
FROM shop_expense_receipts
WHERE shop_expense_id = $1
ORDER BY created_at ASC, id ASC`, expenseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ShopExpenseReceipt
	for rows.Next() {
		var rec ShopExpenseReceipt
		if err := rows.Scan(
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
		out = append(out, rec)
	}
	return out, rows.Err()
}

// ShopExpenseReceiptByID loads one receipt row by primary key.
func (s *Store) ShopExpenseReceiptByID(ctx context.Context, receiptID int64) (*ShopExpenseReceipt, error) {
	row := s.pool.QueryRow(ctx, `
SELECT id, shop_expense_id, storage_path, content_type, size_bytes, sha256, created_at
FROM shop_expense_receipts
WHERE id = $1`, receiptID)
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

// DeleteShopExpenseReceiptByID removes one receipt; returns the row for filesystem cleanup.
func (s *Store) DeleteShopExpenseReceiptByID(ctx context.Context, receiptID int64) (*ShopExpenseReceipt, error) {
	row := s.pool.QueryRow(ctx, `
DELETE FROM shop_expense_receipts WHERE id = $1
RETURNING id, shop_expense_id, storage_path, content_type, size_bytes, sha256, created_at`, receiptID)
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

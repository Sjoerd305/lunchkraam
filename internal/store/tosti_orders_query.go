package store

import (
	"context"
	"database/sql"
	"errors"

	"github.com/jackc/pgx/v5"
)

// TostiOrderOwnerID returns the member user_id for an order (any status).
func (s *Store) TostiOrderOwnerID(ctx context.Context, orderID int64) (int64, error) {
	var uid int64
	err := s.pool.QueryRow(ctx, `SELECT user_id FROM tosti_orders WHERE id = $1`, orderID).Scan(&uid)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrNotFound
	}
	return uid, err
}

// ListTostiOrdersForUser returns recent orders for the user, newest first.
func (s *Store) ListTostiOrdersForUser(ctx context.Context, userID int64, limit int) ([]TostiOrder, error) {
	if limit <= 0 {
		limit = 50
	}
	if limit > 100 {
		limit = 100
	}
	rows, err := s.pool.Query(ctx, `
SELECT id, user_id, card_id, bread::text, filling::text, status::text, created_at,
  delivered_at, delivered_by_user_id, cancelled_at, cancelled_by_user_id, quantity, remark,
  CASE
    WHEN card_id IS NULL THEN TRUE
    ELSE EXISTS(SELECT 1 FROM cards c WHERE c.id = tosti_orders.card_id AND c.source = 'physical'::card_source)
  END AS is_physical_card
FROM tosti_orders
WHERE user_id = $1
ORDER BY created_at DESC
LIMIT $2`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanTostiOrders(rows)
}

// ListPendingTostiOrdersForOperator lists pending orders oldest first (FIFO).
func (s *Store) ListPendingTostiOrdersForOperator(ctx context.Context, limit int) ([]TostiOrderOperatorRow, error) {
	if limit <= 0 {
		limit = 100
	}
	if limit > 200 {
		limit = 200
	}
	rows, err := s.pool.Query(ctx, `
SELECT o.id, o.user_id, o.card_id, o.bread::text, o.filling::text, o.status::text, o.created_at,
  o.delivered_at, o.delivered_by_user_id, o.cancelled_at, o.cancelled_by_user_id, o.quantity, o.remark,
  CASE
    WHEN o.card_id IS NULL THEN TRUE
    ELSE EXISTS(SELECT 1 FROM cards c WHERE c.id = o.card_id AND c.source = 'physical'::card_source)
  END AS is_physical_card,
  u.name, u.email
FROM tosti_orders o
JOIN users u ON u.id = o.user_id
WHERE o.status = 'pending'
ORDER BY o.created_at ASC
LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []TostiOrderOperatorRow
	for rows.Next() {
		var r TostiOrderOperatorRow
		var cardIDScan sql.NullInt64
		var remarkScan sql.NullString
		if err := rows.Scan(
			&r.ID, &r.UserID, &cardIDScan, &r.Bread, &r.Filling, &r.Status, &r.CreatedAt,
			&r.DeliveredAt, &r.DeliveredByUserID, &r.CancelledAt, &r.CancelledByUserID, &r.Quantity, &remarkScan, &r.IsPhysicalCard,
			&r.CustomerName, &r.CustomerEmail,
		); err != nil {
			return nil, err
		}
		r.CardID = nullInt64ToPtr(cardIDScan)
		if remarkScan.Valid {
			r.Remark = remarkScan.String
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func scanTostiOrders(rows pgx.Rows) ([]TostiOrder, error) {
	var out []TostiOrder
	for rows.Next() {
		var o TostiOrder
		var cardIDScan sql.NullInt64
		var remarkScan sql.NullString
		if err := rows.Scan(
			&o.ID, &o.UserID, &cardIDScan, &o.Bread, &o.Filling, &o.Status, &o.CreatedAt,
			&o.DeliveredAt, &o.DeliveredByUserID, &o.CancelledAt, &o.CancelledByUserID, &o.Quantity, &remarkScan, &o.IsPhysicalCard,
		); err != nil {
			return nil, err
		}
		o.CardID = nullInt64ToPtr(cardIDScan)
		if remarkScan.Valid {
			o.Remark = remarkScan.String
		}
		out = append(out, o)
	}
	return out, rows.Err()
}

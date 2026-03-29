package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

var (
	ErrTostiOrderNotPending    = errors.New("deze bestelling is niet meer open")
	ErrTostiOrderWrongUser     = errors.New("geen toegang tot deze bestelling")
	ErrTostiInvalidBread       = errors.New("ongeldig brood")
	ErrTostiInvalidFilling     = errors.New("ongeldige vulling")
	ErrTostiInvalidQuantity    = errors.New("ongeldig aantal tosti's")
)

// TostiOrder is a lunch order; knipje is deducted on deliver, not on create.
type TostiOrder struct {
	ID                 int64
	UserID             int64
	CardID             int64
	Bread              string
	Filling            string
	Status             string
	CreatedAt          time.Time
	DeliveredAt        *time.Time
	DeliveredByUserID  *int64
	CancelledAt        *time.Time
	CancelledByUserID  *int64
	Quantity           int
}

// TostiOrderOperatorRow is a pending order with customer info for the kraam.
type TostiOrderOperatorRow struct {
	TostiOrder
	CustomerName  string
	CustomerEmail string
}

func parseTostiBread(s string) (string, error) {
	switch s {
	case "wit", "bruin":
		return s, nil
	default:
		return "", ErrTostiInvalidBread
	}
}

func parseTostiFilling(s string) (string, error) {
	switch s {
	case "ham", "kaas", "ham_kaas":
		return s, nil
	default:
		return "", ErrTostiInvalidFilling
	}
}

const tostiQtyMin = 1
const tostiQtyMax = 10

// CreateTostiOrder inserts a pending order when the card belongs to the user and
// knipjes_remaining >= (sum of pending order quantities on that card) + quantity.
func (s *Store) CreateTostiOrder(ctx context.Context, userID, cardID int64, breadIn, fillingIn string, quantity int) (*TostiOrder, error) {
	if quantity < tostiQtyMin || quantity > tostiQtyMax {
		return nil, ErrTostiInvalidQuantity
	}
	bread, err := parseTostiBread(breadIn)
	if err != nil {
		return nil, err
	}
	filling, err := parseTostiFilling(fillingIn)
	if err != nil {
		return nil, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var knip int
	err = tx.QueryRow(ctx,
		`SELECT knipjes_remaining FROM cards WHERE id = $1 AND user_id = $2 FOR UPDATE`,
		cardID, userID,
	).Scan(&knip)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	var pendingSum int
	err = tx.QueryRow(ctx, `
SELECT COALESCE(SUM(quantity), 0)::int FROM tosti_orders
WHERE user_id = $1 AND card_id = $2 AND status = 'pending'`,
		userID, cardID,
	).Scan(&pendingSum)
	if err != nil {
		return nil, err
	}
	if pendingSum+quantity > knip {
		return nil, ErrNoKnipjes
	}

	var o TostiOrder
	err = tx.QueryRow(ctx, `
INSERT INTO tosti_orders (user_id, card_id, bread, filling, quantity)
VALUES ($1, $2, $3::tosti_bread, $4::tosti_filling, $5)
RETURNING id, user_id, card_id, bread::text, filling::text, status::text, created_at,
  delivered_at, delivered_by_user_id, cancelled_at, cancelled_by_user_id, quantity`,
		userID, cardID, bread, filling, quantity,
	).Scan(
		&o.ID, &o.UserID, &o.CardID, &o.Bread, &o.Filling, &o.Status, &o.CreatedAt,
		&o.DeliveredAt, &o.DeliveredByUserID, &o.CancelledAt, &o.CancelledByUserID, &o.Quantity,
	)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &o, nil
}

// TostiOrderOwnerID returns the member user_id for an order row (any status).
func (s *Store) TostiOrderOwnerID(ctx context.Context, orderID int64) (int64, error) {
	var uid int64
	err := s.pool.QueryRow(ctx, `SELECT user_id FROM tosti_orders WHERE id = $1`, orderID).Scan(&uid)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrNotFound
	}
	return uid, err
}

// ListTostiOrdersForUser returns recent orders for the user (newest first), capped at limit.
func (s *Store) ListTostiOrdersForUser(ctx context.Context, userID int64, limit int) ([]TostiOrder, error) {
	if limit <= 0 {
		limit = 50
	}
	if limit > 100 {
		limit = 100
	}
	rows, err := s.pool.Query(ctx, `
SELECT id, user_id, card_id, bread::text, filling::text, status::text, created_at,
  delivered_at, delivered_by_user_id, cancelled_at, cancelled_by_user_id, quantity
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

// ListPendingTostiOrdersForOperator lists pending orders oldest first (FIFO for the kraam).
func (s *Store) ListPendingTostiOrdersForOperator(ctx context.Context, limit int) ([]TostiOrderOperatorRow, error) {
	if limit <= 0 {
		limit = 100
	}
	if limit > 200 {
		limit = 200
	}
	rows, err := s.pool.Query(ctx, `
SELECT o.id, o.user_id, o.card_id, o.bread::text, o.filling::text, o.status::text, o.created_at,
  o.delivered_at, o.delivered_by_user_id, o.cancelled_at, o.cancelled_by_user_id, o.quantity,
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
		if err := rows.Scan(
			&r.ID, &r.UserID, &r.CardID, &r.Bread, &r.Filling, &r.Status, &r.CreatedAt,
			&r.DeliveredAt, &r.DeliveredByUserID, &r.CancelledAt, &r.CancelledByUserID, &r.Quantity,
			&r.CustomerName, &r.CustomerEmail,
		); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func scanTostiOrders(rows pgx.Rows) ([]TostiOrder, error) {
	var out []TostiOrder
	for rows.Next() {
		var o TostiOrder
		if err := rows.Scan(
			&o.ID, &o.UserID, &o.CardID, &o.Bread, &o.Filling, &o.Status, &o.CreatedAt,
			&o.DeliveredAt, &o.DeliveredByUserID, &o.CancelledAt, &o.CancelledByUserID, &o.Quantity,
		); err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, rows.Err()
}

// CancelTostiOrder sets status to cancelled if pending. Members may only cancel their own;
// staff (admin/operator) may cancel any pending order.
func (s *Store) CancelTostiOrder(ctx context.Context, orderID, actorUserID int64, actorIsStaff bool) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var ownerID int64
	var st string
	err = tx.QueryRow(ctx,
		`SELECT user_id, status::text FROM tosti_orders WHERE id = $1 FOR UPDATE`,
		orderID,
	).Scan(&ownerID, &st)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if st != "pending" {
		return ErrTostiOrderNotPending
	}
	if !actorIsStaff && ownerID != actorUserID {
		return ErrTostiOrderWrongUser
	}

	tag, err := tx.Exec(ctx, `
UPDATE tosti_orders
SET status = 'cancelled', cancelled_at = now(), cancelled_by_user_id = $2
WHERE id = $1 AND status = 'pending'`,
		orderID, actorUserID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrTostiOrderNotPending
	}
	return tx.Commit(ctx)
}

// DeliverTostiOrder marks the order delivered and decrements quantity knipjes on the linked card.
func (s *Store) DeliverTostiOrder(ctx context.Context, orderID, deliveredByUserID int64) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var userID, cardID int64
	var st string
	var qty int
	err = tx.QueryRow(ctx,
		`SELECT user_id, card_id, status::text, quantity FROM tosti_orders WHERE id = $1 FOR UPDATE`,
		orderID,
	).Scan(&userID, &cardID, &st, &qty)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if st != "pending" {
		return ErrTostiOrderNotPending
	}
	if qty < tostiQtyMin || qty > tostiQtyMax {
		return ErrTostiInvalidQuantity
	}

	var knip int
	err = tx.QueryRow(ctx,
		`SELECT knipjes_remaining FROM cards WHERE id = $1 AND user_id = $2 FOR UPDATE`,
		cardID, userID,
	).Scan(&knip)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if knip < qty {
		return ErrNoKnipjes
	}

	tag, err := tx.Exec(ctx, `
UPDATE cards SET knipjes_remaining = knipjes_remaining - $3
WHERE id = $1 AND user_id = $2 AND knipjes_remaining >= $3`,
		cardID, userID, qty)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNoKnipjes
	}

	tag, err = tx.Exec(ctx, `
UPDATE tosti_orders
SET status = 'delivered', delivered_at = now(), delivered_by_user_id = $2
WHERE id = $1 AND status = 'pending'`,
		orderID, deliveredByUserID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrTostiOrderNotPending
	}
	return tx.Commit(ctx)
}

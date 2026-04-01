package store

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

var (
	ErrTostiOrderNotPending = errors.New("deze bestelling is niet meer open")
	ErrTostiOrderWrongUser  = errors.New("geen toegang tot deze bestelling")
	ErrTostiInvalidBread    = errors.New("ongeldig brood")
	ErrTostiInvalidFilling  = errors.New("ongeldige vulling")
	ErrTostiInvalidQuantity = errors.New("ongeldig aantal tosti's")
)

// TostiOrder is a lunch order; CardID nil means physical tostikaart (no app balance).
type TostiOrder struct {
	ID                int64
	UserID            int64
	CardID            *int64
	Bread             string
	Filling           string
	Status            string
	CreatedAt         time.Time
	DeliveredAt       *time.Time
	DeliveredByUserID *int64
	CancelledAt       *time.Time
	CancelledByUserID *int64
	Quantity          int
	IsPhysicalCard    bool
}

// TostiOrderOperatorRow is a pending order with customer name and email for operators.
type TostiOrderOperatorRow struct {
	TostiOrder
	CustomerName  string
	CustomerEmail string
}

func nullInt64ToPtr(n sql.NullInt64) *int64 {
	if !n.Valid {
		return nil
	}
	v := n.Int64
	return &v
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

// CreateTostiOrder inserts a pending order.
// - cardID nil: use member's latest physical tostikaart estimate.
// - cardID set: must be an online tostikaart with enough free knipjes.
func (s *Store) CreateTostiOrder(ctx context.Context, userID int64, cardID *int64, breadIn, fillingIn string, quantity int) (*TostiOrder, error) {
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

	if cardID == nil {
		physicalCardID, err := findPhysicalTostiCardForUser(ctx, tx, userID)
		if err != nil {
			return nil, err
		}
		o, err := insertTostiOrderRow(ctx, tx, userID, &physicalCardID, bread, filling, quantity)
		if err != nil {
			return nil, err
		}
		if err := tx.Commit(ctx); err != nil {
			return nil, err
		}
		return o, nil
	}

	var knip int
	var cardKind string
	var cardSource string
	err = tx.QueryRow(ctx,
		`SELECT knipjes_remaining, kind::text, source::text FROM cards WHERE id = $1 AND user_id = $2 FOR UPDATE`,
		*cardID, userID,
	).Scan(&knip, &cardKind, &cardSource)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if cardKind != CardKindTosti {
		return nil, ErrCardNotForTosti
	}
	if cardSource != "online" {
		return nil, ErrCardPhysicalReadonly
	}

	var pendingSum int
	err = tx.QueryRow(ctx, `
SELECT COALESCE(SUM(quantity), 0)::int FROM tosti_orders
WHERE user_id = $1 AND card_id = $2 AND status = 'pending'`,
		userID, *cardID,
	).Scan(&pendingSum)
	if err != nil {
		return nil, err
	}
	if pendingSum+quantity > knip {
		return nil, ErrNoKnipjes
	}

	o, err := insertTostiOrderRow(ctx, tx, userID, cardID, bread, filling, quantity)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return o, nil
}

func insertTostiOrderRow(ctx context.Context, tx pgx.Tx, userID int64, cardID *int64, bread, filling string, quantity int) (*TostiOrder, error) {
	var o TostiOrder
	var cardIDScan sql.NullInt64
	err := tx.QueryRow(ctx, `
INSERT INTO tosti_orders (user_id, card_id, bread, filling, quantity)
VALUES ($1, $2, $3::tosti_bread, $4::tosti_filling, $5)
RETURNING id, user_id, card_id, bread::text, filling::text, status::text, created_at,
  delivered_at, delivered_by_user_id, cancelled_at, cancelled_by_user_id, quantity`,
		userID, cardID, bread, filling, quantity,
	).Scan(
		&o.ID, &o.UserID, &cardIDScan, &o.Bread, &o.Filling, &o.Status, &o.CreatedAt,
		&o.DeliveredAt, &o.DeliveredByUserID, &o.CancelledAt, &o.CancelledByUserID, &o.Quantity,
	)
	if err != nil {
		return nil, err
	}
	o.CardID = nullInt64ToPtr(cardIDScan)
	o.IsPhysicalCard = false
	return &o, nil
}

func findPhysicalTostiCardForUser(ctx context.Context, tx pgx.Tx, userID int64) (int64, error) {
	var cardID int64
	err := tx.QueryRow(ctx, `
SELECT id
FROM cards
WHERE user_id = $1
  AND kind = $2::card_kind
  AND source = 'physical'::card_source
ORDER BY created_at DESC
LIMIT 1
FOR UPDATE`,
		userID, CardKindTosti,
	).Scan(&cardID)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrNotFound
	}
	if err != nil {
		return 0, err
	}
	return cardID, nil
}

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
  delivered_at, delivered_by_user_id, cancelled_at, cancelled_by_user_id, quantity,
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
  o.delivered_at, o.delivered_by_user_id, o.cancelled_at, o.cancelled_by_user_id, o.quantity,
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
		if err := rows.Scan(
			&r.ID, &r.UserID, &cardIDScan, &r.Bread, &r.Filling, &r.Status, &r.CreatedAt,
			&r.DeliveredAt, &r.DeliveredByUserID, &r.CancelledAt, &r.CancelledByUserID, &r.Quantity, &r.IsPhysicalCard,
			&r.CustomerName, &r.CustomerEmail,
		); err != nil {
			return nil, err
		}
		r.CardID = nullInt64ToPtr(cardIDScan)
		out = append(out, r)
	}
	return out, rows.Err()
}

func scanTostiOrders(rows pgx.Rows) ([]TostiOrder, error) {
	var out []TostiOrder
	for rows.Next() {
		var o TostiOrder
		var cardIDScan sql.NullInt64
		if err := rows.Scan(
			&o.ID, &o.UserID, &cardIDScan, &o.Bread, &o.Filling, &o.Status, &o.CreatedAt,
			&o.DeliveredAt, &o.DeliveredByUserID, &o.CancelledAt, &o.CancelledByUserID, &o.Quantity, &o.IsPhysicalCard,
		); err != nil {
			return nil, err
		}
		o.CardID = nullInt64ToPtr(cardIDScan)
		out = append(out, o)
	}
	return out, rows.Err()
}

// CancelTostiOrder cancels a pending order; members own orders only unless actorIsStaff.
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

// DeliverTostiOrder marks delivered and decrements estimate on the linked tosti card.
func (s *Store) DeliverTostiOrder(ctx context.Context, orderID, deliveredByUserID int64) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var userID int64
	var cardIDScan sql.NullInt64
	var st string
	var qty int
	err = tx.QueryRow(ctx,
		`SELECT user_id, card_id, status::text, quantity FROM tosti_orders WHERE id = $1 FOR UPDATE`,
		orderID,
	).Scan(&userID, &cardIDScan, &st, &qty)
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

	var cardID int64
	if !cardIDScan.Valid {
		physicalCardID, err := findPhysicalTostiCardForUser(ctx, tx, userID)
		if err != nil {
			return err
		}
		cardID = physicalCardID
	} else {
		cardID = cardIDScan.Int64
	}
	var knip int
	err = tx.QueryRow(ctx,
		`SELECT knipjes_remaining FROM cards WHERE id = $1 AND user_id = $2 AND kind = $3::card_kind FOR UPDATE`,
		cardID, userID, CardKindTosti,
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
WHERE id = $1 AND user_id = $2 AND kind = $4::card_kind AND knipjes_remaining >= $3`,
		cardID, userID, qty, CardKindTosti)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNoKnipjes
	}

	tag, err = tx.Exec(ctx, `
UPDATE tosti_orders
SET status = 'delivered', delivered_at = now(), delivered_by_user_id = $2, card_id = $3
WHERE id = $1 AND status = 'pending'`,
		orderID, deliveredByUserID, cardID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrTostiOrderNotPending
	}
	return tx.Commit(ctx)
}

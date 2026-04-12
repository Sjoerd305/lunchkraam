package store

import (
	"context"
	"database/sql"
	"errors"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
)

var (
	ErrTostiOrderNotPending = errors.New("deze bestelling is niet meer open")
	ErrTostiOrderWrongUser  = errors.New("geen toegang tot deze bestelling")
	ErrTostiInvalidBread    = errors.New("ongeldig brood")
	ErrTostiInvalidFilling  = errors.New("ongeldige vulling")
	ErrTostiInvalidQuantity = errors.New("ongeldig aantal tosti's")
	ErrTostiInvalidRemark   = errors.New("opmerking te lang")
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
	Remark            string
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
const tostiRemarkMaxRunes = 500

// CreateTostiOrder inserts a pending order.
// - cardID nil: physical order. During rollout this may be placed without a registered physical card.
// - cardID set: must be an online tostikaart with enough free knipjes.
func (s *Store) CreateTostiOrder(ctx context.Context, userID int64, cardID *int64, breadIn, fillingIn string, quantity int, remark string) (*TostiOrder, error) {
	if utf8.RuneCountInString(remark) > tostiRemarkMaxRunes {
		return nil, ErrTostiInvalidRemark
	}
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
	var remarkNull sql.NullString
	if remark != "" {
		remarkNull = sql.NullString{String: remark, Valid: true}
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	if cardID == nil {
		o, err := insertTostiOrderRow(ctx, tx, userID, nil, bread, filling, quantity, remarkNull)
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

	o, err := insertTostiOrderRow(ctx, tx, userID, cardID, bread, filling, quantity, remarkNull)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return o, nil
}

func insertTostiOrderRow(ctx context.Context, tx pgx.Tx, userID int64, cardID *int64, bread, filling string, quantity int, remark sql.NullString) (*TostiOrder, error) {
	var o TostiOrder
	var cardIDScan sql.NullInt64
	var remarkScan sql.NullString
	err := tx.QueryRow(ctx, `
INSERT INTO tosti_orders (user_id, card_id, bread, filling, quantity, remark)
VALUES ($1, $2, $3::tosti_bread, $4::tosti_filling, $5, $6)
RETURNING id, user_id, card_id, bread::text, filling::text, status::text, created_at,
  delivered_at, delivered_by_user_id, cancelled_at, cancelled_by_user_id, quantity, remark`,
		userID, cardID, bread, filling, quantity, remark,
	).Scan(
		&o.ID, &o.UserID, &cardIDScan, &o.Bread, &o.Filling, &o.Status, &o.CreatedAt,
		&o.DeliveredAt, &o.DeliveredByUserID, &o.CancelledAt, &o.CancelledByUserID, &o.Quantity, &remarkScan,
	)
	if err != nil {
		return nil, err
	}
	o.CardID = nullInt64ToPtr(cardIDScan)
	o.IsPhysicalCard = false
	if remarkScan.Valid {
		o.Remark = remarkScan.String
	}
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

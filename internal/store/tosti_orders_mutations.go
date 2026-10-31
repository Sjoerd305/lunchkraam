package store

import (
	"context"
	"database/sql"
	"errors"

	"github.com/jackc/pgx/v5"
)

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

	var cardID *int64
	if !cardIDScan.Valid {
		physicalCardID, err := findPhysicalTostiCardForUser(ctx, tx, userID)
		if errors.Is(err, ErrNotFound) {
			cardID = nil
		} else if err != nil {
			return err
		}
		if err == nil {
			cardID = &physicalCardID
		}
	} else {
		existing := cardIDScan.Int64
		cardID = &existing
	}

	if cardID == nil {
		tag, err := tx.Exec(ctx, `
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

	var knip int
	var source string
	err = tx.QueryRow(ctx,
		`SELECT knipjes_remaining, source::text FROM cards WHERE id = $1 AND user_id = $2 AND kind = $3::card_kind FOR UPDATE`,
		*cardID, userID, CardKindTosti,
	).Scan(&knip, &source)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}

	// A physical card holds an estimate: never block a real delivery on it, just clamp at 0.
	// An online card holds the real balance: insufficient knipjes block delivery, and the card
	// must be active (payment accordeerd) before anything can be deducted.
	newBal := knip - qty
	note := ""
	if source == "physical" {
		if newBal < 0 {
			newBal = 0
			note = "Schatting stond lager dan het aantal; op 0 gezet"
		}
	} else {
		if pending, err := cardAwaitsVerification(ctx, tx, *cardID); err != nil {
			return err
		} else if pending {
			return ErrCardNotVerified
		}
		if knip < qty {
			return ErrNoKnipjes
		}
	}

	tag, err := tx.Exec(ctx, `UPDATE cards SET knipjes_remaining = $2 WHERE id = $1`, *cardID, newBal)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	if _, err := insertCardTransaction(ctx, tx, cardTxInput{
		CardID:       *cardID,
		Delta:        newBal - knip,
		BalanceAfter: newBal,
		Reason:       TxReasonTostiDelivered,
		ActorUserID:  int64Ptr(deliveredByUserID),
		TostiOrderID: int64Ptr(orderID),
		Note:         note,
	}); err != nil {
		return err
	}

	tag, err = tx.Exec(ctx, `
UPDATE tosti_orders
SET status = 'delivered', delivered_at = now(), delivered_by_user_id = $2, card_id = $3
WHERE id = $1 AND status = 'pending'`,
		orderID, deliveredByUserID, *cardID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrTostiOrderNotPending
	}
	return tx.Commit(ctx)
}

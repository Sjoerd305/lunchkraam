package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

const (
	TxReasonIssued         = "issued"
	TxReasonTostiDelivered = "tosti_delivered"
	TxReasonAvondetenMeal  = "avondeten_meal"
	TxReasonManualKnipje   = "manual_knipje"
	TxReasonEstimateAdjust = "estimate_adjust"
	TxReasonUndo           = "undo"
	TxReasonBackfill       = "backfill"
)

var (
	ErrTxNotUndoable      = errors.New("deze boeking kan niet worden teruggedraaid")
	ErrTxAlreadyUndone    = errors.New("deze boeking is al teruggedraaid")
	ErrUndoOutOfRange     = errors.New("terugdraaien zou het saldo buiten 0–10 brengen")
	ErrCardNotPhysical    = errors.New("alleen voor fysieke kaarten")
	ErrEstimateOutOfRange = errors.New("schatting moet tussen 0 en 10 liggen")
)

// CardTransaction is one saldowijziging in the knipje-logboek.
type CardTransaction struct {
	ID                      int64
	CardID                  int64
	Delta                   int
	BalanceAfter            *int
	Reason                  string
	ActorUserID             *int64
	ActorName               string
	TostiOrderID            *int64
	AvondetenMealID         *int64
	AvondetenMealDate       *time.Time
	ReversesTransactionID   *int64
	ReversedByTransactionID *int64
	Note                    string
	CreatedAt               time.Time
}

type cardTxInput struct {
	CardID          int64
	Delta           int
	BalanceAfter    int
	Reason          string
	ActorUserID     *int64
	TostiOrderID    *int64
	AvondetenMealID *int64
	Reverses        *int64
	Note            string
}

func insertCardTransaction(ctx context.Context, tx pgx.Tx, in cardTxInput) (int64, error) {
	var id int64
	err := tx.QueryRow(ctx, `
INSERT INTO card_transactions (
	card_id, delta, balance_after, reason, actor_user_id, tosti_order_id, avondeten_meal_id, reverses_transaction_id, note
) VALUES ($1, $2, $3, $4::card_transaction_reason, $5, $6, $7, $8, $9)
RETURNING id`,
		in.CardID, in.Delta, in.BalanceAfter, in.Reason, in.ActorUserID, in.TostiOrderID, in.AvondetenMealID, in.Reverses, in.Note,
	).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("insert card transaction: %w", err)
	}
	return id, nil
}

func int64Ptr(v int64) *int64 { return &v }

// CardOwnerID returns the owning user of a card.
func (s *Store) CardOwnerID(ctx context.Context, cardID int64) (int64, error) {
	var uid int64
	err := s.pool.QueryRow(ctx, `SELECT user_id FROM cards WHERE id = $1`, cardID).Scan(&uid)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrNotFound
	}
	return uid, err
}

// ListCardTransactions returns the knipje-logboek for one card, newest first.
func (s *Store) ListCardTransactions(ctx context.Context, cardID int64, limit int) ([]CardTransaction, error) {
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	rows, err := s.pool.Query(ctx, `
SELECT t.id, t.card_id, t.delta, t.balance_after, t.reason::text, t.actor_user_id, COALESCE(u.name, ''),
       t.tosti_order_id, t.avondeten_meal_id, m.meal_date,
       t.reverses_transaction_id, t.reversed_by_transaction_id, t.note, t.created_at
FROM card_transactions t
LEFT JOIN users u ON u.id = t.actor_user_id
LEFT JOIN avondeten_meals m ON m.id = t.avondeten_meal_id
WHERE t.card_id = $1
ORDER BY t.created_at DESC, t.id DESC
LIMIT $2`, cardID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []CardTransaction
	for rows.Next() {
		var t CardTransaction
		var balance sql.NullInt32
		var actor, order, meal, reverses, reversedBy sql.NullInt64
		var mealDate sql.NullTime
		if err := rows.Scan(
			&t.ID, &t.CardID, &t.Delta, &balance, &t.Reason, &actor, &t.ActorName,
			&order, &meal, &mealDate, &reverses, &reversedBy, &t.Note, &t.CreatedAt,
		); err != nil {
			return nil, err
		}
		if balance.Valid {
			b := int(balance.Int32)
			t.BalanceAfter = &b
		}
		t.ActorUserID = nullInt64ToPtr(actor)
		t.TostiOrderID = nullInt64ToPtr(order)
		t.AvondetenMealID = nullInt64ToPtr(meal)
		if mealDate.Valid {
			d := mealDate.Time
			t.AvondetenMealDate = &d
		}
		t.ReversesTransactionID = nullInt64ToPtr(reverses)
		t.ReversedByTransactionID = nullInt64ToPtr(reversedBy)
		out = append(out, t)
	}
	return out, rows.Err()
}

// UndoCardTransaction reverses one logged saldowijziging: the card balance is restored and an 'undo'
// line is written. An avondeten registration is removed again so the member can be registered anew.
// A delivered tosti order stays delivered; only the knipjes are refunded.
func (s *Store) UndoCardTransaction(ctx context.Context, txID, actorUserID int64) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var cardID int64
	var delta int
	var reason string
	var reversedBy, mealID sql.NullInt64
	err = tx.QueryRow(ctx, `
SELECT card_id, delta, reason::text, reversed_by_transaction_id, avondeten_meal_id
FROM card_transactions WHERE id = $1 FOR UPDATE`, txID,
	).Scan(&cardID, &delta, &reason, &reversedBy, &mealID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	switch reason {
	case TxReasonIssued, TxReasonUndo, TxReasonBackfill:
		return ErrTxNotUndoable
	}
	if reversedBy.Valid {
		return ErrTxAlreadyUndone
	}
	if delta == 0 {
		return ErrTxNotUndoable
	}

	var knip int
	err = tx.QueryRow(ctx, `SELECT knipjes_remaining FROM cards WHERE id = $1 FOR UPDATE`, cardID).Scan(&knip)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	newBal := knip - delta
	if newBal < 0 || newBal > 10 {
		return ErrUndoOutOfRange
	}

	note := "Teruggedraaid"
	if mealID.Valid {
		var mealDate time.Time
		if err := tx.QueryRow(ctx, `SELECT meal_date FROM avondeten_meals WHERE id = $1`, mealID.Int64).Scan(&mealDate); err == nil {
			note = "Avondeten " + mealDate.Format("2006-01-02") + " teruggedraaid"
		}
		if _, err := tx.Exec(ctx, `DELETE FROM avondeten_meals WHERE id = $1`, mealID.Int64); err != nil {
			return err
		}
	} else if reason == TxReasonTostiDelivered {
		note = "Knipjes teruggeboekt; bestelling blijft geleverd"
	}

	if _, err := tx.Exec(ctx, `UPDATE cards SET knipjes_remaining = $2 WHERE id = $1`, cardID, newBal); err != nil {
		return err
	}
	undoID, err := insertCardTransaction(ctx, tx, cardTxInput{
		CardID:       cardID,
		Delta:        -delta,
		BalanceAfter: newBal,
		Reason:       TxReasonUndo,
		ActorUserID:  int64Ptr(actorUserID),
		Reverses:     int64Ptr(txID),
		Note:         note,
	})
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx,
		`UPDATE card_transactions SET reversed_by_transaction_id = $2 WHERE id = $1`, txID, undoID,
	); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// SetPhysicalCardEstimate sets the estimated knipjes on a physical card (0–10) and logs the difference.
func (s *Store) SetPhysicalCardEstimate(ctx context.Context, cardID int64, value int, actorUserID int64) error {
	if value < 0 || value > 10 {
		return ErrEstimateOutOfRange
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var knip int
	var source string
	err = tx.QueryRow(ctx, `SELECT knipjes_remaining, source::text FROM cards WHERE id = $1 FOR UPDATE`, cardID).Scan(&knip, &source)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if source != "physical" {
		return ErrCardNotPhysical
	}
	if knip == value {
		return nil
	}
	if _, err := tx.Exec(ctx, `UPDATE cards SET knipjes_remaining = $2 WHERE id = $1`, cardID, value); err != nil {
		return err
	}
	if _, err := insertCardTransaction(ctx, tx, cardTxInput{
		CardID:       cardID,
		Delta:        value - knip,
		BalanceAfter: value,
		Reason:       TxReasonEstimateAdjust,
		ActorUserID:  int64Ptr(actorUserID),
		Note:         fmt.Sprintf("Schatting van %d naar %d gezet", knip, value),
	}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

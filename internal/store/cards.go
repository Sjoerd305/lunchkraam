package store

import (
	"context"
	"errors"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
)

// cardActiveSQL is TRUE when no open card_request points at the card (alias `c`): the payment was
// accordeerd, or the card was sold physically. Until then the card is "nog niet actief".
const cardActiveSQL = `NOT EXISTS (SELECT 1 FROM card_requests cr WHERE cr.card_id = c.id AND cr.status = 'pending')`

func (s *Store) CardsByUser(ctx context.Context, userID int64) ([]Card, error) {
	q := `
SELECT c.id, c.user_id, c.kind::text, c.source::text, c.knipjes_remaining, c.note, c.created_at, ` + cardActiveSQL + ` AS active
FROM cards c WHERE c.user_id = $1 ORDER BY c.created_at DESC`
	rows, err := s.pool.Query(ctx, q, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Card
	for rows.Next() {
		var c Card
		if err := rows.Scan(&c.ID, &c.UserID, &c.Kind, &c.Source, &c.KnipjesRemaining, &c.Note, &c.CreatedAt, &c.Active); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// cardAwaitsVerification reports whether an open card_request still points at the card, i.e. the
// payment has not been accordeerd yet. Such a card accepts orders but no knipje deductions.
func cardAwaitsVerification(ctx context.Context, tx pgx.Tx, cardID int64) (bool, error) {
	var pending bool
	err := tx.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM card_requests WHERE card_id = $1 AND status = 'pending')`, cardID,
	).Scan(&pending)
	return pending, err
}

// UseKnipje lets an admin/operator use one punch on a non-physical card (tosti or avondeten) and writes a
// 'manual_knipje' line to the knipje-logboek. Physical cards hold an estimate: use SetPhysicalCardEstimate.
func (s *Store) UseKnipje(ctx context.Context, cardID int64, actor *User) error {
	if actor == nil || (!actor.IsAdmin && !actor.IsOperator) {
		return ErrForbidden
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
	if source == "physical" {
		return ErrCardPhysicalReadonly
	}
	if knip <= 0 {
		return ErrNoKnipjes
	}
	if pending, err := cardAwaitsVerification(ctx, tx, cardID); err != nil {
		return err
	} else if pending {
		return ErrCardNotVerified
	}
	if _, err := tx.Exec(ctx, `UPDATE cards SET knipjes_remaining = knipjes_remaining - 1 WHERE id = $1`, cardID); err != nil {
		return err
	}
	if _, err := insertCardTransaction(ctx, tx, cardTxInput{
		CardID:       cardID,
		Delta:        -1,
		BalanceAfter: knip - 1,
		Reason:       TxReasonManualKnipje,
		ActorUserID:  int64Ptr(actor.ID),
	}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Store) SearchCardsWithOwners(ctx context.Context, query string, limit int) ([]CardWithOwner, error) {
	if limit <= 0 || limit > 100 {
		limit = 40
	}
	q := strings.TrimSpace(query)
	if q == "" {
		return s.recentCardsWithOwners(ctx, limit)
	}
	if id, err := strconv.ParseInt(q, 10, 64); err == nil && id > 0 {
		return s.cardsWithOwnersByCardID(ctx, id)
	}
	pat := "%" + q + "%"
	rows, err := s.pool.Query(ctx, `
SELECT `+cardWithOwnerColumnsSQL+`
FROM cards c
JOIN users u ON u.id = c.user_id
WHERE u.name ILIKE $1 OR u.email ILIKE $1
ORDER BY c.created_at DESC
LIMIT $2`, pat, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanCardWithOwnerRows(rows)
}

const cardWithOwnerColumnsSQL = `c.id, c.user_id, c.kind::text, c.source::text, c.knipjes_remaining, c.note, c.created_at, ` +
	cardActiveSQL + ` AS active, u.name, u.email`

func (s *Store) recentCardsWithOwners(ctx context.Context, limit int) ([]CardWithOwner, error) {
	rows, err := s.pool.Query(ctx, `
SELECT `+cardWithOwnerColumnsSQL+`
FROM cards c
JOIN users u ON u.id = c.user_id
ORDER BY c.created_at DESC
LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanCardWithOwnerRows(rows)
}

func (s *Store) cardsWithOwnersByCardID(ctx context.Context, cardID int64) ([]CardWithOwner, error) {
	rows, err := s.pool.Query(ctx, `
SELECT `+cardWithOwnerColumnsSQL+`
FROM cards c
JOIN users u ON u.id = c.user_id
WHERE c.id = $1`, cardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanCardWithOwnerRows(rows)
}

func scanCardWithOwnerRows(rows pgx.Rows) ([]CardWithOwner, error) {
	var out []CardWithOwner
	for rows.Next() {
		var r CardWithOwner
		if err := rows.Scan(&r.ID, &r.UserID, &r.Kind, &r.Source, &r.KnipjesRemaining, &r.Note, &r.CreatedAt, &r.Active, &r.OwnerName, &r.OwnerEmail); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

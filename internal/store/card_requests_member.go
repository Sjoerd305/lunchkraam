package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

func (s *Store) ListPendingCardRequestsForUser(ctx context.Context, userID int64) ([]PendingCardRequestSummary, error) {
	const q = `
SELECT cr.id, cr.kind::text, cr.created_at,
  COALESCE(c.knipjes_remaining, GREATEST(0, 10 - cr.trust_knipjes_used)) AS knip_rem
FROM card_requests cr
LEFT JOIN cards c ON c.id = cr.card_id
WHERE cr.user_id = $1 AND cr.status = 'pending'
ORDER BY cr.created_at ASC`
	rows, err := s.pool.Query(ctx, q, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []PendingCardRequestSummary
	for rows.Next() {
		var r PendingCardRequestSummary
		if err := rows.Scan(&r.ID, &r.Kind, &r.CreatedAt, &r.KnipjesRemaining); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Store) CancelCardRequestForUser(ctx context.Context, requestID, userID int64) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var cardID *int64
	err = tx.QueryRow(ctx, `
SELECT card_id FROM card_requests
WHERE id = $1 AND user_id = $2 AND status = 'pending'
FOR UPDATE`,
		requestID, userID,
	).Scan(&cardID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if cardID == nil {
		return ErrNotFound
	}

	var remaining int
	err = tx.QueryRow(ctx,
		`SELECT knipjes_remaining FROM cards WHERE id = $1 FOR UPDATE`, *cardID,
	).Scan(&remaining)
	if err != nil {
		return err
	}
	if remaining < 10 {
		return ErrCannotCancelTrustUsed
	}

	if _, err := tx.Exec(ctx,
		`UPDATE card_requests SET status = 'cancelled' WHERE id = $1`,
		requestID,
	); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM cards WHERE id = $1`, *cardID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Store) CancelAllPendingCardRequestsForUser(ctx context.Context, userID int64) (int64, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	qrows, err := tx.Query(ctx, `
SELECT cr.id, cr.card_id,
  COALESCE(c.knipjes_remaining, GREATEST(0, 10 - cr.trust_knipjes_used)) AS knip_rem
FROM card_requests cr
LEFT JOIN cards c ON c.id = cr.card_id
WHERE cr.user_id = $1 AND cr.status = 'pending'
FOR UPDATE`,
		userID,
	)
	if err != nil {
		return 0, err
	}
	defer qrows.Close()
	type row struct {
		id     int64
		cardID *int64
		rem    int
	}
	var list []row
	for qrows.Next() {
		var r row
		if err := qrows.Scan(&r.id, &r.cardID, &r.rem); err != nil {
			return 0, err
		}
		list = append(list, r)
	}
	if err := qrows.Err(); err != nil {
		return 0, err
	}

	for _, r := range list {
		if r.rem < 10 {
			return 0, ErrCannotCancelTrustUsed
		}
		if r.cardID == nil {
			return 0, ErrNotFound
		}
	}

	var n int64
	for _, r := range list {
		if _, err := tx.Exec(ctx,
			`UPDATE card_requests SET status = 'cancelled' WHERE id = $1`,
			r.id,
		); err != nil {
			return 0, err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM cards WHERE id = $1`, *r.cardID); err != nil {
			return 0, err
		}
		n++
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return n, nil
}

func (s *Store) PendingCardRequestsByUser(ctx context.Context, userID int64) (int, error) {
	const q = `SELECT count(*) FROM card_requests WHERE user_id = $1 AND status = 'pending'`
	var n int
	if err := s.pool.QueryRow(ctx, q, userID).Scan(&n); err != nil {
		return 0, err
	}
	return n, nil
}

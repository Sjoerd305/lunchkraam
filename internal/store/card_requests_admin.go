package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

func (s *Store) ListPendingRequests(ctx context.Context) ([]CardRequestRow, error) {
	const q = `
SELECT cr.id, cr.user_id, cr.status::text, cr.kind::text, cr.created_at, cr.fulfilled_at, cr.fulfilled_by_admin_id, cr.card_id,
       cr.payment_method::text,
       u.email, u.name,
       COALESCE(c.knipjes_remaining, GREATEST(0, 10 - cr.trust_knipjes_used)) AS knip_rem
FROM card_requests cr
JOIN users u ON u.id = cr.user_id
LEFT JOIN cards c ON c.id = cr.card_id
WHERE cr.status = 'pending'
ORDER BY cr.created_at ASC`
	rows, err := s.pool.Query(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []CardRequestRow
	for rows.Next() {
		var r CardRequestRow
		if err := rows.Scan(
			&r.ID, &r.UserID, &r.Status, &r.Kind, &r.CreatedAt, &r.FulfilledAt, &r.FulfilledByAdminID, &r.CardID,
			&r.PaymentMethod,
			&r.UserEmail, &r.UserName, &r.KnipjesRemaining,
		); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Store) FulfillCardRequest(ctx context.Context, requestID, adminUserID int64, salePriceEUR float64) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var reqUserID int64
	var status string
	var trustUsed int
	var existingCardID *int64
	var reqKind string
	err = tx.QueryRow(ctx,
		`SELECT user_id, status::text, trust_knipjes_used, card_id, kind::text FROM card_requests WHERE id = $1 FOR UPDATE`,
		requestID,
	).Scan(&reqUserID, &status, &trustUsed, &existingCardID, &reqKind)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if status != "pending" {
		return ErrForbidden
	}

	if existingCardID != nil {
		tag, err := tx.Exec(ctx, `
UPDATE card_requests
SET status = 'fulfilled', fulfilled_at = now(), fulfilled_by_admin_id = $2, sale_price_eur = $3
WHERE id = $1 AND status = 'pending'`,
			requestID, adminUserID, salePriceEUR,
		)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrForbidden
		}
		return tx.Commit(ctx)
	}

	knipjesOnCard := 10 - trustUsed
	var cardID int64
	err = tx.QueryRow(ctx,
		`INSERT INTO cards (user_id, knipjes_remaining, kind, source) VALUES ($1, $2, $3::card_kind, 'online'::card_source) RETURNING id`,
		reqUserID, knipjesOnCard, reqKind,
	).Scan(&cardID)
	if err != nil {
		return err
	}

	tag, err := tx.Exec(ctx, `
UPDATE card_requests
SET status = 'fulfilled', fulfilled_at = now(), fulfilled_by_admin_id = $2, card_id = $3, sale_price_eur = $4
WHERE id = $1 AND status = 'pending'`,
		requestID, adminUserID, cardID, salePriceEUR,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrForbidden
	}
	return tx.Commit(ctx)
}

// AdminRejectCardRequest sets the request to cancelled and removes the provisional card when no knipjes
// have been used (same rule as member self-cancel). If punches were used, the request must be fulfilled instead.
func (s *Store) AdminRejectCardRequest(ctx context.Context, requestID int64) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var cardID *int64
	err = tx.QueryRow(ctx, `
SELECT card_id FROM card_requests
WHERE id = $1 AND status = 'pending'
FOR UPDATE`,
		requestID,
	).Scan(&cardID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}

	if cardID != nil {
		var remaining int
		err = tx.QueryRow(ctx,
			`SELECT knipjes_remaining FROM cards WHERE id = $1 FOR UPDATE`, *cardID,
		).Scan(&remaining)
		if err != nil {
			return err
		}
		if remaining < 10 {
			return ErrCannotRejectKnipjesUsed
		}
	} else {
		var trustUsed int
		err = tx.QueryRow(ctx,
			`SELECT trust_knipjes_used FROM card_requests WHERE id = $1`, requestID,
		).Scan(&trustUsed)
		if err != nil {
			return err
		}
		if trustUsed > 0 {
			return ErrCannotRejectKnipjesUsed
		}
	}

	if _, err := tx.Exec(ctx,
		`UPDATE card_requests SET status = 'cancelled' WHERE id = $1`,
		requestID,
	); err != nil {
		return err
	}
	if cardID != nil {
		if _, err := tx.Exec(ctx, `DELETE FROM cards WHERE id = $1`, *cardID); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

// CardRequestKind returns the card_kind for a card_request row.
func (s *Store) CardRequestKind(ctx context.Context, requestID int64) (string, error) {
	var kind string
	err := s.pool.QueryRow(ctx, `SELECT kind::text FROM card_requests WHERE id = $1`, requestID).Scan(&kind)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", err
	}
	return kind, nil
}

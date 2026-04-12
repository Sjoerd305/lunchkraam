package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func (s *Store) CreateCardRequest(ctx context.Context, userID int64, kind string) (int64, error) {
	kind, err := NormalizeCardKind(kind)
	if err != nil {
		return 0, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	var matroos bool
	err = tx.QueryRow(ctx, `SELECT is_matroos_jeugd FROM users WHERE id = $1`, userID).Scan(&matroos)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrNotFound
	}
	if err != nil {
		return 0, err
	}
	if kind == CardKindAvondeten && !matroos {
		return 0, ErrForbidden
	}

	var has int
	err = tx.QueryRow(ctx,
		`SELECT 1 FROM card_requests WHERE user_id = $1 AND status = 'pending' AND kind = $2::card_kind LIMIT 1`,
		userID, kind,
	).Scan(&has)
	if err == nil {
		return 0, ErrAlreadyPending
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return 0, err
	}

	var cardID int64
	if err := tx.QueryRow(ctx,
		`INSERT INTO cards (user_id, knipjes_remaining, kind, source) VALUES ($1, 10, $2::card_kind, 'online'::card_source) RETURNING id`,
		userID, kind,
	).Scan(&cardID); err != nil {
		return 0, err
	}

	var reqID int64
	err = tx.QueryRow(ctx,
		`INSERT INTO card_requests (user_id, card_id, kind, payment_method) VALUES ($1, $2, $3::card_kind, $4::payment_method) RETURNING id`,
		userID, cardID, kind, PaymentMethodTikkie,
	).Scan(&reqID)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return 0, ErrAlreadyPending
		}
		return 0, err
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return reqID, nil
}

func (s *Store) CreatePhysicalCardSale(ctx context.Context, in PhysicalCardSaleInput) (int64, error) {
	kind, err := NormalizeCardKind(in.Kind)
	if err != nil {
		return 0, err
	}
	paymentMethod, err := NormalizePaymentMethod(in.PaymentMethod)
	if err != nil {
		return 0, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	var matroos bool
	err = tx.QueryRow(ctx, `SELECT is_matroos_jeugd FROM users WHERE id = $1`, in.BuyerUserID).Scan(&matroos)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrNotFound
	}
	if err != nil {
		return 0, err
	}
	if kind == CardKindAvondeten && !matroos {
		return 0, ErrForbidden
	}

	var has int
	err = tx.QueryRow(ctx,
		`SELECT 1 FROM card_requests WHERE user_id = $1 AND status = 'pending' AND kind = $2::card_kind LIMIT 1`,
		in.BuyerUserID, kind,
	).Scan(&has)
	if err == nil {
		return 0, ErrAlreadyPending
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return 0, err
	}

	var cardID int64
	if err := tx.QueryRow(ctx,
		`INSERT INTO cards (user_id, knipjes_remaining, kind, source) VALUES ($1, 10, $2::card_kind, 'physical'::card_source) RETURNING id`,
		in.BuyerUserID, kind,
	).Scan(&cardID); err != nil {
		return 0, err
	}

	var reqID int64
	err = tx.QueryRow(ctx, `
INSERT INTO card_requests (
	user_id, status, kind, payment_method, card_id, fulfilled_at, fulfilled_by_admin_id, sale_price_eur
) VALUES (
	$1, 'fulfilled', $2::card_kind, $3::payment_method, $4, now(), $5, $6
) RETURNING id`,
		in.BuyerUserID, kind, paymentMethod, cardID, in.SellerUserID, in.SalePriceEUR,
	).Scan(&reqID)
	if err != nil {
		return 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return reqID, nil
}

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

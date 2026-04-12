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

package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("not found")
var ErrNoKnipjes = errors.New("geen knipjes meer")
var ErrForbidden = errors.New("verboden")
var ErrAlreadyPending = errors.New("er is al een openstaande aanvraag")
var ErrCannotCancelTrustUsed = errors.New("annuleren niet mogelijk: er zijn al knipjes gebruikt op deze kaart")

type User struct {
	ID        int64
	GoogleSub string
	Email     string
	Name      string
	IsAdmin   bool
	CreatedAt time.Time
}

type Card struct {
	ID               int64
	UserID           int64
	KnipjesRemaining int
	Note             *string
	CreatedAt        time.Time
}

type CardRequest struct {
	ID                  int64
	UserID              int64
	Status              string
	CreatedAt           time.Time
	FulfilledAt         *time.Time
	FulfilledByAdminID  *int64
	CardID              *int64
}

type CardRequestRow struct {
	CardRequest
	KnipjesRemaining int
	UserEmail        string
	UserName         string
}

type Store struct {
	pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

func (s *Store) UpsertUser(ctx context.Context, googleSub, email, name string, bootstrapAdmin bool) (*User, error) {
	const q = `
WITH ins AS (
  INSERT INTO users (google_sub, email, name, is_admin)
  VALUES ($1, $2, $3, $4)
  ON CONFLICT (google_sub) DO UPDATE SET
    email = EXCLUDED.email,
    name = EXCLUDED.name,
    is_admin = users.is_admin OR EXCLUDED.is_admin
  RETURNING id, google_sub, email, name, is_admin, created_at
)
SELECT id, google_sub, email, name, is_admin, created_at FROM ins`
	var u User
	err := s.pool.QueryRow(ctx, q, googleSub, email, name, bootstrapAdmin).Scan(
		&u.ID, &u.GoogleSub, &u.Email, &u.Name, &u.IsAdmin, &u.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("upsert user: %w", err)
	}
	return &u, nil
}

func (s *Store) UserByID(ctx context.Context, id int64) (*User, error) {
	const q = `SELECT id, google_sub, email, name, is_admin, created_at FROM users WHERE id = $1`
	var u User
	err := s.pool.QueryRow(ctx, q, id).Scan(&u.ID, &u.GoogleSub, &u.Email, &u.Name, &u.IsAdmin, &u.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (s *Store) CardsByUser(ctx context.Context, userID int64) ([]Card, error) {
	const q = `
SELECT id, user_id, knipjes_remaining, note, created_at
FROM cards WHERE user_id = $1 ORDER BY created_at DESC`
	rows, err := s.pool.Query(ctx, q, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Card
	for rows.Next() {
		var c Card
		if err := rows.Scan(&c.ID, &c.UserID, &c.KnipjesRemaining, &c.Note, &c.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *Store) UseKnipje(ctx context.Context, cardID, userID int64) error {
	const q = `
UPDATE cards SET knipjes_remaining = knipjes_remaining - 1
WHERE id = $1 AND user_id = $2 AND knipjes_remaining > 0`
	tag, err := s.pool.Exec(ctx, q, cardID, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		var rem int
		err := s.pool.QueryRow(ctx,
			`SELECT knipjes_remaining FROM cards WHERE id = $1 AND user_id = $2`,
			cardID, userID,
		).Scan(&rem)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		if rem == 0 {
			return ErrNoKnipjes
		}
		return ErrForbidden
	}
	return nil
}

func (s *Store) CreateCardRequest(ctx context.Context, userID int64) (int64, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	var has int
	err = tx.QueryRow(ctx,
		`SELECT 1 FROM card_requests WHERE user_id = $1 AND status = 'pending' LIMIT 1`,
		userID,
	).Scan(&has)
	if err == nil {
		return 0, ErrAlreadyPending
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return 0, err
	}

	var cardID int64
	if err := tx.QueryRow(ctx,
		`INSERT INTO cards (user_id, knipjes_remaining) VALUES ($1, 10) RETURNING id`,
		userID,
	).Scan(&cardID); err != nil {
		return 0, err
	}

	var reqID int64
	if err := tx.QueryRow(ctx,
		`INSERT INTO card_requests (user_id, card_id) VALUES ($1, $2) RETURNING id`,
		userID, cardID,
	).Scan(&reqID); err != nil {
		return 0, err
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return reqID, nil
}

type PendingCardRequestSummary struct {
	ID               int64
	CreatedAt        time.Time
	KnipjesRemaining int
}

func (s *Store) ListPendingCardRequestsForUser(ctx context.Context, userID int64) ([]PendingCardRequestSummary, error) {
	const q = `
SELECT cr.id, cr.created_at,
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
		if err := rows.Scan(&r.ID, &r.CreatedAt, &r.KnipjesRemaining); err != nil {
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
SELECT cr.id, cr.user_id, cr.status::text, cr.created_at, cr.fulfilled_at, cr.fulfilled_by_admin_id, cr.card_id,
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
			&r.ID, &r.UserID, &r.Status, &r.CreatedAt, &r.FulfilledAt, &r.FulfilledByAdminID, &r.CardID,
			&r.UserEmail, &r.UserName, &r.KnipjesRemaining,
		); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Store) FulfillCardRequest(ctx context.Context, requestID, adminUserID int64) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var reqUserID int64
	var status string
	var trustUsed int
	var existingCardID *int64
	err = tx.QueryRow(ctx,
		`SELECT user_id, status::text, trust_knipjes_used, card_id FROM card_requests WHERE id = $1 FOR UPDATE`,
		requestID,
	).Scan(&reqUserID, &status, &trustUsed, &existingCardID)
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
SET status = 'fulfilled', fulfilled_at = now(), fulfilled_by_admin_id = $2
WHERE id = $1 AND status = 'pending'`,
			requestID, adminUserID,
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
		`INSERT INTO cards (user_id, knipjes_remaining) VALUES ($1, $2) RETURNING id`,
		reqUserID, knipjesOnCard,
	).Scan(&cardID)
	if err != nil {
		return err
	}

	tag, err := tx.Exec(ctx, `
UPDATE card_requests
SET status = 'fulfilled', fulfilled_at = now(), fulfilled_by_admin_id = $2, card_id = $3
WHERE id = $1 AND status = 'pending'`,
		requestID, adminUserID, cardID,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrForbidden
	}
	return tx.Commit(ctx)
}

type AdminDashboardStats struct {
	ActiveCardsTotal          int64
	KnipjesRemainingTotal     int64
	PendingRequests           int64
	PendingWithCard           int64
	PendingKnipjesRemaining   int64
	PendingKnipjesConsumedEst int64
	FulfilledRequests         int64
	FulfilledKnipjesRemaining int64
	CancelledRequests         int64
}

func (s *Store) AdminDashboardStats(ctx context.Context) (*AdminDashboardStats, error) {
	const q = `
SELECT
  (SELECT COUNT(*)::bigint FROM cards) AS active_cards,
  (SELECT COALESCE(SUM(knipjes_remaining), 0)::bigint FROM cards) AS knipjes_rem_total,
  (SELECT COUNT(*)::bigint FROM card_requests WHERE status = 'pending') AS pending_req,
  (SELECT COUNT(*)::bigint FROM card_requests cr
     INNER JOIN cards c ON c.id = cr.card_id WHERE cr.status = 'pending') AS pending_with_card,
  (SELECT COALESCE(SUM(c.knipjes_remaining), 0)::bigint FROM card_requests cr
     INNER JOIN cards c ON c.id = cr.card_id WHERE cr.status = 'pending') AS pending_knip_rem,
  (SELECT COALESCE(SUM(LEAST(10, GREATEST(0, 10 - c.knipjes_remaining))), 0)::bigint
     FROM card_requests cr
     INNER JOIN cards c ON c.id = cr.card_id WHERE cr.status = 'pending') AS pending_knip_used_est,
  (SELECT COUNT(*)::bigint FROM card_requests WHERE status = 'fulfilled') AS fulfilled_req,
  (SELECT COALESCE(SUM(c.knipjes_remaining), 0)::bigint FROM card_requests cr
     INNER JOIN cards c ON c.id = cr.card_id WHERE cr.status = 'fulfilled') AS fulfilled_knip_rem,
  (SELECT COUNT(*)::bigint FROM card_requests WHERE status = 'cancelled') AS cancelled_req`
	var st AdminDashboardStats
	err := s.pool.QueryRow(ctx, q).Scan(
		&st.ActiveCardsTotal,
		&st.KnipjesRemainingTotal,
		&st.PendingRequests,
		&st.PendingWithCard,
		&st.PendingKnipjesRemaining,
		&st.PendingKnipjesConsumedEst,
		&st.FulfilledRequests,
		&st.FulfilledKnipjesRemaining,
		&st.CancelledRequests,
	)
	if err != nil {
		return nil, err
	}
	return &st, nil
}

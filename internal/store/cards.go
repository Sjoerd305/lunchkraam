package store

import (
	"context"
	"errors"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
)

func (s *Store) CardsByUser(ctx context.Context, userID int64) ([]Card, error) {
	const q = `
SELECT id, user_id, kind::text, source::text, knipjes_remaining, note, created_at
FROM cards WHERE user_id = $1 ORDER BY created_at DESC`
	rows, err := s.pool.Query(ctx, q, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Card
	for rows.Next() {
		var c Card
		if err := rows.Scan(&c.ID, &c.UserID, &c.Kind, &c.Source, &c.KnipjesRemaining, &c.Note, &c.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *Store) useKnipjeAnyCard(ctx context.Context, cardID int64) error {
	const q = `
UPDATE cards SET knipjes_remaining = knipjes_remaining - 1
WHERE id = $1 AND knipjes_remaining > 0`
	tag, err := s.pool.Exec(ctx, q, cardID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		var rem int
		err := s.pool.QueryRow(ctx, `SELECT knipjes_remaining FROM cards WHERE id = $1`, cardID).Scan(&rem)
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

// UseKnipje lets an admin/operator use one punch on any tosti card.
// Avondeten cards are excluded: debits only via RegisterAvondetenMealsForDate (kraam ochtendlijst).
func (s *Store) UseKnipje(ctx context.Context, cardID int64, actor *User) error {
	if !actor.IsAdmin && !actor.IsOperator {
		return ErrForbidden
	}
	var kind string
	err := s.pool.QueryRow(ctx, `SELECT kind::text FROM cards WHERE id = $1`, cardID).Scan(&kind)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if kind == CardKindAvondeten {
		return s.useKnipjeAnyCard(ctx, cardID)
	}
	return s.useKnipjeAnyCard(ctx, cardID)
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
SELECT c.id, c.user_id, c.kind::text, c.source::text, c.knipjes_remaining, c.note, c.created_at, u.name, u.email
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

func (s *Store) recentCardsWithOwners(ctx context.Context, limit int) ([]CardWithOwner, error) {
	rows, err := s.pool.Query(ctx, `
SELECT c.id, c.user_id, c.kind::text, c.source::text, c.knipjes_remaining, c.note, c.created_at, u.name, u.email
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
SELECT c.id, c.user_id, c.kind::text, c.source::text, c.knipjes_remaining, c.note, c.created_at, u.name, u.email
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
		if err := rows.Scan(&r.ID, &r.UserID, &r.Kind, &r.Source, &r.KnipjesRemaining, &r.Note, &r.CreatedAt, &r.OwnerName, &r.OwnerEmail); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

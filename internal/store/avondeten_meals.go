package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

var (
	ErrAvondetenAlreadyRegistered = errors.New("al geregistreerd voor deze datum")
	ErrAvondetenWrongCardKind     = errors.New("geen avondetenkaart")
)

// AvondetenRegistrationRow is one avondeten card with optional registration for a calendar day.
type AvondetenRegistrationRow struct {
	CardID             int64
	UserID             int64
	OwnerName          string
	OwnerEmail         string
	KnipjesRemaining   int
	RegisteredForDate  bool
}

// ListAvondetenCardsForMealDate returns all avondeten cards and whether each is already used on mealDate (calendar date in Europe/Amsterdam).
func (s *Store) ListAvondetenCardsForMealDate(ctx context.Context, mealDate time.Time) ([]AvondetenRegistrationRow, error) {
	loc, err := time.LoadLocation(adminSalesTZ)
	if err != nil {
		loc = time.UTC
	}
	d := mealDate.In(loc)
	day := time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, loc)

	const q = `
SELECT c.id, c.user_id, u.name, u.email, c.knipjes_remaining,
       EXISTS(
         SELECT 1 FROM avondeten_meals m
         WHERE m.card_id = c.id AND m.meal_date = $1::date
       ) AS registered
FROM cards c
JOIN users u ON u.id = c.user_id
WHERE c.kind = 'avondeten'::card_kind
ORDER BY u.name ASC, c.id ASC`
	rows, err := s.pool.Query(ctx, q, day)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []AvondetenRegistrationRow
	for rows.Next() {
		var r AvondetenRegistrationRow
		if err := rows.Scan(&r.CardID, &r.UserID, &r.OwnerName, &r.OwnerEmail, &r.KnipjesRemaining, &r.RegisteredForDate); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// RegisterAvondetenMealsForDate records one meal per selected avondeten card for the given calendar day and decrements knipjes. All-or-nothing.
func (s *Store) RegisterAvondetenMealsForDate(ctx context.Context, mealDate time.Time, cardIDs []int64, recordedByUserID int64) (int, error) {
	seen := make(map[int64]struct{}, len(cardIDs))
	var ids []int64
	for _, id := range cardIDs {
		if id <= 0 {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
	}
	if len(ids) == 0 {
		return 0, nil
	}

	loc, err := time.LoadLocation(adminSalesTZ)
	if err != nil {
		loc = time.UTC
	}
	d := mealDate.In(loc)
	day := time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, loc)

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	n := 0
	for _, cardID := range ids {
		var kind string
		var knip int
		err := tx.QueryRow(ctx,
			`SELECT kind::text, knipjes_remaining FROM cards WHERE id = $1 FOR UPDATE`,
			cardID,
		).Scan(&kind, &knip)
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, fmt.Errorf("kaart %d: %w", cardID, ErrNotFound)
		}
		if err != nil {
			return 0, err
		}
		if kind != CardKindAvondeten {
			return 0, fmt.Errorf("kaart %d: %w", cardID, ErrAvondetenWrongCardKind)
		}
		if knip <= 0 {
			return 0, fmt.Errorf("kaart %d: %w", cardID, ErrNoKnipjes)
		}
		var already bool
		err = tx.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM avondeten_meals WHERE card_id = $1 AND meal_date = $2::date)`,
			cardID, day,
		).Scan(&already)
		if err != nil {
			return 0, err
		}
		if already {
			return 0, fmt.Errorf("kaart %d: %w", cardID, ErrAvondetenAlreadyRegistered)
		}

		if _, err := tx.Exec(ctx, `
INSERT INTO avondeten_meals (card_id, meal_date, recorded_by_user_id)
VALUES ($1, $2::date, $3)`,
			cardID, day, recordedByUserID,
		); err != nil {
			return 0, err
		}
		tag, err := tx.Exec(ctx, `
UPDATE cards SET knipjes_remaining = knipjes_remaining - 1
WHERE id = $1 AND knipjes_remaining > 0`,
			cardID,
		)
		if err != nil {
			return 0, err
		}
		if tag.RowsAffected() == 0 {
			return 0, fmt.Errorf("kaart %d: %w", cardID, ErrNoKnipjes)
		}
		n++
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return n, nil
}

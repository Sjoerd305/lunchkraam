package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"

	"lunchkraam/internal/money"
)

// RevolutBalanceSnapshot is the EUR balance last read from a Revolut CSV "Saldo" column.
type RevolutBalanceSnapshot struct {
	BalanceEUR    float64
	StatementAsOf time.Time
	UpdatedAt     time.Time
}

// UpsertRevolutBalanceSnapshot replaces the single cached snapshot (id=1).
func (s *Store) UpsertRevolutBalanceSnapshot(ctx context.Context, balanceEUR float64, statementAsOf time.Time) error {
	balanceEUR = money.RoundEUR(balanceEUR)
	const q = `
INSERT INTO revolut_balance_snapshot (id, balance_eur, statement_as_of, updated_at)
VALUES (1, $1, $2, now())
ON CONFLICT (id) DO UPDATE SET
  balance_eur = EXCLUDED.balance_eur,
  statement_as_of = EXCLUDED.statement_as_of,
  updated_at = now()`
	_, err := s.pool.Exec(ctx, q, balanceEUR, statementAsOf.UTC())
	return err
}

// GetRevolutBalanceSnapshot returns nil when no import has stored a balance yet.
func (s *Store) GetRevolutBalanceSnapshot(ctx context.Context) (*RevolutBalanceSnapshot, error) {
	const q = `SELECT balance_eur, statement_as_of, updated_at FROM revolut_balance_snapshot WHERE id = 1`
	var out RevolutBalanceSnapshot
	err := s.pool.QueryRow(ctx, q).Scan(&out.BalanceEUR, &out.StatementAsOf, &out.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	out.BalanceEUR = money.RoundEUR(out.BalanceEUR)
	return &out, nil
}

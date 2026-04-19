package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/jackc/pgx/v5"
)

// BankCreditImportListRow is one imported bank credit for admin lists.
type BankCreditImportListRow struct {
	ID                    int64
	AmountEUR             float64
	ReceivedOn            time.Time
	Description           string
	Purpose               string
	Source                string
	ExternalID            string
	MatchedCardRequestID  *int64
}

// CardRequestMatchCandidate is a fulfilled sale that might pair with a bank credit.
type CardRequestMatchCandidate struct {
	CardRequestID int64
	FulfilledAt   time.Time
	UserEmail     string
	UserName      string
	SalePriceEUR  float64
	Kind          string
	PaymentMethod string
}

var (
	ErrBankCreditNotFound       = errors.New("bankimport niet gevonden")
	ErrBankCreditAlreadyMatched = errors.New("bankimport is al afgestemd")
	ErrCardRequestNotFound      = errors.New("kaartaanvraag niet gevonden")
	ErrCardRequestNotFulfilled  = errors.New("alleen vervulde aanvragen kunnen gekoppeld worden")
	ErrCardRequestAlreadyMatched = errors.New("deze kaartverkoop is al gekoppeld aan een bankregel")
	ErrRevenueMatchMismatch     = errors.New("bedrag of doel komt niet overeen met de bankregel")
)

func purposeMatchesCardKind(purpose, cardKind string) bool {
	switch purpose {
	case "lunchkraam":
		return cardKind == CardKindTosti
	case "avondeten":
		return cardKind == CardKindAvondeten
	default:
		return false
	}
}

func amountsMatchEUR(a, b float64) bool {
	return math.Abs(a-b) < 0.005
}

// ListBankCreditImportsUnmatched returns Revolut credits without a card_request match.
func (s *Store) ListBankCreditImportsUnmatched(ctx context.Context, year int) ([]BankCreditImportListRow, error) {
	const q = `
SELECT id, amount_eur::float8, received_on, description, purpose::text, source::text, COALESCE(external_id, ''), matched_card_request_id
FROM bank_credit_imports
WHERE matched_card_request_id IS NULL
  AND ($1 = 0 OR (EXTRACT(YEAR FROM received_on))::int = $1)
ORDER BY received_on DESC, id DESC
LIMIT 500`
	rows, err := s.pool.Query(ctx, q, year)
	if err != nil {
		return nil, fmt.Errorf("list unmatched bank credits: %w", err)
	}
	defer rows.Close()
	var out []BankCreditImportListRow
	for rows.Next() {
		var r BankCreditImportListRow
		var matched sql.NullInt64
		if err := rows.Scan(&r.ID, &r.AmountEUR, &r.ReceivedOn, &r.Description, &r.Purpose, &r.Source, &r.ExternalID, &matched); err != nil {
			return nil, err
		}
		if matched.Valid {
			v := matched.Int64
			r.MatchedCardRequestID = &v
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// ListBankCreditImportsMatched returns Revolut credits already linked to a fulfilled card sale (for review / unmatch).
func (s *Store) ListBankCreditImportsMatched(ctx context.Context, year int) ([]BankCreditImportListRow, error) {
	const q = `
SELECT id, amount_eur::float8, received_on, description, purpose::text, source::text, COALESCE(external_id, ''), matched_card_request_id
FROM bank_credit_imports
WHERE matched_card_request_id IS NOT NULL
  AND ($1 = 0 OR (EXTRACT(YEAR FROM received_on))::int = $1)
ORDER BY received_on DESC, id DESC
LIMIT 500`
	rows, err := s.pool.Query(ctx, q, year)
	if err != nil {
		return nil, fmt.Errorf("list matched bank credits: %w", err)
	}
	defer rows.Close()
	var out []BankCreditImportListRow
	for rows.Next() {
		var r BankCreditImportListRow
		var matched sql.NullInt64
		if err := rows.Scan(&r.ID, &r.AmountEUR, &r.ReceivedOn, &r.Description, &r.Purpose, &r.Source, &r.ExternalID, &matched); err != nil {
			return nil, err
		}
		if matched.Valid {
			v := matched.Int64
			r.MatchedCardRequestID = &v
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// SuggestCardRequestsForBankCredit returns fulfilled Tikkie sales that plausibly belong to this bank line.
func (s *Store) SuggestCardRequestsForBankCredit(ctx context.Context, bankCreditID int64) ([]CardRequestMatchCandidate, error) {
	var amount float64
	var purpose string
	var receivedOn time.Time
	err := s.pool.QueryRow(ctx, `
SELECT amount_eur::float8, purpose::text, received_on
FROM bank_credit_imports WHERE id = $1`, bankCreditID,
	).Scan(&amount, &purpose, &receivedOn)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrBankCreditNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("load bank credit: %w", err)
	}
	d1 := receivedOn.AddDate(0, 0, -1)
	d2 := receivedOn.AddDate(0, 0, 1)

	const q = `
SELECT cr.id, cr.fulfilled_at, u.email::text,
       COALESCE(NULLIF(trim(u.display_name), ''), u.email::text, '')::text,
       cr.sale_price_eur::float8, cr.kind::text, cr.payment_method::text
FROM card_requests cr
JOIN users u ON u.id = cr.user_id
WHERE cr.status = 'fulfilled'
  AND cr.fulfilled_at IS NOT NULL
  AND cr.payment_method = 'tikkie'::payment_method
  AND ($1::text = 'lunchkraam' AND cr.kind = 'tosti'::card_kind OR $1::text = 'avondeten' AND cr.kind = 'avondeten'::card_kind)
  AND ABS(cr.sale_price_eur::float8 - $2::float8) < 0.01
  AND NOT EXISTS (SELECT 1 FROM bank_credit_imports x WHERE x.matched_card_request_id = cr.id)
  AND DATE(cr.fulfilled_at AT TIME ZONE $5) BETWEEN $3::date AND $4::date
ORDER BY ABS((DATE(cr.fulfilled_at AT TIME ZONE $5) - DATE($6 AT TIME ZONE $5))::int) ASC, cr.fulfilled_at DESC
LIMIT 15`

	rows, err := s.pool.Query(ctx, q, purpose, amount, d1, d2, adminSalesTZ, receivedOn)
	if err != nil {
		return nil, fmt.Errorf("suggest matches: %w", err)
	}
	defer rows.Close()
	var out []CardRequestMatchCandidate
	for rows.Next() {
		var c CardRequestMatchCandidate
		if err := rows.Scan(&c.CardRequestID, &c.FulfilledAt, &c.UserEmail, &c.UserName, &c.SalePriceEUR, &c.Kind, &c.PaymentMethod); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

// LinkBankCreditToCardRequest sets matched_card_request_id after validation.
func (s *Store) LinkBankCreditToCardRequest(ctx context.Context, bankCreditID, cardRequestID int64) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var bAmt float64
	var bPurpose string
	var bMatched sql.NullInt64
	err = tx.QueryRow(ctx, `SELECT amount_eur::float8, purpose::text, matched_card_request_id FROM bank_credit_imports WHERE id = $1 FOR UPDATE`, bankCreditID).
		Scan(&bAmt, &bPurpose, &bMatched)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrBankCreditNotFound
	}
	if err != nil {
		return err
	}
	if bMatched.Valid {
		return ErrBankCreditAlreadyMatched
	}

	var crPrice float64
	var crKind, crStatus string
	err = tx.QueryRow(ctx, `
SELECT sale_price_eur::float8, kind::text, status::text
FROM card_requests WHERE id = $1 FOR UPDATE`, cardRequestID).
		Scan(&crPrice, &crKind, &crStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrCardRequestNotFound
	}
	if err != nil {
		return err
	}
	if crStatus != "fulfilled" {
		return ErrCardRequestNotFulfilled
	}
	if !purposeMatchesCardKind(bPurpose, crKind) {
		return ErrRevenueMatchMismatch
	}
	if !amountsMatchEUR(bAmt, crPrice) {
		return ErrRevenueMatchMismatch
	}

	var otherID int64
	err = tx.QueryRow(ctx, `SELECT id FROM bank_credit_imports WHERE matched_card_request_id = $1 AND id <> $2 LIMIT 1`, cardRequestID, bankCreditID).Scan(&otherID)
	if err == nil {
		return ErrCardRequestAlreadyMatched
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}

	tag, err := tx.Exec(ctx, `UPDATE bank_credit_imports SET matched_card_request_id = $2 WHERE id = $1 AND matched_card_request_id IS NULL`, bankCreditID, cardRequestID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrBankCreditAlreadyMatched
	}
	return tx.Commit(ctx)
}

// UnlinkBankCreditMatch clears matched_card_request_id for a bank import line.
func (s *Store) UnlinkBankCreditMatch(ctx context.Context, bankCreditID int64) error {
	tag, err := s.pool.Exec(ctx, `UPDATE bank_credit_imports SET matched_card_request_id = NULL WHERE id = $1`, bankCreditID)
	if err != nil {
		return fmt.Errorf("unlink bank credit: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrBankCreditNotFound
	}
	return nil
}

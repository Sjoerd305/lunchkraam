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

// ListBankCreditImportsUnmatched returns Revolut credits still counting as open bank omzet (status open).
func (s *Store) ListBankCreditImportsUnmatched(ctx context.Context, year int) ([]BankCreditImportListRow, error) {
	const q = `
SELECT id, amount_eur::float8, received_on, description, purpose::text, source::text, COALESCE(external_id, ''), matched_card_request_id, reconciliation_status
FROM bank_credit_imports
WHERE reconciliation_status = 'open'
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
		if err := scanBankCreditListRow(rows, &r); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// ListBankCreditImportsMatched returns credits linked to a fulfilled card sale (matched_sale).
func (s *Store) ListBankCreditImportsMatched(ctx context.Context, year int) ([]BankCreditImportListRow, error) {
	const q = `
SELECT id, amount_eur::float8, received_on, description, purpose::text, source::text, COALESCE(external_id, ''), matched_card_request_id, reconciliation_status
FROM bank_credit_imports
WHERE reconciliation_status = 'matched_sale'
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
		if err := scanBankCreditListRow(rows, &r); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// ListBankCreditImportsWaived returns credits marked reconciled without a card sale (excluded from open bank omzet).
func (s *Store) ListBankCreditImportsWaived(ctx context.Context, year int) ([]BankCreditImportListRow, error) {
	const q = `
SELECT id, amount_eur::float8, received_on, description, purpose::text, source::text, COALESCE(external_id, ''), matched_card_request_id, reconciliation_status
FROM bank_credit_imports
WHERE reconciliation_status = 'waived'
  AND ($1 = 0 OR (EXTRACT(YEAR FROM received_on))::int = $1)
ORDER BY received_on DESC, id DESC
LIMIT 500`
	rows, err := s.pool.Query(ctx, q, year)
	if err != nil {
		return nil, fmt.Errorf("list waived bank credits: %w", err)
	}
	defer rows.Close()
	var out []BankCreditImportListRow
	for rows.Next() {
		var r BankCreditImportListRow
		if err := scanBankCreditListRow(rows, &r); err != nil {
			return nil, err
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
	var status string
	err := s.pool.QueryRow(ctx, `
SELECT amount_eur::float8, purpose::text, received_on, reconciliation_status
FROM bank_credit_imports WHERE id = $1`, bankCreditID,
	).Scan(&amount, &purpose, &receivedOn, &status)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrBankCreditNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("load bank credit: %w", err)
	}
	if status != BankCreditReconciliationOpen {
		return nil, ErrBankCreditNotOpen
	}
	d1 := receivedOn.AddDate(0, 0, -SuggestBankCreditDateWindowDays)
	d2 := receivedOn.AddDate(0, 0, SuggestBankCreditDateWindowDays)

	const q = `
SELECT cr.id, cr.fulfilled_at, u.email::text,
       COALESCE(NULLIF(trim(u.name), ''), u.email::text, '')::text,
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

// ListManualMatchCardRequestsForBankCredit returns fulfilled Tikkie sales that match the bank line amount and purpose,
// are not yet linked to any bank import, and are grouped by card source (app vs kraam). No date window — for UI dropdown.
func (s *Store) ListManualMatchCardRequestsForBankCredit(ctx context.Context, bankCreditID int64) (online, physical []CardRequestMatchCandidate, err error) {
	var status string
	err = s.pool.QueryRow(ctx, `SELECT reconciliation_status::text FROM bank_credit_imports WHERE id = $1`, bankCreditID).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil, ErrBankCreditNotFound
	}
	if err != nil {
		return nil, nil, fmt.Errorf("load bank credit: %w", err)
	}
	if status != BankCreditReconciliationOpen {
		return nil, nil, ErrBankCreditNotOpen
	}

	const q = `
SELECT cr.id, cr.fulfilled_at, u.email::text,
       COALESCE(NULLIF(trim(u.name), ''), u.email::text, '')::text,
       cr.sale_price_eur::float8, cr.kind::text, cr.payment_method::text
FROM card_requests cr
JOIN users u ON u.id = cr.user_id
JOIN cards c ON c.id = cr.card_id
JOIN bank_credit_imports b ON b.id = $1 AND b.reconciliation_status = 'open'
WHERE cr.status = 'fulfilled'
  AND cr.fulfilled_at IS NOT NULL
  AND cr.payment_method = 'tikkie'::payment_method
  AND ((b.purpose::text = 'lunchkraam' AND cr.kind = 'tosti'::card_kind) OR (b.purpose::text = 'avondeten' AND cr.kind = 'avondeten'::card_kind))
  AND ABS(cr.sale_price_eur::float8 - b.amount_eur::float8) < 0.01
  AND NOT EXISTS (SELECT 1 FROM bank_credit_imports x WHERE x.matched_card_request_id = cr.id)
  AND c.source = $2::card_source
ORDER BY cr.fulfilled_at DESC
LIMIT $3`

	for _, pair := range []struct {
		source string
		dest   *[]CardRequestMatchCandidate
	}{
		{"online", &online},
		{"physical", &physical},
	} {
		list, qerr := func(source string) ([]CardRequestMatchCandidate, error) {
			rows, err := s.pool.Query(ctx, q, bankCreditID, source, ManualMatchBankCreditRowsPerSourceLimit)
			if err != nil {
				return nil, err
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
			return out, rows.Err()
		}(pair.source)
		if qerr != nil {
			return nil, nil, fmt.Errorf("list manual match %s: %w", pair.source, qerr)
		}
		*pair.dest = list
	}
	return online, physical, nil
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
	var bStatus string
	err = tx.QueryRow(ctx, `SELECT amount_eur::float8, purpose::text, matched_card_request_id, reconciliation_status FROM bank_credit_imports WHERE id = $1 FOR UPDATE`, bankCreditID).
		Scan(&bAmt, &bPurpose, &bMatched, &bStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrBankCreditNotFound
	}
	if err != nil {
		return err
	}
	if bStatus != BankCreditReconciliationOpen {
		return ErrBankCreditNotOpen
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

	tag, err := tx.Exec(ctx, `
UPDATE bank_credit_imports
SET matched_card_request_id = $2, reconciliation_status = 'matched_sale'
WHERE id = $1 AND reconciliation_status = 'open'`, bankCreditID, cardRequestID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrBankCreditAlreadyMatched
	}
	return tx.Commit(ctx)
}

// UnlinkBankCreditMatch clears reconciliation (matched_sale or waived) back to open.
func (s *Store) UnlinkBankCreditMatch(ctx context.Context, bankCreditID int64) error {
	tag, err := s.pool.Exec(ctx, `
UPDATE bank_credit_imports
SET matched_card_request_id = NULL, reconciliation_status = 'open'
WHERE id = $1 AND reconciliation_status IN ('matched_sale', 'waived')`, bankCreditID)
	if err != nil {
		return fmt.Errorf("unlink bank credit: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrBankCreditNotFound
	}
	return nil
}

// WaiveBankCreditFromOpenRevenue marks a bank line as reconciled without a card sale (excluded from open bank omzet).
func (s *Store) WaiveBankCreditFromOpenRevenue(ctx context.Context, bankCreditID int64) error {
	tag, err := s.pool.Exec(ctx, `
UPDATE bank_credit_imports
SET reconciliation_status = 'waived'
WHERE id = $1 AND reconciliation_status = 'open'`, bankCreditID)
	if err != nil {
		return fmt.Errorf("waive bank credit: %w", err)
	}
	if tag.RowsAffected() == 0 {
		var exists bool
		if err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM bank_credit_imports WHERE id = $1)`, bankCreditID).Scan(&exists); err != nil {
			return err
		}
		if !exists {
			return ErrBankCreditNotFound
		}
		return ErrBankCreditNotOpen
	}
	return nil
}

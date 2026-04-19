package store

import (
	"database/sql"
	"errors"
	"time"
)

// Bank credit reconciliation_status (DB CHECK + application).
const (
	BankCreditReconciliationOpen        = "open"
	BankCreditReconciliationMatchedSale = "matched_sale"
	BankCreditReconciliationWaived      = "waived"
)

// SuggestBankCreditDateWindowDays is half-width (calendar days, Amsterdam) for matching fulfilled_at to received_on.
const SuggestBankCreditDateWindowDays = 14

// ManualMatchBankCreditRowsPerSourceLimit caps fulfilled Tikkie sales per card source (online vs physical) for the manual match dropdown.
const ManualMatchBankCreditRowsPerSourceLimit = 50

// BankCreditImportListRow is one imported bank credit for admin lists.
type BankCreditImportListRow struct {
	ID                   int64
	AmountEUR            float64
	ReceivedOn           time.Time
	Description          string
	Purpose              string
	Source               string
	ExternalID           string
	MatchedCardRequestID *int64
	ReconciliationStatus string
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
	ErrBankCreditNotFound        = errors.New("bankimport niet gevonden")
	ErrBankCreditAlreadyMatched  = errors.New("bankimport is al afgestemd")
	ErrBankCreditNotOpen         = errors.New("bankregel is niet open voor deze actie")
	ErrCardRequestNotFound       = errors.New("kaartaanvraag niet gevonden")
	ErrCardRequestNotFulfilled   = errors.New("alleen vervulde aanvragen kunnen gekoppeld worden")
	ErrCardRequestAlreadyMatched = errors.New("deze kaartverkoop is al gekoppeld aan een bankregel")
	ErrRevenueMatchMismatch      = errors.New("bedrag of doel komt niet overeen met de bankregel")
)

func scanBankCreditListRow(rows interface {
	Scan(...any) error
}, r *BankCreditImportListRow) error {
	var matched sql.NullInt64
	if err := rows.Scan(&r.ID, &r.AmountEUR, &r.ReceivedOn, &r.Description, &r.Purpose, &r.Source, &r.ExternalID, &matched, &r.ReconciliationStatus); err != nil {
		return err
	}
	if matched.Valid {
		v := matched.Int64
		r.MatchedCardRequestID = &v
	} else {
		r.MatchedCardRequestID = nil
	}
	return nil
}

package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// pgConn is implemented by *pgxpool.Pool and pgx.Tx for shared shop expense queries.
type pgConn interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Exec(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error)
}

// Shop expense row sources (must match DB check constraint shop_expenses_source_check).
const (
	ShopExpenseSourceManual  = "manual"
	ShopExpenseSourceRevolut = "revolut"
)

// Manual shop expense movement (API); stored as signed amount_eur (positive = uitgave, negative = bij kas).
const (
	ShopExpenseMovementExpense = "expense"
	ShopExpenseMovementCashIn  = "cash_in"
)

// Payment channel (DB shop_expenses.payment_channel); must match amount sign (see CHECK constraints).
const (
	ShopExpensePaymentContant  = "contant"
	ShopExpensePaymentDigitaal = "digitaal"
	ShopExpensePaymentKasBij   = "kas_bij"
)

// ShopExpense is a grocery / supply cost entry (amount on calendar date spent_on).
type ShopExpense struct {
	ID             int64
	AmountEUR      float64
	SpentOn        time.Time
	Description    string
	Purpose        string
	PaymentChannel string
	Source         string
	ExternalID     string
	CreatedAt      time.Time
}

type ShopExpenseReceipt struct {
	ID            int64
	ShopExpenseID int64
	StoragePath   string
	ContentType   string
	SizeBytes     int64
	SHA256        string
	CreatedAt     time.Time
}

// AdminExpenseMonthAgg is the monthly expense split by purpose.
type AdminExpenseMonthAgg struct {
	LunchkraamEUR float64
	AvondetenEUR  float64
}

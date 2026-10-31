package store

import "time"

type User struct {
	ID                 int64
	GoogleSub          *string
	LoginUsername      *string
	Email              string
	Name               string
	IsAdmin            bool
	IsOperator         bool
	IsMatroosJeugd     bool
	MustChangePassword bool
	DisabledAt         *time.Time
	CreatedAt          time.Time
}

// IsDisabled reports whether the account has been deactivated by an admin.
func (u *User) IsDisabled() bool {
	return u != nil && u.DisabledAt != nil
}

type CardWithOwner struct {
	Card
	OwnerName  string
	OwnerEmail string
}

type AdminUserSummary struct {
	ID                 int64
	GoogleSub          *string
	LoginUsername      *string
	Email              string
	Name               string
	IsAdmin            bool
	IsOperator         bool
	IsMatroosJeugd     bool
	MustChangePassword bool
	DisabledAt         *time.Time
	CreatedAt          time.Time
	CardsTotal         int64
	KnipjesTotal       int64
	PendingRequests    int64
	// IsSystem marks the placeholder that holds the history of deleted accounts.
	IsSystem bool
}

type OperatorMemberSummary struct {
	ID    int64
	Name  string
	Email string
}

type Card struct {
	ID               int64
	UserID           int64
	Kind             string
	Source           string
	KnipjesRemaining int
	Note             *string
	CreatedAt        time.Time
	// Active is false while the online aanvraag for this card is still pending: the member can
	// place orders on it, but no knipjes can be deducted until an operator accordeert the payment.
	Active bool
}

type CardRequest struct {
	ID                 int64
	UserID             int64
	Status             string
	Kind               string
	PaymentMethod      string
	CreatedAt          time.Time
	FulfilledAt        *time.Time
	FulfilledByAdminID *int64
	CardID             *int64
}

type CardRequestRow struct {
	CardRequest
	KnipjesRemaining int
	UserEmail        string
	UserName         string
}

// AdminSalesMonthAgg is fulfilled card count and revenue for one calendar month (Europe/Amsterdam).
// RevenueEUR is kaartverkoop (app) plus alleen niet-afgestemde bankregels (Revolut zonder match op card_request).
type AdminSalesMonthAgg struct {
	FulfilledCount                int64
	RevenueEUR                    float64
	FulfilledCountTosti           int64
	FulfilledCountAvondeten       int64
	RevenueEURTosti               float64
	RevenueEURAvondeten           float64
	RevenueCardTosti              float64
	RevenueCardAvondeten          float64
	RevenueBankUnmatchedTosti     float64
	RevenueBankUnmatchedAvondeten float64
}

type PhysicalCardSaleInput struct {
	BuyerUserID   int64
	SellerUserID  int64
	Kind          string
	PaymentMethod string
	SalePriceEUR  float64
}

type PendingCardRequestSummary struct {
	ID               int64
	Kind             string
	CreatedAt        time.Time
	KnipjesRemaining int
}

type AdminDashboardStats struct {
	ActiveCardsTotal              int64
	KnipjesRemainingTotal         int64
	PendingRequests               int64
	PendingWithCard               int64
	PendingKnipjesRemaining       int64
	PendingKnipjesConsumedEst     int64
	FulfilledRequests             int64
	FulfilledKnipjesRemaining     int64
	CancelledRequests             int64
	FinanceYear                   int
	YearRevenueEUR                float64
	YearRevenueCardSalesEUR       float64
	YearRevenueBankUnmatchedEUR   float64
	YearBankCreditsUnmatchedCount int64
	YearExpensesEUR               float64
	YearNetEUR                    float64
}

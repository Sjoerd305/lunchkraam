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
	CreatedAt          time.Time
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
	CreatedAt          time.Time
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
type AdminSalesMonthAgg struct {
	FulfilledCount          int64
	RevenueEUR              float64
	FulfilledCountTosti     int64
	FulfilledCountAvondeten int64
	RevenueEURTosti         float64
	RevenueEURAvondeten     float64
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
	ActiveCardsTotal          int64
	KnipjesRemainingTotal     int64
	PendingRequests           int64
	PendingWithCard           int64
	PendingKnipjesRemaining   int64
	PendingKnipjesConsumedEst int64
	FulfilledRequests         int64
	FulfilledKnipjesRemaining int64
	CancelledRequests         int64
	FinanceYear               int
	YearRevenueEUR            float64
	YearExpensesEUR           float64
	YearNetEUR                float64
}

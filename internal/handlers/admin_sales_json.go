package handlers

// JSON shapes for GET /api/.../sales-stats (operator and admin). Field names must stay API-stable.

type adminSalesTripletInt struct {
	Tosti     int64 `json:"tosti"`
	Avondeten int64 `json:"avondeten"`
	Total     int64 `json:"total"`
}

type adminSalesTripletFloat struct {
	Tosti     float64 `json:"tosti"`
	Avondeten float64 `json:"avondeten"`
	Total     float64 `json:"total"`
}

type adminSalesExpensesSplit struct {
	Lunchkraam float64 `json:"lunchkraam"`
	Avondeten  float64 `json:"avondeten"`
	Total      float64 `json:"total"`
}

type adminSalesMonthlyRow struct {
	Month          int     `json:"month"`
	FulfilledCount int64   `json:"fulfilled_count"`
	RevenueEUR     float64 `json:"revenue_eur"`
	ExpensesEUR    float64 `json:"expenses_eur"`
	NetEUR         float64 `json:"net_eur"`
	LabelNL        string  `json:"label_nl"`
}

type adminSalesMonthlyBreakdownRow struct {
	Month       int                     `json:"month"`
	CardsSold   adminSalesTripletInt    `json:"cards_sold"`
	RevenueEUR  adminSalesTripletFloat  `json:"revenue_eur"`
	ExpensesEUR adminSalesExpensesSplit `json:"expenses_eur"`
	NetEUR      float64                 `json:"net_eur"`
	LabelNL     string                  `json:"label_nl"`
}

type adminSalesYearBreakdown struct {
	CardsSold   adminSalesTripletInt    `json:"cards_sold"`
	RevenueEUR  adminSalesTripletFloat  `json:"revenue_eur"`
	ExpensesEUR adminSalesExpensesSplit `json:"expenses_eur"`
	NetEUR      float64                 `json:"net_eur"`
}

type adminSalesTostiMonthlyRow struct {
	Month    int    `json:"month"`
	Quantity int64  `json:"quantity"`
	LabelNL  string `json:"label_nl"`
}

type adminSalesTostiKindRow struct {
	Bread    string `json:"bread"`
	Filling  string `json:"filling"`
	Quantity int64  `json:"quantity"`
}

type adminSalesStatsResponse struct {
	Year               int                             `json:"year"`
	Timezone           string                          `json:"timezone"`
	PaymentAmountEUR   string                          `json:"payment_amount_eur"`
	Monthly            []adminSalesMonthlyRow          `json:"monthly"`
	MonthlyBreakdown   []adminSalesMonthlyBreakdownRow `json:"monthly_breakdown"`
	YearFulfilledCount int64                           `json:"year_fulfilled_count"`
	YearRevenueEUR     float64                         `json:"year_revenue_eur"`
	YearExpensesEUR    float64                         `json:"year_expenses_eur"`
	YearNetEUR         float64                         `json:"year_net_eur"`
	YearBreakdown      adminSalesYearBreakdown         `json:"year_breakdown"`
	YearTostiQuantity  int64                           `json:"year_tosti_quantity"`
	TostiMonthly       []adminSalesTostiMonthlyRow     `json:"tosti_monthly"`
	TostiByKind        []adminSalesTostiKindRow        `json:"tosti_by_kind"`
}

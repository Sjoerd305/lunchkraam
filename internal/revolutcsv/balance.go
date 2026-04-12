package revolutcsv

import (
	"strings"
	"time"
)

// LatestEURStatementBalance returns the running balance from the EUR row with the latest
// CompletedDate that includes a parsed balance. When timestamps tie, the last such row in
// export order wins (typical for same-second ordering in statements).
func LatestEURStatementBalance(rows []Row) (balance float64, asOf time.Time, ok bool) {
	for _, row := range rows {
		if row.BalanceEUR == nil {
			continue
		}
		c := strings.TrimSpace(strings.ToUpper(row.Currency))
		if c != "" && c != "EUR" {
			continue
		}
		if !ok || row.CompletedDate.After(asOf) || row.CompletedDate.Equal(asOf) {
			asOf = row.CompletedDate
			balance = *row.BalanceEUR
			ok = true
		}
	}
	return balance, asOf, ok
}

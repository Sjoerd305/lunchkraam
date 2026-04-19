package money

import "math"

// RoundEUR returns v rounded to two decimal places (cents) for display and JSON APIs.
func RoundEUR(v float64) float64 {
	return math.Round(v*100) / 100
}

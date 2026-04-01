package store

import (
	"fmt"
	"strings"
)

const (
	CardKindTosti        = "tosti"
	CardKindAvondeten    = "avondeten"
	PaymentMethodTikkie  = "tikkie"
	PaymentMethodContant = "contant"
)

// NormalizeCardKind returns a valid card kind; empty string defaults to tosti.
func NormalizeCardKind(s string) (string, error) {
	s = strings.TrimSpace(strings.ToLower(s))
	if s == "" || s == CardKindTosti {
		return CardKindTosti, nil
	}
	if s == CardKindAvondeten {
		return CardKindAvondeten, nil
	}
	return "", fmt.Errorf("invalid card kind")
}

// NormalizePaymentMethod returns a valid payment method; empty string defaults to tikkie.
func NormalizePaymentMethod(s string) (string, error) {
	s = strings.TrimSpace(strings.ToLower(s))
	if s == "" || s == PaymentMethodTikkie {
		return PaymentMethodTikkie, nil
	}
	if s == PaymentMethodContant {
		return PaymentMethodContant, nil
	}
	return "", fmt.Errorf("invalid payment method")
}

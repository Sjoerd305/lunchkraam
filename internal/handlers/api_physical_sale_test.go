package handlers

import (
	"errors"
	"testing"

	"lunchkraam/internal/store"
)

func TestParsePhysicalCardSaleInput(t *testing.T) {
	operator := &store.User{IsOperator: true}

	t.Run("rejects non operator and non admin", func(t *testing.T) {
		_, err := parsePhysicalCardSaleInput(&store.User{}, 10, "tosti", "contant")
		var inv *errPhysicalSaleInput
		if !errors.As(err, &inv) || inv.Code != "operator_or_admin_required" {
			t.Fatalf("expected operator_or_admin_required, got %v", err)
		}
	})

	t.Run("rejects invalid payment method", func(t *testing.T) {
		_, err := parsePhysicalCardSaleInput(operator, 10, "tosti", "pin")
		var inv *errPhysicalSaleInput
		if !errors.As(err, &inv) || inv.Code != "invalid_payment_method" {
			t.Fatalf("expected invalid_payment_method, got %v", err)
		}
	})

	t.Run("accepts valid contant input", func(t *testing.T) {
		in, err := parsePhysicalCardSaleInput(operator, 10, "avondeten", "contant")
		if err != nil {
			t.Fatalf("expected no validation error, got %v", err)
		}
		if in.Kind != store.CardKindAvondeten {
			t.Fatalf("expected kind %q, got %q", store.CardKindAvondeten, in.Kind)
		}
		if in.PaymentMethod != store.PaymentMethodContant {
			t.Fatalf("expected payment method %q, got %q", store.PaymentMethodContant, in.PaymentMethod)
		}
	})
}

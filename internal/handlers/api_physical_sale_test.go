package handlers

import (
	"testing"

	"lunchkraam/internal/store"
)

func TestValidatePhysicalCardSaleInput(t *testing.T) {
	operator := &store.User{IsOperator: true}

	t.Run("rejects non operator and non admin", func(t *testing.T) {
		_, _, code, _ := validatePhysicalCardSaleInput(&store.User{}, 10, "tosti", "contant")
		if code != "operator_or_admin_required" {
			t.Fatalf("expected operator_or_admin_required, got %q", code)
		}
	})

	t.Run("rejects invalid payment method", func(t *testing.T) {
		_, _, code, _ := validatePhysicalCardSaleInput(operator, 10, "tosti", "pin")
		if code != "invalid_payment_method" {
			t.Fatalf("expected invalid_payment_method, got %q", code)
		}
	})

	t.Run("accepts valid contant input", func(t *testing.T) {
		kind, paymentMethod, code, _ := validatePhysicalCardSaleInput(operator, 10, "avondeten", "contant")
		if code != "" {
			t.Fatalf("expected no validation error, got %q", code)
		}
		if kind != store.CardKindAvondeten {
			t.Fatalf("expected kind %q, got %q", store.CardKindAvondeten, kind)
		}
		if paymentMethod != store.PaymentMethodContant {
			t.Fatalf("expected payment method %q, got %q", store.PaymentMethodContant, paymentMethod)
		}
	})
}

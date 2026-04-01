package store

import "testing"

func TestNormalizePaymentMethod(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		{name: "empty defaults to tikkie", input: "", want: PaymentMethodTikkie},
		{name: "tikkie accepted", input: "tikkie", want: PaymentMethodTikkie},
		{name: "contant accepted", input: "contant", want: PaymentMethodContant},
		{name: "trim and lowercase", input: "  ConTanT  ", want: PaymentMethodContant},
		{name: "invalid rejected", input: "pin", wantErr: true},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			got, err := NormalizePaymentMethod(tc.input)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tc.want {
				t.Fatalf("expected %q, got %q", tc.want, got)
			}
		})
	}
}

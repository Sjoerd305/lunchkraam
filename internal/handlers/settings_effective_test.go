package handlers

import "testing"

func TestNormalizePaymentAmountInput(t *testing.T) {
	cases := []struct {
		in      string
		want    string
		wantErr bool
	}{
		{"", "", false},
		{"15", "15", false},
		{" 15 ", "15", false},
		{"12,50", "12.50", false},
		{"12.5", "12.50", false},
		{"12.999", "13", false},
		{"0", "0", false},
		{"-1", "", true},
		{"abc", "", true},
		{"1001", "", true},
	}
	for _, c := range cases {
		got, err := normalizePaymentAmountInput(c.in)
		if c.wantErr {
			if err == nil {
				t.Errorf("%q: expected error, got %q", c.in, got)
			}
			continue
		}
		if err != nil {
			t.Errorf("%q: unexpected error %v", c.in, err)
			continue
		}
		if got != c.want {
			t.Errorf("%q: got %q, want %q", c.in, got, c.want)
		}
	}
}

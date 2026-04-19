package handlers

import "testing"

func TestClassifyFinanceControlDelta(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name  string
		rev   float64
		app   float64
		delta float64
		want  string
	}{
		{"no_activity", 0, 0, 0, "no_activity"},
		{"in_sync tiny", 100, 100.005, -0.005, "in_sync"},
		{"revolut_higher", 50, 10, 40, "revolut_imports_higher"},
		{"app_higher", 10, 50, -40, "app_revenue_higher"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := classifyFinanceControlDelta(tt.rev, tt.app, tt.delta)
			if got != tt.want {
				t.Fatalf("classifyFinanceControlDelta(%v,%v,%v) = %q, want %q", tt.rev, tt.app, tt.delta, got, tt.want)
			}
		})
	}
}

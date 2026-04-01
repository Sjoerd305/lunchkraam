package handlers

import (
	"testing"
	"time"
)

func TestBuildTikkieWarningWindow(t *testing.T) {
	now := time.Date(2026, 4, 1, 10, 0, 0, 0, time.UTC)
	rule := tikkieWarningRule{
		kind:  "tosti",
		label: "Tostikaart",
	}

	tests := []struct {
		name      string
		setAt     time.Time
		wantFound bool
		wantDays  int
	}{
		{
			name:      "outside warning window",
			setAt:     now.Add(-11 * 24 * time.Hour),
			wantFound: false,
		},
		{
			name:      "inside warning window",
			setAt:     now.Add(-12 * 24 * time.Hour),
			wantFound: true,
			wantDays:  2,
		},
		{
			name:      "already expired",
			setAt:     now.Add(-15 * 24 * time.Hour),
			wantFound: false,
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			got, ok := buildTikkieWarning(rule, tc.setAt.Format(time.RFC3339), now)
			if ok != tc.wantFound {
				t.Fatalf("expected found=%v, got %v", tc.wantFound, ok)
			}
			if !tc.wantFound {
				return
			}
			if got.DaysRemaining != tc.wantDays {
				t.Fatalf("expected days=%d, got %d", tc.wantDays, got.DaysRemaining)
			}
			if got.Kind != rule.kind {
				t.Fatalf("expected kind=%s, got %s", rule.kind, got.Kind)
			}
		})
	}
}

func TestBuildTikkieWarningInvalidTimestamp(t *testing.T) {
	now := time.Date(2026, 4, 1, 10, 0, 0, 0, time.UTC)
	rule := tikkieWarningRule{
		kind:  "tosti",
		label: "Tostikaart",
	}

	_, ok := buildTikkieWarning(rule, "not-a-time", now)
	if ok {
		t.Fatal("expected invalid timestamp to be ignored")
	}
}

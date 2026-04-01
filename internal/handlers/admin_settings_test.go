package handlers

import "testing"

func TestShouldUpdateTikkieTimestamp(t *testing.T) {
	tests := []struct {
		name    string
		current string
		next    string
		want    bool
	}{
		{
			name:    "same url does not reset timestamp",
			current: "https://example.com/tikkie",
			next:    "https://example.com/tikkie",
			want:    false,
		},
		{
			name:    "different url resets timestamp",
			current: "https://example.com/old",
			next:    "https://example.com/new",
			want:    true,
		},
		{
			name:    "clear url resets timestamp",
			current: "https://example.com/old",
			next:    "",
			want:    true,
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			got := shouldUpdateTikkieTimestamp(tc.current, tc.next)
			if got != tc.want {
				t.Fatalf("expected %v, got %v", tc.want, got)
			}
		})
	}
}

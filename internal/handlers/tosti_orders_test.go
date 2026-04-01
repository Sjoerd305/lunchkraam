package handlers

import (
	"testing"
	"time"

	"lunchkraam/internal/store"
)

func TestTostiOrderToJSON_MapsPhysicalCardFlag(t *testing.T) {
	now := time.Now().UTC()
	order := store.TostiOrder{
		ID:             42,
		UserID:         7,
		Quantity:       2,
		Bread:          "wit",
		Filling:        "ham",
		Status:         "pending",
		CreatedAt:      now,
		IsPhysicalCard: true,
	}

	got := tostiOrderToJSON(order)
	if !got.IsPhysicalCard {
		t.Fatalf("expected IsPhysicalCard to be true")
	}
	if got.ID != order.ID {
		t.Fatalf("expected id %d, got %d", order.ID, got.ID)
	}
}

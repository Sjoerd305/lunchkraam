package handlers

import (
	"encoding/json"
	"strings"
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

func TestTostiOrderToJSON_RemarkOmitempty(t *testing.T) {
	empty := tostiOrderToJSON(store.TostiOrder{
		ID:        1,
		UserID:    2,
		Quantity:  1,
		Bread:     "wit",
		Filling:   "kaas",
		Status:    "pending",
		CreatedAt: time.Now().UTC(),
		Remark:    "",
	})
	raw, err := json.Marshal(empty)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), `"remark"`) {
		t.Fatalf("expected empty remark omitted, got %s", raw)
	}

	withNote := tostiOrderToJSON(store.TostiOrder{
		ID:        1,
		UserID:    2,
		Quantity:  1,
		Bread:     "wit",
		Filling:   "kaas",
		Status:    "pending",
		CreatedAt: time.Now().UTC(),
		Remark:    "Licht toasten",
	})
	raw2, err := json.Marshal(withNote)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw2), `"remark":"Licht toasten"`) {
		t.Fatalf("expected remark in JSON, got %s", raw2)
	}
}

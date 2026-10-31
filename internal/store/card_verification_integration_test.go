package store_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"lunchkraam/internal/store"
)

// A card bought online is not active until an operator accordeert the payment: ordering works,
// deducting knipjes (deliver, manual knipje, avondeten) does not.
func TestCardInactiveUntilPaymentAccorded(t *testing.T) {
	s, pool := integrationStore(t)
	ctx := context.Background()
	u := uniq("v")
	member := insertGoogleUser(t, pool, u+"-m", u+"-m@test.nl", "Lid", false, false, true)
	operatorID := insertGoogleUser(t, pool, u+"-o", u+"-o@test.nl", "Kraam", true, false, false)
	operator := &store.User{ID: operatorID, IsOperator: true}

	reqID, err := s.CreateCardRequest(ctx, member, store.CardKindTosti)
	if err != nil {
		t.Fatalf("CreateCardRequest: %v", err)
	}
	cards, err := s.CardsByUser(ctx, member)
	if err != nil || len(cards) != 1 {
		t.Fatalf("CardsByUser: %v %d", err, len(cards))
	}
	card := cards[0]
	if card.Active {
		t.Fatalf("new online card must be inactive until accordering")
	}

	order, err := s.CreateTostiOrder(ctx, member, &card.ID, "wit", "ham", 2, "")
	if err != nil {
		t.Fatalf("ordering on an inactive card must be allowed: %v", err)
	}
	queue, err := s.ListPendingTostiOrdersForOperator(ctx, 100)
	if err != nil {
		t.Fatalf("queue: %v", err)
	}
	var found bool
	for _, row := range queue {
		if row.ID == order.ID {
			found = true
			if row.PendingCardRequestID == nil || *row.PendingCardRequestID != reqID {
				t.Fatalf("queue row must carry the pending request id, got %v", row.PendingCardRequestID)
			}
		}
	}
	if !found {
		t.Fatalf("order not in queue")
	}

	if err := s.DeliverTostiOrder(ctx, order.ID, operatorID); !errors.Is(err, store.ErrCardNotVerified) {
		t.Fatalf("deliver on inactive card: want ErrCardNotVerified, got %v", err)
	}
	if err := s.UseKnipje(ctx, card.ID, operator); !errors.Is(err, store.ErrCardNotVerified) {
		t.Fatalf("manual knipje on inactive card: want ErrCardNotVerified, got %v", err)
	}
	ops, err := s.SearchCardsWithOwners(ctx, u+"-m@test.nl", 10)
	if err != nil || len(ops) != 1 || ops[0].Active {
		t.Fatalf("operator card search must show inactive card: %v %+v", err, ops)
	}

	if err := s.FulfillCardRequest(ctx, reqID, operatorID, 15); err != nil {
		t.Fatalf("fulfill: %v", err)
	}
	cards, _ = s.CardsByUser(ctx, member)
	if !cards[0].Active {
		t.Fatalf("card must be active after accordering")
	}
	if err := s.DeliverTostiOrder(ctx, order.ID, operatorID); err != nil {
		t.Fatalf("deliver after accordering: %v", err)
	}
	cards, _ = s.CardsByUser(ctx, member)
	if cards[0].KnipjesRemaining != 8 {
		t.Fatalf("knipjes after delivery: want 8, got %d", cards[0].KnipjesRemaining)
	}
	queue, _ = s.ListPendingTostiOrdersForOperator(ctx, 100)
	for _, row := range queue {
		if row.ID == order.ID {
			t.Fatalf("delivered order still in queue")
		}
	}

	// Avondeten: same rule, booked by the kraam per date.
	avReq, err := s.CreateCardRequest(ctx, member, store.CardKindAvondeten)
	if err != nil {
		t.Fatalf("avondeten request: %v", err)
	}
	day := time.Date(2026, 10, 31, 12, 0, 0, 0, time.UTC)
	rows, err := s.ListAvondetenCardsForMealDate(ctx, day)
	if err != nil {
		t.Fatalf("avondeten list: %v", err)
	}
	var avCard int64
	for _, r := range rows {
		if r.UserID == member {
			avCard = r.CardID
			if r.Active {
				t.Fatalf("avondeten card must be inactive before accordering")
			}
		}
	}
	if avCard == 0 {
		t.Fatalf("avondeten card not listed")
	}
	if _, err := s.RegisterAvondetenMealsForDate(ctx, day, []int64{avCard}, operatorID); !errors.Is(err, store.ErrCardNotVerified) {
		t.Fatalf("avondeten on inactive card: want ErrCardNotVerified, got %v", err)
	}
	if err := s.FulfillCardRequest(ctx, avReq, operatorID, 12); err != nil {
		t.Fatalf("fulfill avondeten: %v", err)
	}
	if n, err := s.RegisterAvondetenMealsForDate(ctx, day, []int64{avCard}, operatorID); err != nil || n != 1 {
		t.Fatalf("avondeten after accordering: %v n=%d", err, n)
	}

	// Physical sales are accordeerd on the spot and therefore active immediately.
	if _, err := s.CreatePhysicalCardSale(ctx, store.PhysicalCardSaleInput{
		BuyerUserID: member, SellerUserID: operatorID, Kind: store.CardKindTosti, PaymentMethod: "contant", SalePriceEUR: 15,
	}); err != nil {
		t.Fatalf("physical sale: %v", err)
	}
	cards, _ = s.CardsByUser(ctx, member)
	for _, c := range cards {
		if !c.Active {
			t.Fatalf("card #%d (%s) should be active", c.ID, c.Source)
		}
	}
}

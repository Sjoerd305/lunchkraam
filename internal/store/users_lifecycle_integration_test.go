package store_test

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"lunchkraam/internal/store"
)

func newLocal(t *testing.T, s *store.Store, username string, matroos bool) *store.User {
	t.Helper()
	ctx := context.Background()
	hash, _ := bcrypt.GenerateFromPassword([]byte("wachtwoord1"), bcrypt.MinCost)
	u, err := s.CreateLocalUser(ctx, username, "Jeugdlid "+username, hash, false, false, false)
	if err != nil {
		t.Fatalf("CreateLocalUser: %v", err)
	}
	if matroos {
		if err := s.AdminSetMatroosJeugd(ctx, u.ID, true); err != nil {
			t.Fatalf("matroos: %v", err)
		}
	}
	return u
}

func countFulfilled(t *testing.T, _ *store.Store, pool *pgxpool.Pool) int64 {
	t.Helper()
	var n int64
	if err := pool.QueryRow(context.Background(), `SELECT count(*) FROM card_requests WHERE status = 'fulfilled'`).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	return n
}

// Google link by prepared e-mail: the first Google login takes over the local row (same id).
func TestLocalUserLinkedToGoogleByPreparedEmail(t *testing.T) {
	s, pool := integrationStore(t)
	ctx := context.Background()
	u := uniq("l")
	operatorID := insertGoogleUser(t, pool, u+"-o", u+"-o@test.nl", "Kraam", true, false, false)
	local := newLocal(t, s, "jeugd"+u[2:], true)
	if _, err := s.CreateCardRequest(ctx, local.ID, store.CardKindTosti); err != nil {
		t.Fatalf("request: %v", err)
	}
	if _, err := s.CreatePhysicalCardSale(ctx, store.PhysicalCardSaleInput{
		BuyerUserID: local.ID, SellerUserID: operatorID, Kind: store.CardKindAvondeten, PaymentMethod: "tikkie", SalePriceEUR: 12,
	}); err != nil {
		t.Fatalf("sale: %v", err)
	}

	googleEmail := u + "-jeugd@club.nl"
	if err := s.AdminSetLocalUserGoogleEmail(ctx, local.ID, googleEmail); err != nil {
		t.Fatalf("set google email: %v", err)
	}
	if _, err := s.AuthenticateLocalUser(ctx, *local.LoginUsername, "wachtwoord1"); err != nil {
		t.Fatalf("local login must keep working until the Google login happens: %v", err)
	}
	// Someone else's address must be refused.
	if err := s.AdminSetLocalUserGoogleEmail(ctx, local.ID, u+"-o@test.nl"); !errors.Is(err, store.ErrEmailTaken) {
		t.Fatalf("want ErrEmailTaken, got %v", err)
	}

	linked, err := s.UpsertUser(ctx, u+"-sub", "  "+u+"-JEUGD@club.nl ", "Jeugd Google", false)
	if err != nil {
		t.Fatalf("UpsertUser link: %v", err)
	}
	// UpsertUser lowercases nothing itself; the comparison is case-insensitive on the trimmed address.
	if linked.ID != local.ID {
		t.Fatalf("Google login must take over the local row: got id %d, want %d", linked.ID, local.ID)
	}
	if linked.GoogleSub == nil || linked.LoginUsername != nil || !linked.IsMatroosJeugd {
		t.Fatalf("linked user state wrong: %+v", linked)
	}
	if _, err := s.AuthenticateLocalUser(ctx, *local.LoginUsername, "wachtwoord1"); !errors.Is(err, store.ErrInvalidCredentials) {
		t.Fatalf("local login must stop working after linking, got %v", err)
	}
	cards, _ := s.CardsByUser(ctx, local.ID)
	if len(cards) != 2 {
		t.Fatalf("cards must stay with the account, got %d", len(cards))
	}
	pending, _ := s.ListPendingCardRequestsForUser(ctx, local.ID)
	if len(pending) != 1 {
		t.Fatalf("open aanvraag must stay, got %d", len(pending))
	}
	// Second Google login: ordinary update path.
	again, err := s.UpsertUser(ctx, u+"-sub", googleEmail, "Jeugd Google", false)
	if err != nil || again.ID != local.ID {
		t.Fatalf("second login: %v id=%d", err, again.ID)
	}
}

// Merge: local account into an existing Google account, everything moves, local row disappears.
func TestMergeLocalUserIntoGoogle(t *testing.T) {
	s, pool := integrationStore(t)
	ctx := context.Background()
	u := uniq("m")
	adminID := insertGoogleUser(t, pool, u+"-a", u+"-a@test.nl", "Admin", true, true, false)
	local := newLocal(t, s, "merge"+u[2:], true)
	localReq, err := s.CreateCardRequest(ctx, local.ID, store.CardKindTosti)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	if _, err := s.CreatePhysicalCardSale(ctx, store.PhysicalCardSaleInput{
		BuyerUserID: local.ID, SellerUserID: adminID, Kind: store.CardKindAvondeten, PaymentMethod: "contant", SalePriceEUR: 12,
	}); err != nil {
		t.Fatalf("sale: %v", err)
	}
	google, err := s.UpsertUser(ctx, u+"-gsub", u+"-g@club.nl", "Google Lid", false)
	if err != nil {
		t.Fatalf("google user: %v", err)
	}
	gReq, err := s.CreateCardRequest(ctx, google.ID, store.CardKindTosti)
	if err != nil {
		t.Fatalf("google request: %v", err)
	}

	if err := s.AdminMergeLocalUserIntoGoogle(ctx, local.ID, google.ID, adminID); !errors.Is(err, store.ErrMergeConflict) {
		t.Fatalf("two open tosti aanvragen: want ErrMergeConflict, got %v", err)
	}
	if err := s.FulfillCardRequest(ctx, gReq, adminID, 15); err != nil {
		t.Fatalf("fulfill: %v", err)
	}
	if err := s.AdminMergeLocalUserIntoGoogle(ctx, google.ID, local.ID, adminID); !errors.Is(err, store.ErrMergeSourceNotLocal) {
		t.Fatalf("google as source: want ErrMergeSourceNotLocal, got %v", err)
	}
	if err := s.AdminMergeLocalUserIntoGoogle(ctx, local.ID, adminID, adminID); !errors.Is(err, store.ErrCannotChangeSelf) {
		t.Fatalf("merge into yourself: want ErrCannotChangeSelf, got %v", err)
	}
	if err := s.AdminMergeLocalUserIntoGoogle(ctx, local.ID, google.ID, adminID); err != nil {
		t.Fatalf("merge: %v", err)
	}
	if _, err := s.UserByID(ctx, local.ID); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("local account must be gone, got %v", err)
	}
	g, _ := s.UserByID(ctx, google.ID)
	if !g.IsMatroosJeugd {
		t.Fatalf("matroos flag must carry over")
	}
	cards, _ := s.CardsByUser(ctx, google.ID)
	if len(cards) != 3 {
		t.Fatalf("google account must hold 3 cards (own + 2 from local), got %d", len(cards))
	}
	pending, _ := s.ListPendingCardRequestsForUser(ctx, google.ID)
	if len(pending) != 1 || pending[0].ID != localReq {
		t.Fatalf("local open aanvraag must move along, got %+v", pending)
	}
}

// Delete: only deactivated accounts; sales history stays (under the placeholder), open stuff is cancelled.
func TestDeleteDeactivatedUserKeepsHistory(t *testing.T) {
	s, pool := integrationStore(t)
	ctx := context.Background()
	u := uniq("d")
	adminID := insertGoogleUser(t, pool, u+"-a", u+"-a@test.nl", "Admin", true, true, false)
	local := newLocal(t, s, "weg"+u[2:], false)
	if _, err := s.CreatePhysicalCardSale(ctx, store.PhysicalCardSaleInput{
		BuyerUserID: local.ID, SellerUserID: adminID, Kind: store.CardKindTosti, PaymentMethod: "contant", SalePriceEUR: 15,
	}); err != nil {
		t.Fatalf("sale: %v", err)
	}
	if _, err := s.CreateCardRequest(ctx, local.ID, store.CardKindAvondeten); err == nil {
		t.Fatalf("avondeten without matroos flag must be refused")
	}
	if _, err := s.CreateCardRequest(ctx, local.ID, store.CardKindTosti); err != nil {
		t.Fatalf("request: %v", err)
	}
	cards, _ := s.CardsByUser(ctx, local.ID)
	var pendingCard int64
	for _, c := range cards {
		if !c.Active {
			pendingCard = c.ID
		}
	}
	if _, err := s.CreateTostiOrder(ctx, local.ID, &pendingCard, "bruin", "kaas", 1, ""); err != nil {
		t.Fatalf("order: %v", err)
	}
	before := countFulfilled(t, s, pool)

	if err := s.AdminDeleteUser(ctx, local.ID, adminID); !errors.Is(err, store.ErrUserNotDisabled) {
		t.Fatalf("active account: want ErrUserNotDisabled, got %v", err)
	}
	if err := s.AdminSetUserDisabled(ctx, local.ID, adminID, true); err != nil {
		t.Fatalf("disable: %v", err)
	}
	if err := s.AdminDeleteUser(ctx, adminID, adminID); !errors.Is(err, store.ErrCannotChangeSelf) {
		t.Fatalf("self delete: want ErrCannotChangeSelf, got %v", err)
	}
	if err := s.AdminDeleteUser(ctx, local.ID, adminID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, err := s.UserByID(ctx, local.ID); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("deleted account still there: %v", err)
	}
	if after := countFulfilled(t, s, pool); after != before {
		t.Fatalf("fulfilled sales must survive deletion: before %d after %d", before, after)
	}

	users, err := s.ListAdminUsers(ctx)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	var placeholder *store.AdminUserSummary
	for i := range users {
		if users[i].IsSystem {
			placeholder = &users[i]
		}
	}
	if placeholder == nil || placeholder.DisabledAt == nil || placeholder.CardsTotal < 1 {
		t.Fatalf("placeholder must exist, be deactivated and hold the history: %+v", placeholder)
	}
	if err := s.AdminDeleteUser(ctx, placeholder.ID, adminID); !errors.Is(err, store.ErrSystemUser) {
		t.Fatalf("placeholder delete: want ErrSystemUser, got %v", err)
	}
	if err := s.AdminSetUserDisabled(ctx, placeholder.ID, adminID, false); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("placeholder activate: want ErrNotFound, got %v", err)
	}
	if _, err := s.AuthenticateLocalUser(ctx, *placeholder.LoginUsername, "!"); !errors.Is(err, store.ErrInvalidCredentials) {
		t.Fatalf("placeholder must never log in: %v", err)
	}
	// Open order on the deleted member's never-activated card is gone with the card.
	queue, _ := s.ListPendingTostiOrdersForOperator(ctx, 200)
	for _, row := range queue {
		if row.CardID != nil && *row.CardID == pendingCard {
			t.Fatalf("open order of deleted account still in queue")
		}
	}
}

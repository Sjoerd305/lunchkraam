package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

const adminSalesTZ = "Europe/Amsterdam"

// bcrypt hash of "password" — used for constant-time path when user is unknown.
const bcryptDummyHash = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"

var ErrNotFound = errors.New("not found")
var ErrNoKnipjes = errors.New("geen knipjes meer")
var ErrForbidden = errors.New("verboden")
var ErrAlreadyPending = errors.New("er is al een openstaande aanvraag")
var ErrCannotCancelTrustUsed = errors.New("annuleren niet mogelijk: er zijn al knipjes gebruikt op deze kaart")
var ErrCannotRejectKnipjesUsed = errors.New("weigeren niet mogelijk: er zijn al knipjes gebruikt; accordeer de betaling")
var ErrInvalidCredentials = errors.New("ongeldige gebruikersnaam of wachtwoord")
var ErrUsernameTaken = errors.New("gebruikersnaam bestaat al")
var ErrCardNotForTosti = errors.New("deze kaart is geen tostikaart")
var ErrAvondetenManualUseDisabled = errors.New("avondetenkaart: gebruik de ochtendregistratie op de kraampagina")
var ErrInvalidCurrentPassword = errors.New("huidig wachtwoord is onjuist")
var ErrNotLocalAccount = errors.New("account gebruikt geen lokaal wachtwoord")

type User struct {
	ID                 int64
	GoogleSub          *string
	LoginUsername      *string
	Email              string
	Name               string
	IsAdmin            bool
	IsOperator         bool
	IsMatroosJeugd     bool
	MustChangePassword bool
	CreatedAt          time.Time
}

type CardWithOwner struct {
	Card
	OwnerName  string
	OwnerEmail string
}

type AdminUserSummary struct {
	ID                 int64
	GoogleSub          *string
	LoginUsername      *string
	Email              string
	Name               string
	IsAdmin            bool
	IsOperator         bool
	IsMatroosJeugd     bool
	MustChangePassword bool
	CreatedAt          time.Time
}

func scanUser(scanner interface{ Scan(dest ...any) error }) (*User, error) {
	var u User
	var gsub, lun sql.NullString
	err := scanner.Scan(&u.ID, &gsub, &lun, &u.Email, &u.Name, &u.IsAdmin, &u.IsOperator, &u.IsMatroosJeugd, &u.MustChangePassword, &u.CreatedAt)
	if err != nil {
		return nil, err
	}
	if gsub.Valid {
		s := gsub.String
		u.GoogleSub = &s
	}
	if lun.Valid {
		s := lun.String
		u.LoginUsername = &s
	}
	return &u, nil
}

type Card struct {
	ID               int64
	UserID           int64
	Kind             string
	KnipjesRemaining int
	Note             *string
	CreatedAt        time.Time
}

type CardRequest struct {
	ID                 int64
	UserID             int64
	Status             string
	Kind               string
	CreatedAt          time.Time
	FulfilledAt        *time.Time
	FulfilledByAdminID *int64
	CardID             *int64
}

type CardRequestRow struct {
	CardRequest
	KnipjesRemaining int
	UserEmail        string
	UserName         string
}

// AdminSalesMonthAgg is fulfilled card count and revenue for one calendar month (Europe/Amsterdam).
type AdminSalesMonthAgg struct {
	FulfilledCount          int64
	RevenueEUR              float64
	FulfilledCountTosti     int64
	FulfilledCountAvondeten int64
	RevenueEURTosti         float64
	RevenueEURAvondeten     float64
}

type Store struct {
	pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

func (s *Store) UpsertUser(ctx context.Context, googleSub, email, name string, bootstrapAdmin bool) (*User, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	row := tx.QueryRow(ctx, `
UPDATE users SET email = $1, name = $2, is_admin = users.is_admin OR $3
WHERE google_sub = $4
RETURNING id, google_sub, login_username, email, name, is_admin, is_operator, is_matroos_jeugd, must_change_password, created_at`,
		email, name, bootstrapAdmin, googleSub,
	)
	u, err := scanUser(row)
	if err == nil {
		return u, tx.Commit(ctx)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("upsert user update: %w", err)
	}

	row = tx.QueryRow(ctx, `
INSERT INTO users (google_sub, email, name, is_admin)
VALUES ($1, $2, $3, $4)
RETURNING id, google_sub, login_username, email, name, is_admin, is_operator, is_matroos_jeugd, must_change_password, created_at`,
		googleSub, email, name, bootstrapAdmin,
	)
	u, err = scanUser(row)
	if err != nil {
		return nil, fmt.Errorf("upsert user insert: %w", err)
	}
	return u, tx.Commit(ctx)
}

func (s *Store) UserByID(ctx context.Context, id int64) (*User, error) {
	row := s.pool.QueryRow(ctx, `
SELECT id, google_sub, login_username, email, name, is_admin, is_operator, is_matroos_jeugd, must_change_password, created_at FROM users WHERE id = $1`, id)
	u, err := scanUser(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return u, nil
}

func (s *Store) CardsByUser(ctx context.Context, userID int64) ([]Card, error) {
	const q = `
SELECT id, user_id, kind::text, knipjes_remaining, note, created_at
FROM cards WHERE user_id = $1 ORDER BY created_at DESC`
	rows, err := s.pool.Query(ctx, q, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Card
	for rows.Next() {
		var c Card
		if err := rows.Scan(&c.ID, &c.UserID, &c.Kind, &c.KnipjesRemaining, &c.Note, &c.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *Store) useKnipjeAnyCard(ctx context.Context, cardID int64) error {
	const q = `
UPDATE cards SET knipjes_remaining = knipjes_remaining - 1
WHERE id = $1 AND knipjes_remaining > 0`
	tag, err := s.pool.Exec(ctx, q, cardID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		var rem int
		err := s.pool.QueryRow(ctx, `SELECT knipjes_remaining FROM cards WHERE id = $1`, cardID).Scan(&rem)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		if rem == 0 {
			return ErrNoKnipjes
		}
		return ErrForbidden
	}
	return nil
}

// UseKnipje lets an admin/operator use one punch on any tosti card.
// Avondeten cards are excluded: debits only via RegisterAvondetenMealsForDate (kraam ochtendlijst).
func (s *Store) UseKnipje(ctx context.Context, cardID int64, actor *User) error {
	if !actor.IsAdmin && !actor.IsOperator {
		return ErrForbidden
	}
	var kind string
	err := s.pool.QueryRow(ctx, `SELECT kind::text FROM cards WHERE id = $1`, cardID).Scan(&kind)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if kind == CardKindAvondeten {
		return ErrAvondetenManualUseDisabled
	}
	return s.useKnipjeAnyCard(ctx, cardID)
}

func (s *Store) CreateCardRequest(ctx context.Context, userID int64, kind string) (int64, error) {
	kind, err := NormalizeCardKind(kind)
	if err != nil {
		return 0, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	var matroos bool
	err = tx.QueryRow(ctx, `SELECT is_matroos_jeugd FROM users WHERE id = $1`, userID).Scan(&matroos)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrNotFound
	}
	if err != nil {
		return 0, err
	}
	if kind == CardKindAvondeten && !matroos {
		return 0, ErrForbidden
	}

	var has int
	err = tx.QueryRow(ctx,
		`SELECT 1 FROM card_requests WHERE user_id = $1 AND status = 'pending' AND kind = $2::card_kind LIMIT 1`,
		userID, kind,
	).Scan(&has)
	if err == nil {
		return 0, ErrAlreadyPending
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return 0, err
	}

	var cardID int64
	if err := tx.QueryRow(ctx,
		`INSERT INTO cards (user_id, knipjes_remaining, kind) VALUES ($1, 10, $2::card_kind) RETURNING id`,
		userID, kind,
	).Scan(&cardID); err != nil {
		return 0, err
	}

	var reqID int64
	err = tx.QueryRow(ctx,
		`INSERT INTO card_requests (user_id, card_id, kind) VALUES ($1, $2, $3::card_kind) RETURNING id`,
		userID, cardID, kind,
	).Scan(&reqID)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return 0, ErrAlreadyPending
		}
		return 0, err
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return reqID, nil
}

type PendingCardRequestSummary struct {
	ID               int64
	Kind             string
	CreatedAt        time.Time
	KnipjesRemaining int
}

func (s *Store) ListPendingCardRequestsForUser(ctx context.Context, userID int64) ([]PendingCardRequestSummary, error) {
	const q = `
SELECT cr.id, cr.kind::text, cr.created_at,
  COALESCE(c.knipjes_remaining, GREATEST(0, 10 - cr.trust_knipjes_used)) AS knip_rem
FROM card_requests cr
LEFT JOIN cards c ON c.id = cr.card_id
WHERE cr.user_id = $1 AND cr.status = 'pending'
ORDER BY cr.created_at ASC`
	rows, err := s.pool.Query(ctx, q, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []PendingCardRequestSummary
	for rows.Next() {
		var r PendingCardRequestSummary
		if err := rows.Scan(&r.ID, &r.Kind, &r.CreatedAt, &r.KnipjesRemaining); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Store) CancelCardRequestForUser(ctx context.Context, requestID, userID int64) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var cardID *int64
	err = tx.QueryRow(ctx, `
SELECT card_id FROM card_requests
WHERE id = $1 AND user_id = $2 AND status = 'pending'
FOR UPDATE`,
		requestID, userID,
	).Scan(&cardID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if cardID == nil {
		return ErrNotFound
	}

	var remaining int
	err = tx.QueryRow(ctx,
		`SELECT knipjes_remaining FROM cards WHERE id = $1 FOR UPDATE`, *cardID,
	).Scan(&remaining)
	if err != nil {
		return err
	}
	if remaining < 10 {
		return ErrCannotCancelTrustUsed
	}

	if _, err := tx.Exec(ctx,
		`UPDATE card_requests SET status = 'cancelled' WHERE id = $1`,
		requestID,
	); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM cards WHERE id = $1`, *cardID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Store) CancelAllPendingCardRequestsForUser(ctx context.Context, userID int64) (int64, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	qrows, err := tx.Query(ctx, `
SELECT cr.id, cr.card_id,
  COALESCE(c.knipjes_remaining, GREATEST(0, 10 - cr.trust_knipjes_used)) AS knip_rem
FROM card_requests cr
LEFT JOIN cards c ON c.id = cr.card_id
WHERE cr.user_id = $1 AND cr.status = 'pending'
FOR UPDATE`,
		userID,
	)
	if err != nil {
		return 0, err
	}
	defer qrows.Close()
	type row struct {
		id     int64
		cardID *int64
		rem    int
	}
	var list []row
	for qrows.Next() {
		var r row
		if err := qrows.Scan(&r.id, &r.cardID, &r.rem); err != nil {
			return 0, err
		}
		list = append(list, r)
	}
	if err := qrows.Err(); err != nil {
		return 0, err
	}

	for _, r := range list {
		if r.rem < 10 {
			return 0, ErrCannotCancelTrustUsed
		}
		if r.cardID == nil {
			return 0, ErrNotFound
		}
	}

	var n int64
	for _, r := range list {
		if _, err := tx.Exec(ctx,
			`UPDATE card_requests SET status = 'cancelled' WHERE id = $1`,
			r.id,
		); err != nil {
			return 0, err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM cards WHERE id = $1`, *r.cardID); err != nil {
			return 0, err
		}
		n++
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return n, nil
}

func (s *Store) PendingCardRequestsByUser(ctx context.Context, userID int64) (int, error) {
	const q = `SELECT count(*) FROM card_requests WHERE user_id = $1 AND status = 'pending'`
	var n int
	if err := s.pool.QueryRow(ctx, q, userID).Scan(&n); err != nil {
		return 0, err
	}
	return n, nil
}

func (s *Store) ListPendingRequests(ctx context.Context) ([]CardRequestRow, error) {
	const q = `
SELECT cr.id, cr.user_id, cr.status::text, cr.kind::text, cr.created_at, cr.fulfilled_at, cr.fulfilled_by_admin_id, cr.card_id,
       u.email, u.name,
       COALESCE(c.knipjes_remaining, GREATEST(0, 10 - cr.trust_knipjes_used)) AS knip_rem
FROM card_requests cr
JOIN users u ON u.id = cr.user_id
LEFT JOIN cards c ON c.id = cr.card_id
WHERE cr.status = 'pending'
ORDER BY cr.created_at ASC`
	rows, err := s.pool.Query(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []CardRequestRow
	for rows.Next() {
		var r CardRequestRow
		if err := rows.Scan(
			&r.ID, &r.UserID, &r.Status, &r.Kind, &r.CreatedAt, &r.FulfilledAt, &r.FulfilledByAdminID, &r.CardID,
			&r.UserEmail, &r.UserName, &r.KnipjesRemaining,
		); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Store) FulfillCardRequest(ctx context.Context, requestID, adminUserID int64, salePriceEUR float64) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var reqUserID int64
	var status string
	var trustUsed int
	var existingCardID *int64
	var reqKind string
	err = tx.QueryRow(ctx,
		`SELECT user_id, status::text, trust_knipjes_used, card_id, kind::text FROM card_requests WHERE id = $1 FOR UPDATE`,
		requestID,
	).Scan(&reqUserID, &status, &trustUsed, &existingCardID, &reqKind)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if status != "pending" {
		return ErrForbidden
	}

	if existingCardID != nil {
		tag, err := tx.Exec(ctx, `
UPDATE card_requests
SET status = 'fulfilled', fulfilled_at = now(), fulfilled_by_admin_id = $2, sale_price_eur = $3
WHERE id = $1 AND status = 'pending'`,
			requestID, adminUserID, salePriceEUR,
		)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrForbidden
		}
		return tx.Commit(ctx)
	}

	knipjesOnCard := 10 - trustUsed
	var cardID int64
	err = tx.QueryRow(ctx,
		`INSERT INTO cards (user_id, knipjes_remaining, kind) VALUES ($1, $2, $3::card_kind) RETURNING id`,
		reqUserID, knipjesOnCard, reqKind,
	).Scan(&cardID)
	if err != nil {
		return err
	}

	tag, err := tx.Exec(ctx, `
UPDATE card_requests
SET status = 'fulfilled', fulfilled_at = now(), fulfilled_by_admin_id = $2, card_id = $3, sale_price_eur = $4
WHERE id = $1 AND status = 'pending'`,
		requestID, adminUserID, cardID, salePriceEUR,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrForbidden
	}
	return tx.Commit(ctx)
}

// AdminRejectCardRequest sets the request to cancelled and removes the provisional card when no knipjes
// have been used (same rule as member self-cancel). If punches were used, the request must be fulfilled instead.
func (s *Store) AdminRejectCardRequest(ctx context.Context, requestID int64) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var cardID *int64
	err = tx.QueryRow(ctx, `
SELECT card_id FROM card_requests
WHERE id = $1 AND status = 'pending'
FOR UPDATE`,
		requestID,
	).Scan(&cardID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}

	if cardID != nil {
		var remaining int
		err = tx.QueryRow(ctx,
			`SELECT knipjes_remaining FROM cards WHERE id = $1 FOR UPDATE`, *cardID,
		).Scan(&remaining)
		if err != nil {
			return err
		}
		if remaining < 10 {
			return ErrCannotRejectKnipjesUsed
		}
	} else {
		var trustUsed int
		err = tx.QueryRow(ctx,
			`SELECT trust_knipjes_used FROM card_requests WHERE id = $1`, requestID,
		).Scan(&trustUsed)
		if err != nil {
			return err
		}
		if trustUsed > 0 {
			return ErrCannotRejectKnipjesUsed
		}
	}

	if _, err := tx.Exec(ctx,
		`UPDATE card_requests SET status = 'cancelled' WHERE id = $1`,
		requestID,
	); err != nil {
		return err
	}
	if cardID != nil {
		if _, err := tx.Exec(ctx, `DELETE FROM cards WHERE id = $1`, *cardID); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

type AdminDashboardStats struct {
	ActiveCardsTotal          int64
	KnipjesRemainingTotal     int64
	PendingRequests           int64
	PendingWithCard           int64
	PendingKnipjesRemaining   int64
	PendingKnipjesConsumedEst int64
	FulfilledRequests         int64
	FulfilledKnipjesRemaining int64
	CancelledRequests         int64
	FinanceYear               int
	YearRevenueEUR            float64
	YearExpensesEUR           float64
	YearNetEUR                float64
}

func (s *Store) AdminDashboardStats(ctx context.Context) (*AdminDashboardStats, error) {
	const q = `
SELECT
  (SELECT COUNT(*)::bigint FROM cards) AS active_cards,
  (SELECT COALESCE(SUM(knipjes_remaining), 0)::bigint FROM cards) AS knipjes_rem_total,
  (SELECT COUNT(*)::bigint FROM card_requests WHERE status = 'pending') AS pending_req,
  (SELECT COUNT(*)::bigint FROM card_requests cr
     INNER JOIN cards c ON c.id = cr.card_id WHERE cr.status = 'pending') AS pending_with_card,
  (SELECT COALESCE(SUM(c.knipjes_remaining), 0)::bigint FROM card_requests cr
     INNER JOIN cards c ON c.id = cr.card_id WHERE cr.status = 'pending') AS pending_knip_rem,
  (SELECT COALESCE(SUM(LEAST(10, GREATEST(0, 10 - c.knipjes_remaining))), 0)::bigint
     FROM card_requests cr
     INNER JOIN cards c ON c.id = cr.card_id WHERE cr.status = 'pending') AS pending_knip_used_est,
  (SELECT COUNT(*)::bigint FROM card_requests WHERE status = 'fulfilled') AS fulfilled_req,
  (SELECT COALESCE(SUM(c.knipjes_remaining), 0)::bigint FROM card_requests cr
     INNER JOIN cards c ON c.id = cr.card_id WHERE cr.status = 'fulfilled') AS fulfilled_knip_rem,
  (SELECT COUNT(*)::bigint FROM card_requests WHERE status = 'cancelled') AS cancelled_req,
  (EXTRACT(YEAR FROM (now() AT TIME ZONE $1)))::int AS finance_y,
  (SELECT COALESCE(SUM(sale_price_eur), 0)::float8 FROM card_requests cr
     WHERE cr.status = 'fulfilled' AND cr.fulfilled_at IS NOT NULL
       AND (EXTRACT(YEAR FROM cr.fulfilled_at AT TIME ZONE $1))::int =
           (EXTRACT(YEAR FROM (now() AT TIME ZONE $1)))::int) AS year_rev,
  (SELECT COALESCE(SUM(se.amount_eur), 0)::float8 FROM shop_expenses se
     WHERE (EXTRACT(YEAR FROM se.spent_on))::int =
           (EXTRACT(YEAR FROM (now() AT TIME ZONE $1)))::int) AS year_exp`
	var st AdminDashboardStats
	var yearRev, yearExp float64
	err := s.pool.QueryRow(ctx, q, adminSalesTZ).Scan(
		&st.ActiveCardsTotal,
		&st.KnipjesRemainingTotal,
		&st.PendingRequests,
		&st.PendingWithCard,
		&st.PendingKnipjesRemaining,
		&st.PendingKnipjesConsumedEst,
		&st.FulfilledRequests,
		&st.FulfilledKnipjesRemaining,
		&st.CancelledRequests,
		&st.FinanceYear,
		&yearRev,
		&yearExp,
	)
	if err != nil {
		return nil, err
	}
	st.YearRevenueEUR = yearRev
	st.YearExpensesEUR = yearExp
	st.YearNetEUR = yearRev - yearExp
	return &st, nil
}

// CreateLocalUser inserts a jeugd-/lokaal account (geen Google). Email is synthetisch uniek per gebruikersnaam.
func (s *Store) CreateLocalUser(ctx context.Context, loginUsername, displayName string, passwordHash []byte, isAdmin, isOperator, mustChangePassword bool) (*User, error) {
	loginUsername = strings.TrimSpace(strings.ToLower(loginUsername))
	if loginUsername == "" {
		return nil, fmt.Errorf("gebruikersnaam vereist")
	}
	syntheticEmail := loginUsername + "@local.lunchkraam"
	row := s.pool.QueryRow(ctx, `
INSERT INTO users (login_username, password_hash, email, name, is_admin, is_operator, must_change_password)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id, google_sub, login_username, email, name, is_admin, is_operator, is_matroos_jeugd, must_change_password, created_at`,
		loginUsername, string(passwordHash), syntheticEmail, strings.TrimSpace(displayName), isAdmin, isOperator, mustChangePassword,
	)
	u, err := scanUser(row)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, ErrUsernameTaken
		}
		return nil, err
	}
	return u, nil
}

// AuthenticateLocalUser validates username/password and returns the user row (no hash).
func (s *Store) AuthenticateLocalUser(ctx context.Context, loginUsername, password string) (*User, error) {
	loginUsername = strings.TrimSpace(strings.ToLower(loginUsername))
	var hash string
	var id int64
	err := s.pool.QueryRow(ctx, `
SELECT id, password_hash FROM users WHERE lower(login_username) = $1 AND password_hash IS NOT NULL`,
		loginUsername,
	).Scan(&id, &hash)
	if errors.Is(err, pgx.ErrNoRows) {
		_ = bcrypt.CompareHashAndPassword([]byte(bcryptDummyHash), []byte(password))
		return nil, ErrInvalidCredentials
	}
	if err != nil {
		return nil, err
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)); err != nil {
		return nil, ErrInvalidCredentials
	}
	return s.UserByID(ctx, id)
}

// CardRequestKind returns the card_kind for a card_request row.
func (s *Store) CardRequestKind(ctx context.Context, requestID int64) (string, error) {
	var kind string
	err := s.pool.QueryRow(ctx, `SELECT kind::text FROM card_requests WHERE id = $1`, requestID).Scan(&kind)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", err
	}
	return kind, nil
}

// AdminSetMatroosJeugd sets the matroos-jeugd flag for any user (Google or local).
func (s *Store) AdminSetMatroosJeugd(ctx context.Context, userID int64, v bool) error {
	tag, err := s.pool.Exec(ctx, `UPDATE users SET is_matroos_jeugd = $2 WHERE id = $1`, userID, v)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) ListAdminUsers(ctx context.Context) ([]AdminUserSummary, error) {
	rows, err := s.pool.Query(ctx, `
SELECT id, google_sub, login_username, email, name, is_admin, is_operator, is_matroos_jeugd, must_change_password, created_at
FROM users ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []AdminUserSummary
	for rows.Next() {
		var r AdminUserSummary
		var gsub, lun sql.NullString
		if err := rows.Scan(&r.ID, &gsub, &lun, &r.Email, &r.Name, &r.IsAdmin, &r.IsOperator, &r.IsMatroosJeugd, &r.MustChangePassword, &r.CreatedAt); err != nil {
			return nil, err
		}
		if gsub.Valid {
			s := gsub.String
			r.GoogleSub = &s
		}
		if lun.Valid {
			s := lun.String
			r.LoginUsername = &s
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// AdminUpdateLocalUser updates flags and optionally replaces the password (local accounts only).
func (s *Store) AdminUpdateLocalUser(ctx context.Context, userID int64, newPassword *string, isAdmin, isOperator, mustChangePassword bool) error {
	var ok bool
	err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE id = $1 AND login_username IS NOT NULL)`, userID).Scan(&ok)
	if err != nil {
		return err
	}
	if !ok {
		return ErrNotFound
	}
	if newPassword != nil && strings.TrimSpace(*newPassword) != "" {
		mustChangePassword = true
		hash, err := bcrypt.GenerateFromPassword([]byte(*newPassword), bcrypt.DefaultCost)
		if err != nil {
			return err
		}
		_, err = s.pool.Exec(ctx, `
UPDATE users
SET password_hash = $2, is_admin = $3, is_operator = $4, must_change_password = $5
WHERE id = $1 AND login_username IS NOT NULL`,
			userID, string(hash), isAdmin, isOperator, mustChangePassword,
		)
		return err
	}
	_, err = s.pool.Exec(ctx, `
UPDATE users SET is_admin = $2, is_operator = $3, must_change_password = $4 WHERE id = $1 AND login_username IS NOT NULL`,
		userID, isAdmin, isOperator, mustChangePassword,
	)
	return err
}

func (s *Store) ChangeOwnLocalPassword(ctx context.Context, userID int64, currentPassword, newPassword string) error {
	var hash sql.NullString
	err := s.pool.QueryRow(ctx, `
SELECT password_hash
FROM users
WHERE id = $1 AND login_username IS NOT NULL`,
		userID,
	).Scan(&hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if !hash.Valid || strings.TrimSpace(hash.String) == "" {
		return ErrNotLocalAccount
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash.String), []byte(currentPassword)); err != nil {
		return ErrInvalidCurrentPassword
	}
	newHash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	_, err = s.pool.Exec(ctx, `
UPDATE users
SET password_hash = $2, must_change_password = FALSE
WHERE id = $1 AND login_username IS NOT NULL`,
		userID, string(newHash),
	)
	return err
}

func (s *Store) SearchCardsWithOwners(ctx context.Context, query string, limit int) ([]CardWithOwner, error) {
	if limit <= 0 || limit > 100 {
		limit = 40
	}
	q := strings.TrimSpace(query)
	if q == "" {
		return s.recentCardsWithOwners(ctx, limit)
	}
	if id, err := strconv.ParseInt(q, 10, 64); err == nil && id > 0 {
		return s.cardsWithOwnersByCardID(ctx, id)
	}
	pat := "%" + q + "%"
	rows, err := s.pool.Query(ctx, `
SELECT c.id, c.user_id, c.kind::text, c.knipjes_remaining, c.note, c.created_at, u.name, u.email
FROM cards c
JOIN users u ON u.id = c.user_id
WHERE u.name ILIKE $1 OR u.email ILIKE $1
ORDER BY c.created_at DESC
LIMIT $2`, pat, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanCardWithOwnerRows(rows)
}

func (s *Store) recentCardsWithOwners(ctx context.Context, limit int) ([]CardWithOwner, error) {
	rows, err := s.pool.Query(ctx, `
SELECT c.id, c.user_id, c.kind::text, c.knipjes_remaining, c.note, c.created_at, u.name, u.email
FROM cards c
JOIN users u ON u.id = c.user_id
ORDER BY c.created_at DESC
LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanCardWithOwnerRows(rows)
}

func (s *Store) cardsWithOwnersByCardID(ctx context.Context, cardID int64) ([]CardWithOwner, error) {
	rows, err := s.pool.Query(ctx, `
SELECT c.id, c.user_id, c.kind::text, c.knipjes_remaining, c.note, c.created_at, u.name, u.email
FROM cards c
JOIN users u ON u.id = c.user_id
WHERE c.id = $1`, cardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanCardWithOwnerRows(rows)
}

func scanCardWithOwnerRows(rows pgx.Rows) ([]CardWithOwner, error) {
	var out []CardWithOwner
	for rows.Next() {
		var r CardWithOwner
		if err := rows.Scan(&r.ID, &r.UserID, &r.Kind, &r.KnipjesRemaining, &r.Note, &r.CreatedAt, &r.OwnerName, &r.OwnerEmail); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// AdminSalesByMonth aggregates fulfilled card_requests per calendar month in Europe/Amsterdam.
// Revenue is SUM(sale_price_eur). Indexes 0–11 are January–December.
func (s *Store) AdminSalesByMonth(ctx context.Context, year int) ([12]AdminSalesMonthAgg, error) {
	var buckets [12]AdminSalesMonthAgg
	const q = `
SELECT (EXTRACT(MONTH FROM fulfilled_at AT TIME ZONE $2))::int AS m,
       COUNT(*)::bigint AS n,
       COALESCE(SUM(sale_price_eur), 0)::float8 AS rev,
       COUNT(*) FILTER (WHERE kind = 'tosti')::bigint AS n_tosti,
       COUNT(*) FILTER (WHERE kind = 'avondeten')::bigint AS n_avondeten,
       COALESCE(SUM(sale_price_eur) FILTER (WHERE kind = 'tosti'), 0)::float8 AS rev_tosti,
       COALESCE(SUM(sale_price_eur) FILTER (WHERE kind = 'avondeten'), 0)::float8 AS rev_avondeten
FROM card_requests
WHERE status = 'fulfilled'
  AND fulfilled_at IS NOT NULL
  AND (EXTRACT(YEAR FROM fulfilled_at AT TIME ZONE $2))::int = $1
GROUP BY 1
ORDER BY 1`
	rows, err := s.pool.Query(ctx, q, year, adminSalesTZ)
	if err != nil {
		return buckets, fmt.Errorf("admin sales by month: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var m int
		var n int64
		var rev float64
		var nTosti int64
		var nAvondeten int64
		var revTosti float64
		var revAvondeten float64
		if err := rows.Scan(&m, &n, &rev, &nTosti, &nAvondeten, &revTosti, &revAvondeten); err != nil {
			return buckets, err
		}
		idx := m - 1
		if idx >= 0 && idx < len(buckets) {
			buckets[idx].FulfilledCount = n
			buckets[idx].RevenueEUR = rev
			buckets[idx].FulfilledCountTosti = nTosti
			buckets[idx].FulfilledCountAvondeten = nAvondeten
			buckets[idx].RevenueEURTosti = revTosti
			buckets[idx].RevenueEURAvondeten = revAvondeten
		}
	}
	return buckets, rows.Err()
}

// AdminFulfilledYears returns calendar years (Europe/Amsterdam) that have at least one fulfilled sale, newest first.
func (s *Store) AdminFulfilledYears(ctx context.Context) ([]int, error) {
	const q = `
SELECT DISTINCT (EXTRACT(YEAR FROM fulfilled_at AT TIME ZONE $1))::int AS y
FROM card_requests
WHERE status = 'fulfilled' AND fulfilled_at IS NOT NULL
ORDER BY y DESC`
	rows, err := s.pool.Query(ctx, q, adminSalesTZ)
	if err != nil {
		return nil, fmt.Errorf("admin fulfilled years: %w", err)
	}
	defer rows.Close()
	var out []int
	for rows.Next() {
		var y int
		if err := rows.Scan(&y); err != nil {
			return nil, err
		}
		out = append(out, y)
	}
	return out, rows.Err()
}

package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"golang.org/x/crypto/bcrypt"
)

// userSelectColumns is the column list that scanUser expects, in order.
const userSelectColumns = "id, google_sub, login_username, email, name, is_admin, is_operator, is_matroos_jeugd, must_change_password, disabled_at, created_at"

func scanUser(scanner interface{ Scan(dest ...any) error }) (*User, error) {
	var u User
	var gsub, lun sql.NullString
	var disabledAt sql.NullTime
	err := scanner.Scan(&u.ID, &gsub, &lun, &u.Email, &u.Name, &u.IsAdmin, &u.IsOperator, &u.IsMatroosJeugd, &u.MustChangePassword, &disabledAt, &u.CreatedAt)
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
	if disabledAt.Valid {
		t := disabledAt.Time
		u.DisabledAt = &t
	}
	return &u, nil
}

// UpsertUser updates or creates the Google-linked user. A deactivated account returns ErrUserDisabled
// and is not updated.
func (s *Store) UpsertUser(ctx context.Context, googleSub, email, name string, bootstrapAdmin bool) (*User, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	row := tx.QueryRow(ctx, `
UPDATE users SET email = $1, name = $2, is_admin = users.is_admin OR $3
WHERE google_sub = $4
RETURNING `+userSelectColumns,
		email, name, bootstrapAdmin, googleSub,
	)
	u, err := scanUser(row)
	if err == nil {
		if u.IsDisabled() {
			return nil, ErrUserDisabled
		}
		return u, tx.Commit(ctx)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("upsert user update: %w", err)
	}

	row = tx.QueryRow(ctx, `
INSERT INTO users (google_sub, email, name, is_admin)
VALUES ($1, $2, $3, $4)
RETURNING `+userSelectColumns,
		googleSub, email, name, bootstrapAdmin,
	)
	u, err = scanUser(row)
	if err != nil {
		return nil, fmt.Errorf("upsert user insert: %w", err)
	}
	return u, tx.Commit(ctx)
}

func (s *Store) UserByID(ctx context.Context, id int64) (*User, error) {
	row := s.pool.QueryRow(ctx, `SELECT `+userSelectColumns+` FROM users WHERE id = $1`, id)
	u, err := scanUser(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return u, nil
}

// CreateLocalUser inserts a lokaal account (geen Google). Email is synthetisch uniek per gebruikersnaam.
func (s *Store) CreateLocalUser(ctx context.Context, loginUsername, displayName string, passwordHash []byte, isAdmin, isOperator, mustChangePassword bool) (*User, error) {
	loginUsername = strings.TrimSpace(strings.ToLower(loginUsername))
	if loginUsername == "" {
		return nil, fmt.Errorf("gebruikersnaam vereist")
	}
	syntheticEmail := loginUsername + "@local.lunchkraam"
	row := s.pool.QueryRow(ctx, `
INSERT INTO users (login_username, password_hash, email, name, is_admin, is_operator, must_change_password)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING `+userSelectColumns,
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
// A deactivated account returns ErrUserDisabled after a successful password check.
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
	u, err := s.UserByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if u.IsDisabled() {
		return nil, ErrUserDisabled
	}
	return u, nil
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

// AdminSetUserRoles sets admin/operator rights for any user (Google or local). Admins cannot change themselves.
func (s *Store) AdminSetUserRoles(ctx context.Context, userID, actorUserID int64, isAdmin, isOperator bool) error {
	if userID == actorUserID {
		return ErrCannotChangeSelf
	}
	tag, err := s.pool.Exec(ctx, `UPDATE users SET is_admin = $2, is_operator = $3 WHERE id = $1`, userID, isAdmin, isOperator)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// AdminSetUserDisabled (de)activates an account. Admins cannot deactivate themselves.
func (s *Store) AdminSetUserDisabled(ctx context.Context, userID, actorUserID int64, disabled bool) error {
	if userID == actorUserID {
		return ErrCannotChangeSelf
	}
	var tag pgconn.CommandTag
	var err error
	if disabled {
		tag, err = s.pool.Exec(ctx, `UPDATE users SET disabled_at = COALESCE(disabled_at, now()) WHERE id = $1`, userID)
	} else {
		tag, err = s.pool.Exec(ctx, `UPDATE users SET disabled_at = NULL WHERE id = $1`, userID)
	}
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ListAdminUsers lists all accounts (active first) with card and payment summaries.
func (s *Store) ListAdminUsers(ctx context.Context) ([]AdminUserSummary, error) {
	rows, err := s.pool.Query(ctx, `
SELECT u.id, u.google_sub, u.login_username, u.email, u.name, u.is_admin, u.is_operator, u.is_matroos_jeugd,
       u.must_change_password, u.disabled_at, u.created_at,
       (SELECT COUNT(*)::bigint FROM cards c WHERE c.user_id = u.id) AS cards_total,
       (SELECT COALESCE(SUM(c.knipjes_remaining), 0)::bigint FROM cards c WHERE c.user_id = u.id) AS knipjes_total,
       (SELECT COUNT(*)::bigint FROM card_requests cr WHERE cr.user_id = u.id AND cr.status = 'pending') AS pending_requests
FROM users u
ORDER BY (u.disabled_at IS NOT NULL) ASC, lower(u.name) ASC, u.created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []AdminUserSummary
	for rows.Next() {
		var r AdminUserSummary
		var gsub, lun sql.NullString
		var disabledAt sql.NullTime
		if err := rows.Scan(&r.ID, &gsub, &lun, &r.Email, &r.Name, &r.IsAdmin, &r.IsOperator, &r.IsMatroosJeugd,
			&r.MustChangePassword, &disabledAt, &r.CreatedAt, &r.CardsTotal, &r.KnipjesTotal, &r.PendingRequests); err != nil {
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
		if disabledAt.Valid {
			t := disabledAt.Time
			r.DisabledAt = &t
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// ListOperatorMembers lists active accounts for the kraam (fysieke kaartverkoop).
func (s *Store) ListOperatorMembers(ctx context.Context) ([]OperatorMemberSummary, error) {
	rows, err := s.pool.Query(ctx, `
SELECT id, name, email
FROM users
WHERE disabled_at IS NULL
ORDER BY lower(name) ASC, lower(email) ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []OperatorMemberSummary
	for rows.Next() {
		var r OperatorMemberSummary
		if err := rows.Scan(&r.ID, &r.Name, &r.Email); err != nil {
			return nil, err
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

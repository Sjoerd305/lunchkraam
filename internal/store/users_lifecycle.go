package store

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

var (
	ErrEmailTaken           = errors.New("dit e-mailadres is al in gebruik bij een ander account")
	ErrMergeSourceNotLocal  = errors.New("alleen een lokaal account kan worden samengevoegd")
	ErrMergeTargetNotGoogle = errors.New("het doelaccount moet een Google-account zijn")
	ErrMergeConflict        = errors.New("beide accounts hebben een open aanvraag van hetzelfde kaarttype")
	ErrUserNotDisabled      = errors.New("alleen een gedeactiveerd account kan worden verwijderd")
	ErrSystemUser           = errors.New("dit systeemaccount kan niet worden gewijzigd")
)

// Local accounts get a synthetic address; a real address on a local account means the admin
// prepared a Google link (see UpsertUser).
const localEmailSuffix = "@local.lunchkraam"

// The placeholder that keeps the history of deleted accounts (sales, deliveries, logboek) attributed
// to *something* so revenue and statistics stay intact. It cannot log in: its password hash is not a
// valid bcrypt hash, and it is permanently deactivated.
const (
	deletedMemberLoginUsername = "verwijderd-lid"
	deletedMemberName          = "Verwijderde leden"
)

// IsSystemUsername reports whether a login username belongs to the placeholder for deleted accounts.
func IsSystemUsername(loginUsername *string) bool {
	return loginUsername != nil && *loginUsername == deletedMemberLoginUsername
}

// AdminSetLocalUserGoogleEmail prepares a local account for migration to Google: the Workspace
// address is stored on the account, and the first Google login with that (verified) address links
// the Google identity to this row, keeping its id and therefore all cards, orders and history.
// An empty email restores the synthetic local address (undo).
func (s *Store) AdminSetLocalUserGoogleEmail(ctx context.Context, userID int64, email string) error {
	email = strings.ToLower(strings.TrimSpace(email))
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var loginUsername string
	err = tx.QueryRow(ctx, `SELECT login_username FROM users WHERE id = $1 AND login_username IS NOT NULL FOR UPDATE`, userID).Scan(&loginUsername)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if loginUsername == deletedMemberLoginUsername {
		return ErrSystemUser
	}
	if email == "" {
		email = loginUsername + localEmailSuffix
	} else {
		var taken bool
		if err := tx.QueryRow(ctx,
			`SELECT EXISTS (SELECT 1 FROM users WHERE lower(email) = $1 AND id <> $2)`, email, userID,
		).Scan(&taken); err != nil {
			return err
		}
		if taken {
			return ErrEmailTaken
		}
	}
	if _, err := tx.Exec(ctx, `UPDATE users SET email = $2 WHERE id = $1`, userID, email); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// linkGoogleToPreparedLocalUser turns a local account whose email was set to the Google address
// into a Google account (same id). Returns pgx.ErrNoRows when no such account exists.
func linkGoogleToPreparedLocalUser(ctx context.Context, tx pgx.Tx, googleSub, email, name string, bootstrapAdmin bool) (*User, error) {
	email = strings.TrimSpace(email)
	row := tx.QueryRow(ctx, `
UPDATE users
SET google_sub = $1, name = $2, is_admin = users.is_admin OR $3,
    login_username = NULL, password_hash = NULL, must_change_password = FALSE
WHERE google_sub IS NULL
  AND login_username IS NOT NULL
  AND login_username <> $5
  AND lower(email) = lower($4)
  AND email NOT LIKE '%' || $6
RETURNING `+userSelectColumns,
		googleSub, name, bootstrapAdmin, email, deletedMemberLoginUsername, localEmailSuffix,
	)
	return scanUser(row)
}

// AdminMergeLocalUserIntoGoogle moves everything that references the local account (cards, aanvragen,
// bestellingen, logboekregels, boekingen) to the Google account and deletes the local account. Use this
// when the member already logged in with Google before the link was prepared. The matroos-jeugd flag
// carries over; rights of the Google account stay as they are.
func (s *Store) AdminMergeLocalUserIntoGoogle(ctx context.Context, sourceID, targetID, actorUserID int64) error {
	if sourceID == targetID {
		return ErrMergeTargetNotGoogle
	}
	if sourceID == actorUserID || targetID == actorUserID {
		return ErrCannotChangeSelf
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var srcLogin *string
	var srcMatroos bool
	err = tx.QueryRow(ctx, `SELECT login_username, is_matroos_jeugd FROM users WHERE id = $1 FOR UPDATE`, sourceID).Scan(&srcLogin, &srcMatroos)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if srcLogin == nil {
		return ErrMergeSourceNotLocal
	}
	if IsSystemUsername(srcLogin) {
		return ErrSystemUser
	}
	var dstGoogle *string
	err = tx.QueryRow(ctx, `SELECT google_sub FROM users WHERE id = $1 FOR UPDATE`, targetID).Scan(&dstGoogle)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if dstGoogle == nil {
		return ErrMergeTargetNotGoogle
	}

	if err := reassignUserReferences(ctx, tx, sourceID, targetID); err != nil {
		return err
	}
	if srcMatroos {
		if _, err := tx.Exec(ctx, `UPDATE users SET is_matroos_jeugd = TRUE WHERE id = $1`, targetID); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(ctx, `DELETE FROM users WHERE id = $1`, sourceID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// AdminDeleteUser removes a deactivated account. Open aanvragen and bestellingen are cancelled (their
// inactive cards removed); everything historical (geaccordeerde verkopen, geleverde tosti's, logboek,
// boekingen) is re-attributed to the placeholder "Verwijderde leden" so omzet and statistics do not change.
func (s *Store) AdminDeleteUser(ctx context.Context, userID, actorUserID int64) error {
	if userID == actorUserID {
		return ErrCannotChangeSelf
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var login *string
	var disabled bool
	err = tx.QueryRow(ctx, `SELECT login_username, disabled_at IS NOT NULL FROM users WHERE id = $1 FOR UPDATE`, userID).Scan(&login, &disabled)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if IsSystemUsername(login) {
		return ErrSystemUser
	}
	if !disabled {
		return ErrUserNotDisabled
	}

	// Open aanvragen: cancel and drop their (never activated) cards; orders on those cards cascade away.
	rows, err := tx.Query(ctx, `
UPDATE card_requests SET status = 'cancelled'
WHERE user_id = $1 AND status = 'pending'
RETURNING card_id`, userID)
	if err != nil {
		return err
	}
	var pendingCardIDs []int64
	for rows.Next() {
		var cardID *int64
		if err := rows.Scan(&cardID); err != nil {
			rows.Close()
			return err
		}
		if cardID != nil {
			pendingCardIDs = append(pendingCardIDs, *cardID)
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	if len(pendingCardIDs) > 0 {
		if _, err := tx.Exec(ctx, `DELETE FROM cards WHERE id = ANY($1)`, pendingCardIDs); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(ctx, `
UPDATE tosti_orders SET status = 'cancelled', cancelled_at = now(), cancelled_by_user_id = $2
WHERE user_id = $1 AND status = 'pending'`, userID, actorUserID); err != nil {
		return err
	}

	placeholderID, err := ensureDeletedMemberPlaceholder(ctx, tx)
	if err != nil {
		return err
	}
	if err := reassignUserReferences(ctx, tx, userID, placeholderID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func ensureDeletedMemberPlaceholder(ctx context.Context, tx pgx.Tx) (int64, error) {
	var id int64
	err := tx.QueryRow(ctx, `SELECT id FROM users WHERE login_username = $1`, deletedMemberLoginUsername).Scan(&id)
	if err == nil {
		return id, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return 0, err
	}
	// password_hash "!" is never a valid bcrypt hash, so this row can never authenticate.
	err = tx.QueryRow(ctx, `
INSERT INTO users (login_username, password_hash, email, name, disabled_at)
VALUES ($1, '!', $1 || $2, $3, now())
RETURNING id`, deletedMemberLoginUsername, localEmailSuffix, deletedMemberName).Scan(&id)
	return id, err
}

// reassignUserReferences points every foreign key that references users(id) from fromID to toID.
// The columns are discovered from the catalog so new tables are covered automatically. A unique
// violation (both accounts hold an open aanvraag of the same kind) surfaces as ErrMergeConflict.
func reassignUserReferences(ctx context.Context, tx pgx.Tx, fromID, toID int64) error {
	rows, err := tx.Query(ctx, `
SELECT c.conrelid::regclass::text, a.attname
FROM pg_constraint c
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
WHERE c.contype = 'f' AND c.confrelid = 'users'::regclass AND array_length(c.conkey, 1) = 1
ORDER BY 1, 2`)
	if err != nil {
		return err
	}
	type ref struct{ table, column string }
	var refs []ref
	for rows.Next() {
		var r ref
		if err := rows.Scan(&r.table, &r.column); err != nil {
			rows.Close()
			return err
		}
		refs = append(refs, r)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	for _, r := range refs {
		col := pgx.Identifier{r.column}.Sanitize()
		q := fmt.Sprintf(`UPDATE %s SET %s = $1 WHERE %s = $2`, r.table, col, col)
		if _, err := tx.Exec(ctx, q, toID, fromID); err != nil {
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) && pgErr.Code == "23505" {
				return ErrMergeConflict
			}
			return fmt.Errorf("reassign %s.%s: %w", r.table, r.column, err)
		}
	}
	return nil
}

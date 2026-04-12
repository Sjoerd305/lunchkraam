package auth

import (
	"context"
	"net/http"

	"github.com/gorilla/sessions"
	"lunchkraam/internal/store"
)

type ctxKey int

const (
	ctxKeyUser ctxKey = iota
)

func UserFromContext(ctx context.Context) (*store.User, bool) {
	u, ok := ctx.Value(ctxKeyUser).(*store.User)
	return u, ok
}

// MustUserFromContext returns the authenticated user set by RequireUserAPI (or equivalent).
// It panics if the user is missing — only use on routes that always run that middleware.
func MustUserFromContext(ctx context.Context) *store.User {
	u, ok := UserFromContext(ctx)
	if !ok || u == nil {
		panic("auth: no user in context (route must use RequireUserAPI)")
	}
	return u
}

func WithUser(ctx context.Context, u *store.User) context.Context {
	return context.WithValue(ctx, ctxKeyUser, u)
}

const SessionName = "lunchkraam"
const sessionUserIDKey = "user_id"
const sessionOAuthStateKey = "oauth_state"

func SessionUserID(sess *sessions.Session) (int64, bool) {
	v, ok := sess.Values[sessionUserIDKey]
	if !ok {
		return 0, false
	}
	switch n := v.(type) {
	case int64:
		return n, true
	case int:
		return int64(n), true
	default:
		return 0, false
	}
}

func SetSessionUserID(sess *sessions.Session, id int64) {
	sess.Values[sessionUserIDKey] = id
}

func ClearSessionUser(sess *sessions.Session) {
	delete(sess.Values, sessionUserIDKey)
}

func OAuthState(sess *sessions.Session) (string, bool) {
	v, ok := sess.Values[sessionOAuthStateKey]
	if !ok {
		return "", false
	}
	s, _ := v.(string)
	return s, s != ""
}

func SetOAuthState(sess *sessions.Session, state string) {
	sess.Values[sessionOAuthStateKey] = state
}

func ClearOAuthState(sess *sessions.Session) {
	delete(sess.Values, sessionOAuthStateKey)
}

func GetSession(store *sessions.CookieStore, r *http.Request) (*sessions.Session, error) {
	return store.Get(r, SessionName)
}

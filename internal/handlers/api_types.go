package handlers

import "lunchkraam/internal/store"

type userPublicJSON struct {
	ID                 int64   `json:"id"`
	Email              string  `json:"email"`
	Name               string  `json:"name"`
	IsAdmin            bool    `json:"is_admin"`
	IsOperator         bool    `json:"is_operator"`
	IsMatroosJeugd     bool    `json:"is_matroos_jeugd"`
	MustChangePassword bool    `json:"must_change_password"`
	AuthKind           string  `json:"auth_kind"`
	LocalUsername      *string `json:"local_username,omitempty"`
}

type tikkieWarningJSON struct {
	Kind          string `json:"kind"`
	ExpiresAt     string `json:"expires_at"`
	DaysRemaining int    `json:"days_remaining"`
	Message       string `json:"message"`
}

type cardJSON struct {
	ID               int64  `json:"id"`
	Kind             string `json:"kind"`
	Source           string `json:"source"`
	KnipjesRemaining int    `json:"knipjes_remaining"`
	CreatedAt        string `json:"created_at"`
}

type adminRequestJSON struct {
	ID               int64  `json:"id"`
	Kind             string `json:"kind"`
	PaymentMethod    string `json:"payment_method"`
	UserName         string `json:"user_name"`
	UserEmail        string `json:"user_email"`
	CreatedAt        string `json:"created_at"`
	KnipjesRemaining int    `json:"knipjes_remaining"`
}

type myPendingRequestJSON struct {
	ID               int64  `json:"id"`
	Kind             string `json:"kind"`
	CreatedAt        string `json:"created_at"`
	KnipjesRemaining int    `json:"knipjes_remaining"`
}

func toUserPublic(u *store.User) userPublicJSON {
	j := userPublicJSON{
		ID: u.ID, Email: u.Email, Name: u.Name, IsAdmin: u.IsAdmin, IsOperator: u.IsOperator,
		IsMatroosJeugd:     u.IsMatroosJeugd,
		MustChangePassword: u.MustChangePassword,
	}
	if u.LoginUsername != nil && *u.LoginUsername != "" {
		j.AuthKind = "local"
		s := *u.LoginUsername
		j.LocalUsername = &s
	} else {
		j.AuthKind = "google"
	}
	return j
}

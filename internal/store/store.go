package store

import "github.com/jackc/pgx/v5/pgxpool"

const adminSalesTZ = "Europe/Amsterdam"

// bcrypt hash of "password" — used for constant-time path when user is unknown.
const bcryptDummyHash = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"

type Store struct {
	pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

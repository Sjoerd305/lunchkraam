package store_test

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"lunchkraam/internal/db"
	"lunchkraam/internal/store"
)

// integrationStore connects to TEST_DATABASE_URL, runs the migrations and returns a Store.
// Skips when the variable is not set (same convention as pending_import_reviews_merge_test.go).
func integrationStore(t *testing.T) (*store.Store, *pgxpool.Pool) {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL to run this integration check")
	}
	ctx := context.Background()
	var pool *pgxpool.Pool
	var err error
	deadline := time.Now().Add(30 * time.Second)
	for {
		pool, err = db.Connect(ctx, dsn)
		if err == nil {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("connect: %v", err)
		}
		time.Sleep(500 * time.Millisecond)
	}
	t.Cleanup(pool.Close)
	if err := db.Migrate(ctx, pool, "../../migrations"); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return store.New(pool), pool
}

func insertGoogleUser(t *testing.T, pool *pgxpool.Pool, sub, email, name string, operator, admin, matroos bool) int64 {
	t.Helper()
	var id int64
	err := pool.QueryRow(context.Background(), `
INSERT INTO users (google_sub, email, name, is_operator, is_admin, is_matroos_jeugd)
VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, sub, email, name, operator, admin, matroos).Scan(&id)
	if err != nil {
		t.Fatalf("insert user: %v", err)
	}
	return id
}

func uniq(prefix string) string {
	return prefix + "-" + time.Now().Format("150405.000000")
}

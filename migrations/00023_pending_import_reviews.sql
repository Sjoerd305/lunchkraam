-- +goose Up
CREATE TABLE pending_import_reviews (
    id                 BIGSERIAL PRIMARY KEY,
    amount_eur         NUMERIC(12, 2) NOT NULL CHECK (amount_eur > 0),
    spent_on           DATE NOT NULL,
    description        TEXT NOT NULL DEFAULT '',
    purpose            TEXT NOT NULL CHECK (purpose IN ('lunchkraam', 'avondeten')),
    source             TEXT NOT NULL DEFAULT 'revolut',
    external_id        TEXT NOT NULL,
    matched_expense_id BIGINT NOT NULL REFERENCES shop_expenses (id) ON DELETE CASCADE,
    created_by         BIGINT REFERENCES users (id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (source, external_id)
);

-- +goose Down
DROP TABLE IF EXISTS pending_import_reviews;

-- +goose Up
CREATE TABLE shop_expense_receipts (
    id BIGSERIAL PRIMARY KEY,
    shop_expense_id BIGINT NOT NULL REFERENCES shop_expenses (id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
    sha256 TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (shop_expense_id)
);

CREATE INDEX shop_expense_receipts_created_at_idx ON shop_expense_receipts (created_at);

-- +goose Down
DROP TABLE IF EXISTS shop_expense_receipts;

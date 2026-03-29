-- +goose Up
CREATE TABLE shop_expenses (
    id BIGSERIAL PRIMARY KEY,
    amount_eur NUMERIC(12, 2) NOT NULL CHECK (amount_eur > 0),
    spent_on DATE NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_by BIGINT REFERENCES users (id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX shop_expenses_spent_on_idx ON shop_expenses (spent_on);

-- +goose Down
DROP TABLE IF EXISTS shop_expenses;

-- +goose Up
-- Cached Revolut EUR balance from the "Saldo" column of the last successful CSV import (not live API).
CREATE TABLE revolut_balance_snapshot (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  balance_eur NUMERIC(14, 2) NOT NULL,
  statement_as_of TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE IF EXISTS revolut_balance_snapshot;

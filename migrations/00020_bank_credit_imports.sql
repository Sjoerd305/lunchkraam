-- +goose Up
CREATE TABLE bank_credit_imports (
    id BIGSERIAL PRIMARY KEY,
    amount_eur NUMERIC(12, 2) NOT NULL CHECK (amount_eur > 0),
    received_on DATE NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    purpose TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'revolut',
    external_id TEXT,
    created_by BIGINT REFERENCES users (id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT bank_credit_imports_purpose_check CHECK (purpose IN ('lunchkraam', 'avondeten')),
    CONSTRAINT bank_credit_imports_source_check CHECK (source IN ('revolut'))
);

CREATE INDEX bank_credit_imports_received_on_idx ON bank_credit_imports (received_on);

CREATE UNIQUE INDEX bank_credit_imports_source_external_id_idx ON bank_credit_imports (source, external_id);

-- +goose Down
DROP INDEX IF EXISTS bank_credit_imports_source_external_id_idx;
DROP INDEX IF EXISTS bank_credit_imports_received_on_idx;
DROP TABLE IF EXISTS bank_credit_imports;

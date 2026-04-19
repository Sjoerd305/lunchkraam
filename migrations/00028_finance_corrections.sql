-- +goose Up
CREATE TABLE finance_corrections (
    id BIGSERIAL PRIMARY KEY,
    recorded_on DATE NOT NULL,
    purpose TEXT NOT NULL,
    kind TEXT NOT NULL,
    amount_eur NUMERIC(12, 2) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_by BIGINT REFERENCES users (id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT finance_corrections_purpose_check CHECK (purpose IN ('lunchkraam', 'avondeten')),
    CONSTRAINT finance_corrections_kind_check CHECK (kind IN (
        'refund_outside_app',
        'other_branch_guest',
        'internal_settlement',
        'other'
    )),
    CONSTRAINT finance_corrections_amount_nonzero CHECK (amount_eur <> 0)
);

CREATE INDEX finance_corrections_recorded_on_idx ON finance_corrections (recorded_on);

-- +goose Down
DROP INDEX IF EXISTS finance_corrections_recorded_on_idx;
DROP TABLE IF EXISTS finance_corrections;

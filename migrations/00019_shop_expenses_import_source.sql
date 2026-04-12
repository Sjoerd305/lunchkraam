-- +goose Up
ALTER TABLE shop_expenses
    ADD COLUMN source TEXT NOT NULL DEFAULT 'manual',
    ADD COLUMN external_id TEXT;

ALTER TABLE shop_expenses
    ADD CONSTRAINT shop_expenses_source_check CHECK (source IN ('manual', 'revolut'));

-- Multiple manual rows share (source, external_id) = ('manual', NULL); PostgreSQL treats NULLs as distinct in UNIQUE.
CREATE UNIQUE INDEX shop_expenses_source_external_id_idx ON shop_expenses (source, external_id);

-- +goose Down
DROP INDEX IF EXISTS shop_expenses_source_external_id_idx;
ALTER TABLE shop_expenses DROP CONSTRAINT IF EXISTS shop_expenses_source_check;
ALTER TABLE shop_expenses DROP COLUMN IF EXISTS external_id;
ALTER TABLE shop_expenses DROP COLUMN IF EXISTS source;

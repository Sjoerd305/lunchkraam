-- +goose Up
ALTER TABLE shop_expenses
    ADD COLUMN purpose TEXT NOT NULL DEFAULT 'lunchkraam',
    ADD CONSTRAINT shop_expenses_purpose_check CHECK (purpose IN ('lunchkraam', 'avondeten'));

-- +goose Down
ALTER TABLE shop_expenses DROP CONSTRAINT IF EXISTS shop_expenses_purpose_check;
ALTER TABLE shop_expenses DROP COLUMN IF EXISTS purpose;

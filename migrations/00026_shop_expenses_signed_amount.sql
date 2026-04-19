-- +goose Up
-- Allow negative amounts for manual "contant bij de kas" (cash-in) rows; Revolut imports stay positive in application code.
ALTER TABLE shop_expenses DROP CONSTRAINT IF EXISTS shop_expenses_amount_eur_check;
ALTER TABLE shop_expenses ADD CONSTRAINT shop_expenses_amount_eur_check CHECK (amount_eur <> 0);

-- +goose Down
-- Fails if any row has amount_eur < 0 (remove or flip those rows first).
ALTER TABLE shop_expenses DROP CONSTRAINT IF EXISTS shop_expenses_amount_eur_check;
ALTER TABLE shop_expenses ADD CONSTRAINT shop_expenses_amount_eur_check CHECK (amount_eur > 0);

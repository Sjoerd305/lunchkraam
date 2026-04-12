-- +goose Up
ALTER TABLE shop_expense_receipts DROP CONSTRAINT shop_expense_receipts_shop_expense_id_key;

CREATE INDEX shop_expense_receipts_shop_expense_id_idx ON shop_expense_receipts (shop_expense_id);

-- +goose Down
DROP INDEX IF EXISTS shop_expense_receipts_shop_expense_id_idx;

-- Fails if more than one row exists per shop_expense_id (after multi-receipt use).
ALTER TABLE shop_expense_receipts ADD CONSTRAINT shop_expense_receipts_shop_expense_id_key UNIQUE (shop_expense_id);

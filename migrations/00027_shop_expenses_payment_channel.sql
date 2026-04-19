-- +goose Up
-- Classify manual vs Revolut vs kas-bij: contant / digitaal / kas_bij (must match amount sign).
ALTER TABLE shop_expenses
    ADD COLUMN payment_channel TEXT NOT NULL DEFAULT 'contant';

UPDATE shop_expenses SET payment_channel = 'kas_bij' WHERE amount_eur < 0;
UPDATE shop_expenses SET payment_channel = 'digitaal' WHERE amount_eur > 0 AND source = 'revolut';

ALTER TABLE shop_expenses ADD CONSTRAINT shop_expenses_payment_channel_values CHECK (
    payment_channel IN ('contant', 'digitaal', 'kas_bij')
);

ALTER TABLE shop_expenses ADD CONSTRAINT shop_expenses_payment_channel_sign CHECK (
    (amount_eur > 0 AND payment_channel IN ('contant', 'digitaal'))
    OR (amount_eur < 0 AND payment_channel = 'kas_bij')
);

-- +goose Down
ALTER TABLE shop_expenses DROP CONSTRAINT IF EXISTS shop_expenses_payment_channel_sign;
ALTER TABLE shop_expenses DROP CONSTRAINT IF EXISTS shop_expenses_payment_channel_values;
ALTER TABLE shop_expenses DROP COLUMN IF EXISTS payment_channel;

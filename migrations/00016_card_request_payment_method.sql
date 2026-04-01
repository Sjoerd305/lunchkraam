-- +goose Up
CREATE TYPE payment_method AS ENUM ('tikkie', 'contant');

ALTER TABLE card_requests
    ADD COLUMN payment_method payment_method NOT NULL DEFAULT 'tikkie';

-- +goose Down
ALTER TABLE card_requests DROP COLUMN IF EXISTS payment_method;
DROP TYPE IF EXISTS payment_method;

-- +goose Up
CREATE TYPE card_source AS ENUM ('online', 'physical');

ALTER TABLE cards
    ADD COLUMN source card_source NOT NULL DEFAULT 'online';

-- Backfill cards created via direct physical-sale path.
UPDATE cards c
SET source = 'physical'
FROM card_requests cr
WHERE cr.card_id = c.id
  AND cr.status = 'fulfilled'
  AND cr.fulfilled_at IS NOT NULL
  AND cr.created_at = cr.fulfilled_at;

-- +goose Down
ALTER TABLE cards DROP COLUMN IF EXISTS source;
DROP TYPE IF EXISTS card_source;

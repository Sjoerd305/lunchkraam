-- +goose Up
ALTER TABLE card_requests
ADD COLUMN trust_knipjes_used INT NOT NULL DEFAULT 0
CHECK (trust_knipjes_used >= 0 AND trust_knipjes_used <= 10);

-- +goose Down
ALTER TABLE card_requests DROP COLUMN IF EXISTS trust_knipjes_used;

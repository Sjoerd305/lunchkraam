-- +goose Up
CREATE TYPE card_kind AS ENUM ('tosti', 'avondeten');

ALTER TABLE users
    ADD COLUMN is_matroos_jeugd BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE cards
    ADD COLUMN kind card_kind NOT NULL DEFAULT 'tosti';

ALTER TABLE card_requests
    ADD COLUMN kind card_kind NOT NULL DEFAULT 'tosti';

CREATE UNIQUE INDEX card_requests_one_pending_per_user_kind
    ON card_requests (user_id, kind)
    WHERE status = 'pending';

-- +goose Down
DROP INDEX IF EXISTS card_requests_one_pending_per_user_kind;

ALTER TABLE card_requests DROP COLUMN IF EXISTS kind;
ALTER TABLE cards DROP COLUMN IF EXISTS kind;
ALTER TABLE users DROP COLUMN IF EXISTS is_matroos_jeugd;

DROP TYPE IF EXISTS card_kind;

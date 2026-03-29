-- +goose Up
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    google_sub TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cards (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    knipjes_remaining INT NOT NULL DEFAULT 10 CHECK (knipjes_remaining >= 0 AND knipjes_remaining <= 10),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX cards_user_id_idx ON cards (user_id);

CREATE TYPE card_request_status AS ENUM ('pending', 'fulfilled', 'cancelled');

CREATE TABLE card_requests (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    status card_request_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    fulfilled_at TIMESTAMPTZ,
    fulfilled_by_admin_id BIGINT REFERENCES users (id) ON DELETE SET NULL,
    card_id BIGINT REFERENCES cards (id) ON DELETE SET NULL
);

CREATE INDEX card_requests_user_id_idx ON card_requests (user_id);
CREATE INDEX card_requests_status_idx ON card_requests (status);

-- +goose Down
DROP TABLE IF EXISTS card_requests;
DROP TYPE IF EXISTS card_request_status;
DROP TABLE IF EXISTS cards;
DROP TABLE IF EXISTS users;

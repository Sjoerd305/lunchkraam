-- +goose Up
CREATE TYPE tosti_bread AS ENUM ('wit', 'bruin');
CREATE TYPE tosti_filling AS ENUM ('ham', 'kaas', 'ham_kaas');
CREATE TYPE tosti_order_status AS ENUM ('pending', 'delivered', 'cancelled');

CREATE TABLE tosti_orders (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    card_id BIGINT NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
    bread tosti_bread NOT NULL,
    filling tosti_filling NOT NULL,
    status tosti_order_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at TIMESTAMPTZ,
    delivered_by_user_id BIGINT REFERENCES users (id) ON DELETE SET NULL,
    cancelled_at TIMESTAMPTZ,
    cancelled_by_user_id BIGINT REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX tosti_orders_status_idx ON tosti_orders (status);
CREATE INDEX tosti_orders_user_status_idx ON tosti_orders (user_id, status);
CREATE INDEX tosti_orders_created_at_idx ON tosti_orders (created_at DESC);

-- +goose Down
DROP TABLE IF EXISTS tosti_orders;
DROP TYPE IF EXISTS tosti_order_status;
DROP TYPE IF EXISTS tosti_filling;
DROP TYPE IF EXISTS tosti_bread;

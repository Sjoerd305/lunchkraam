-- +goose Up
ALTER TABLE tosti_orders
  ADD COLUMN quantity INT NOT NULL DEFAULT 1
    CHECK (quantity >= 1 AND quantity <= 10);

-- +goose Down
ALTER TABLE tosti_orders DROP COLUMN IF EXISTS quantity;

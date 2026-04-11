-- +goose Up
ALTER TABLE tosti_orders ADD COLUMN remark TEXT;

-- +goose Down
ALTER TABLE tosti_orders DROP COLUMN IF EXISTS remark;

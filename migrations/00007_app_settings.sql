-- +goose Up
CREATE TABLE app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
);

-- +goose Down
DROP TABLE IF EXISTS app_settings;

-- +goose Up
ALTER TABLE users
  ADD COLUMN login_username TEXT,
  ADD COLUMN password_hash TEXT,
  ADD COLUMN is_operator BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE users ALTER COLUMN google_sub DROP NOT NULL;

ALTER TABLE users DROP CONSTRAINT users_google_sub_key;

CREATE UNIQUE INDEX users_google_sub_unique ON users (google_sub) WHERE google_sub IS NOT NULL;
CREATE UNIQUE INDEX users_login_username_unique ON users (lower(login_username)) WHERE login_username IS NOT NULL;

ALTER TABLE users ADD CONSTRAINT users_auth_kind_check CHECK (
  (google_sub IS NOT NULL AND login_username IS NULL AND password_hash IS NULL)
  OR
  (google_sub IS NULL AND login_username IS NOT NULL AND password_hash IS NOT NULL)
);

-- +goose Down
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_auth_kind_check;
DROP INDEX IF EXISTS users_login_username_unique;
DROP INDEX IF EXISTS users_google_sub_unique;

DELETE FROM users WHERE google_sub IS NULL;

ALTER TABLE users ALTER COLUMN google_sub SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_google_sub_key UNIQUE (google_sub);

ALTER TABLE users DROP COLUMN IF EXISTS is_operator;
ALTER TABLE users DROP COLUMN IF EXISTS password_hash;
ALTER TABLE users DROP COLUMN IF EXISTS login_username;

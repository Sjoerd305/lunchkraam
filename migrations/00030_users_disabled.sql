-- +goose Up
-- Gedeactiveerde accounts kunnen niet meer inloggen en verschijnen niet in de ledenkeuze aan de kraam.
ALTER TABLE users
    ADD COLUMN disabled_at TIMESTAMPTZ;

-- +goose Down
ALTER TABLE users
    DROP COLUMN IF EXISTS disabled_at;

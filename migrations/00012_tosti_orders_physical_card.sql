-- +goose Up
-- Fysieke tostikaart: bestelling zonder digitale kaart (card_id NULL); bij leveren geen knipjes in de app.
ALTER TABLE tosti_orders
    ALTER COLUMN card_id DROP NOT NULL;

-- +goose Down
DELETE FROM tosti_orders WHERE card_id IS NULL;
ALTER TABLE tosti_orders
    ALTER COLUMN card_id SET NOT NULL;

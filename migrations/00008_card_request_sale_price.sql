-- +goose Up
-- Prijs per geaccordeerde verkoop (vastgelegd bij accordering); historische omzet blijft correct bij tariefwijziging.
ALTER TABLE card_requests
    ADD COLUMN sale_price_eur NUMERIC(12, 2);

-- Bestaande geaccordeerde verkopen: default 15 EUR (default PAYMENT_AMOUNT_EUR). Pas handmatig aan als dat bij jullie historisch anders was.
UPDATE card_requests
SET sale_price_eur = 15
WHERE status = 'fulfilled'
  AND sale_price_eur IS NULL;

-- +goose Down
ALTER TABLE card_requests DROP COLUMN IF EXISTS sale_price_eur;

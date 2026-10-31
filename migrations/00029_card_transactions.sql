-- +goose Up
-- Knipje-logboek: elke saldowijziging op een kaart wordt vastgelegd, zodat historie zichtbaar is en
-- een boeking kan worden teruggedraaid.
CREATE TYPE card_transaction_reason AS ENUM (
    'issued',           -- kaart uitgegeven (startsaldo)
    'tosti_delivered',  -- tosti geleverd aan de kraam
    'avondeten_meal',   -- avondeten afgeboekt voor een datum
    'manual_knipje',    -- handmatig knipje door kraam/admin
    'estimate_adjust',  -- schatting fysieke kaart handmatig gezet
    'undo',             -- terugdraaien van een eerdere boeking
    'backfill'          -- verschil vóór invoering van het logboek
);

CREATE TABLE card_transactions (
    id BIGSERIAL PRIMARY KEY,
    card_id BIGINT NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
    delta INT NOT NULL,
    balance_after INT,
    reason card_transaction_reason NOT NULL,
    actor_user_id BIGINT REFERENCES users (id) ON DELETE SET NULL,
    tosti_order_id BIGINT REFERENCES tosti_orders (id) ON DELETE SET NULL,
    avondeten_meal_id BIGINT REFERENCES avondeten_meals (id) ON DELETE SET NULL,
    reverses_transaction_id BIGINT REFERENCES card_transactions (id) ON DELETE SET NULL,
    reversed_by_transaction_id BIGINT REFERENCES card_transactions (id) ON DELETE SET NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX card_transactions_card_created_idx ON card_transactions (card_id, created_at DESC);
CREATE INDEX card_transactions_tosti_order_idx ON card_transactions (tosti_order_id) WHERE tosti_order_id IS NOT NULL;

-- Backfill: startsaldo per bestaande kaart.
INSERT INTO card_transactions (card_id, delta, balance_after, reason, created_at)
SELECT id, 10, 10, 'issued', created_at FROM cards;

-- Backfill: geleverde tosti's met een gekoppelde kaart.
INSERT INTO card_transactions (card_id, delta, reason, actor_user_id, tosti_order_id, created_at)
SELECT card_id, -quantity, 'tosti_delivered', delivered_by_user_id, id, COALESCE(delivered_at, created_at)
FROM tosti_orders
WHERE status = 'delivered' AND card_id IS NOT NULL;

-- Backfill: avondetenregistraties.
INSERT INTO card_transactions (card_id, delta, reason, actor_user_id, avondeten_meal_id, created_at)
SELECT card_id, -1, 'avondeten_meal', recorded_by_user_id, id, created_at
FROM avondeten_meals;

-- Backfill: sluit het logboek aan op het huidige saldo (handmatige knipjes vóór het logboek).
INSERT INTO card_transactions (card_id, delta, balance_after, reason, note, created_at)
SELECT c.id, c.knipjes_remaining - s.total, c.knipjes_remaining, 'backfill',
       'Verschil vóór invoering van het logboek', now()
FROM cards c
JOIN (SELECT card_id, SUM(delta)::int AS total FROM card_transactions GROUP BY card_id) s ON s.card_id = c.id
WHERE c.knipjes_remaining <> s.total;

-- +goose Down
DROP TABLE IF EXISTS card_transactions;
DROP TYPE IF EXISTS card_transaction_reason;

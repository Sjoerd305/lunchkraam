-- +goose Up
CREATE TABLE avondeten_meals (
    id BIGSERIAL PRIMARY KEY,
    card_id BIGINT NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
    meal_date DATE NOT NULL,
    recorded_by_user_id BIGINT REFERENCES users (id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (card_id, meal_date)
);

CREATE INDEX avondeten_meals_meal_date_idx ON avondeten_meals (meal_date);

-- +goose Down
DROP TABLE IF EXISTS avondeten_meals;

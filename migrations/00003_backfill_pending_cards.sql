-- +goose Up
-- Pending requests without a linked card get a real card row so knipjes use one code path.
-- Goose splits on semicolons unless wrapped in StatementBegin/StatementEnd.
-- +goose StatementBegin
DO $migrate$
DECLARE
  r RECORD;
  new_card_id BIGINT;
BEGIN
  FOR r IN
    SELECT id, user_id, trust_knipjes_used
    FROM card_requests
    WHERE status = 'pending' AND card_id IS NULL
  LOOP
    INSERT INTO cards (user_id, knipjes_remaining)
    VALUES (r.user_id, GREATEST(0, 10 - r.trust_knipjes_used))
    RETURNING id INTO new_card_id;

    UPDATE card_requests SET card_id = new_card_id WHERE id = r.id;
  END LOOP;
END;
$migrate$;
-- +goose StatementEnd

-- +goose Down
SELECT 1;

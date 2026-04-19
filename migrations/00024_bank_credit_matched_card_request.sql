-- +goose Up
ALTER TABLE bank_credit_imports
    ADD COLUMN matched_card_request_id BIGINT NULL REFERENCES card_requests (id) ON DELETE SET NULL;

CREATE UNIQUE INDEX bank_credit_imports_matched_card_request_id_uidx
    ON bank_credit_imports (matched_card_request_id)
    WHERE matched_card_request_id IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS bank_credit_imports_matched_card_request_id_uidx;
ALTER TABLE bank_credit_imports DROP COLUMN IF EXISTS matched_card_request_id;

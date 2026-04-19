-- +goose Up
-- open: nog in open bank-omzet; matched_sale: gekoppeld aan card_request; waived: afgehandeld zonder verkoop (uit open omzet).
ALTER TABLE bank_credit_imports
    ADD COLUMN reconciliation_status TEXT;

UPDATE bank_credit_imports SET reconciliation_status = CASE
    WHEN matched_card_request_id IS NOT NULL THEN 'matched_sale'
    ELSE 'open'
END;

ALTER TABLE bank_credit_imports
    ALTER COLUMN reconciliation_status SET NOT NULL,
    ALTER COLUMN reconciliation_status SET DEFAULT 'open';

ALTER TABLE bank_credit_imports ADD CONSTRAINT bank_credit_imports_reconciliation_status_check
    CHECK (reconciliation_status IN ('open', 'matched_sale', 'waived'));

ALTER TABLE bank_credit_imports ADD CONSTRAINT bank_credit_imports_reconciliation_invariant CHECK (
    (reconciliation_status = 'matched_sale' AND matched_card_request_id IS NOT NULL)
    OR (reconciliation_status = 'waived' AND matched_card_request_id IS NULL)
    OR (reconciliation_status = 'open' AND matched_card_request_id IS NULL)
);

-- +goose Down
ALTER TABLE bank_credit_imports DROP CONSTRAINT IF EXISTS bank_credit_imports_reconciliation_invariant;
ALTER TABLE bank_credit_imports DROP CONSTRAINT IF EXISTS bank_credit_imports_reconciliation_status_check;
ALTER TABLE bank_credit_imports DROP COLUMN IF EXISTS reconciliation_status;

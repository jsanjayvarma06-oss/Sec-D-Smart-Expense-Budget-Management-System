-- Add merchant names to expenses for automatic category suggestions.
ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS merchant VARCHAR(100);

-- Allow efficient lookups when analysing merchant spending patterns.
CREATE INDEX IF NOT EXISTS expenses_user_merchant_idx
ON expenses (user_id, lower(merchant))
WHERE merchant IS NOT NULL;
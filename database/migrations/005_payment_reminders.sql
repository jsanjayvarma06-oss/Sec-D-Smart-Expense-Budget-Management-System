-- Track payment completion for recurring expense cycles.
ALTER TABLE recurring_expenses
  ADD COLUMN IF NOT EXISTS last_paid_due_date DATE;

-- Support efficient lookup of active recurring payments.
CREATE INDEX IF NOT EXISTS recurring_active_due_idx
  ON recurring_expenses (user_id, next_due_date)
  WHERE is_active = true;
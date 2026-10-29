-- Subscription detector (story #90): a notification when a repeating payment
-- gets more expensive. The dedupe key names the merchant and the charge date,
-- so each price rise is reported once.

ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;

ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('budget_warning', 'budget_exceeded', 'payment_reminder',
                  'payment_overdue', 'goal_reached', 'unusual_spending',
                  'price_rise'));

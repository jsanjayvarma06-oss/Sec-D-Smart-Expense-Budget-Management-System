-- Preserve subscription price-rise notifications and announcements.

ALTER TABLE notifications
    DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
        'budget_warning',
        'budget_exceeded',
        'payment_reminder',
        'payment_overdue',
        'goal_reached',
        'unusual_spending',
        'price_rise',
        'announcement'
    ));
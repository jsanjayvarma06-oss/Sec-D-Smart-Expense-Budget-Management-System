
-- Add built-in categories available to every user.
-- A NULL user_id marks a category as a shared default.

INSERT INTO categories (user_id, name)
VALUES
    (NULL, 'Food'),
    (NULL, 'Transport'),
    (NULL, 'Housing'),
    (NULL, 'Utilities'),
    (NULL, 'Healthcare'),
    (NULL, 'Entertainment'),
    (NULL, 'Shopping'),
    (NULL, 'Education'),
    (NULL, 'Travel'),
    (NULL, 'Other')
ON CONFLICT DO NOTHING;

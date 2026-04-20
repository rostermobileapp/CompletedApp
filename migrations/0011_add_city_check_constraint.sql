-- Normalize any existing empty city strings to NULL before adding the constraint.
UPDATE users SET city = NULL WHERE city = '';

-- Add CHECK constraint to prevent empty city strings in the users table.
-- Any city value must either be NULL or a non-empty string.
ALTER TABLE users ADD CONSTRAINT users_city_not_empty CHECK (city IS NULL OR city <> '');

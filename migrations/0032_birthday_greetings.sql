-- Independent, per-local-birthday popup dismissal and push delivery.
CREATE TABLE IF NOT EXISTS birthday_greetings (
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  birthday_date date NOT NULL,
  popup_dismissed_at timestamptz,
  push_claimed_at timestamptz,
  push_sent_at timestamptz,
  PRIMARY KEY (user_id, birthday_date)
);
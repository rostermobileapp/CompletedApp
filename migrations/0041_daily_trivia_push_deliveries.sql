-- Once per account/Eastern date, with stable provider retry keys.
CREATE TABLE IF NOT EXISTS trivia_push_deliveries (
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trivia_date date NOT NULL,
  idempotency_key uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  lease_token uuid,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 1 CONSTRAINT trivia_push_delivery_attempts_check CHECK (attempts > 0),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, trivia_date)
);
-- League-Wide Player Pro: per-league bulk Pro purchases.
-- A commissioner pre-pays N "seats" of Player Pro for a contiguous month
-- window at a 25% bulk discount via a one-time Stripe charge. Seats are
-- assigned to current league members in join order; access is per-league only
-- (never global).

CREATE TABLE IF NOT EXISTS league_pro_grants (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id varchar NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  paid_by_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  seat_count integer NOT NULL,
  -- Month window stored as 'YYYY-MM' for unambiguous month math
  start_month varchar(7) NOT NULL,
  end_month varchar(7) NOT NULL,
  months_count integer NOT NULL,
  per_player_monthly_cents integer NOT NULL,
  individual_total_cents integer NOT NULL,
  discounted_total_cents integer NOT NULL,
  savings_cents integer NOT NULL,
  discount_percent integer NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'pending',
  stripe_checkout_session_id varchar UNIQUE,
  stripe_payment_intent_id varchar,
  paid_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_league_pro_grants_league ON league_pro_grants(league_id);
CREATE INDEX IF NOT EXISTS idx_league_pro_grants_status ON league_pro_grants(status);

CREATE TABLE IF NOT EXISTS league_pro_seats (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id varchar NOT NULL REFERENCES league_pro_grants(id) ON DELETE CASCADE,
  league_id varchar NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT league_pro_seats_grant_user_unique UNIQUE (grant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_league_pro_seats_user_league ON league_pro_seats(user_id, league_id);
CREATE INDEX IF NOT EXISTS idx_league_pro_seats_grant ON league_pro_seats(grant_id);

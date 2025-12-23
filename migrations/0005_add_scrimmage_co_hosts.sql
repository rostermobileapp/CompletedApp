-- Add scrimmage_co_hosts table for allowing multiple users to manage a scrimmage
CREATE TABLE IF NOT EXISTS "scrimmage_co_hosts" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "scrimmage_id" varchar NOT NULL REFERENCES "scrimmages"("id"),
  "user_id" varchar NOT NULL REFERENCES "users"("id"),
  "can_approve_requests" boolean NOT NULL DEFAULT true,
  "can_send_reminders" boolean NOT NULL DEFAULT true,
  "can_manage_payments" boolean NOT NULL DEFAULT true,
  "added_at" timestamp NOT NULL DEFAULT now(),
  "added_by" varchar NOT NULL REFERENCES "users"("id"),
  CONSTRAINT "unique_scrimmage_cohost" UNIQUE ("scrimmage_id", "user_id")
);

-- Add OneSignal fields to users table
ALTER TABLE "users" 
ADD COLUMN "onesignal_player_id" VARCHAR(255),
ADD COLUMN "onesignal_subscription_id" VARCHAR(255),
ADD COLUMN "onesignal_external_id_synced_at" TIMESTAMP,
ADD COLUMN "push_notifications_enabled" BOOLEAN DEFAULT false;

-- Add index for faster lookups
CREATE INDEX "idx_users_onesignal_player" ON "users"("onesignal_player_id");

-- Add comment
COMMENT ON COLUMN "users"."onesignal_player_id" IS 'OneSignal Player ID (onesignal_id from SDK)';
COMMENT ON COLUMN "users"."onesignal_subscription_id" IS 'OneSignal Push Subscription ID';
COMMENT ON COLUMN "users"."onesignal_external_id_synced_at" IS 'Timestamp when External ID was last synced';
COMMENT ON COLUMN "users"."push_notifications_enabled" IS 'Whether user has enabled push notifications';

-- OneSignal Data Cleanup Migration
-- Purpose: Clear all stale OneSignal Player IDs and External IDs from the database
-- This allows users to get fresh OneSignal Player IDs on next login
-- Run this ONCE during deployment to fix the old Player ID persistence issue

-- Clear all OneSignal Player IDs and External IDs
-- This ONLY modifies OneSignal-specific columns, preserving all other notification preferences
UPDATE notification_preferences 
SET 
  onesignal_player_id = NULL, 
  onesignal_external_id = NULL,
  updated_at = NOW()
WHERE 
  onesignal_player_id IS NOT NULL 
  OR onesignal_external_id IS NOT NULL;

-- Verification: Check how many records were affected
-- After migration, this should return 0 rows with OneSignal data
-- You can run this query manually to verify:
-- SELECT COUNT(*) as remaining_onesignal_records
-- FROM notification_preferences
-- WHERE onesignal_player_id IS NOT NULL OR onesignal_external_id IS NOT NULL;

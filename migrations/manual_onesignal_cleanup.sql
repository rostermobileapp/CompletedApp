-- ====================================================================
-- MANUAL OneSignal Data Cleanup Script
-- ====================================================================
-- Purpose: Clear stale OneSignal data for testing or emergency cleanup
-- This script can be run manually via your database client
-- ====================================================================

-- OPTION 1: Clear ALL OneSignal data (fresh start for all users)
-- --------------------------------------------------------------------
-- Uncomment the following block to clear all OneSignal data:

/*
UPDATE notification_preferences 
SET 
  onesignal_player_id = NULL, 
  onesignal_external_id = NULL,
  updated_at = NOW()
WHERE 
  onesignal_player_id IS NOT NULL 
  OR onesignal_external_id IS NOT NULL;
*/

-- OPTION 2: Clear OneSignal data for a SPECIFIC user (for testing)
-- --------------------------------------------------------------------
-- Replace 'USER_UUID_HERE' with the actual user UUID from the users table
-- Uncomment the following block to clear data for a specific user:

/*
UPDATE notification_preferences 
SET 
  onesignal_player_id = NULL, 
  onesignal_external_id = NULL,
  updated_at = NOW()
WHERE 
  user_id = 'USER_UUID_HERE';
*/

-- OPTION 3: View current OneSignal data before cleanup
-- --------------------------------------------------------------------
-- Run this to see which users have OneSignal data stored:

SELECT 
  np.user_id,
  u.display_id,
  np.onesignal_player_id,
  np.onesignal_external_id,
  np.push_enabled,
  np.updated_at
FROM notification_preferences np
LEFT JOIN users u ON u.id = np.user_id
WHERE np.onesignal_player_id IS NOT NULL 
   OR np.onesignal_external_id IS NOT NULL
ORDER BY np.updated_at DESC;

-- VERIFICATION: Check if cleanup was successful
-- --------------------------------------------------------------------
-- This should return 0 rows after running OPTION 1 or show only
-- remaining users if you used OPTION 2:

/*
SELECT COUNT(*) as remaining_onesignal_records
FROM notification_preferences
WHERE onesignal_player_id IS NOT NULL 
   OR onesignal_external_id IS NOT NULL;
*/

-- ====================================================================
-- IMPORTANT NOTES:
-- ====================================================================
-- 1. This script ONLY modifies OneSignal columns (onesignal_player_id, onesignal_external_id)
-- 2. It does NOT modify:
--    - User authentication data
--    - Notification settings preferences (notification_settings JSON)
--    - Push enabled status (push_enabled boolean)
--    - Any other columns in the notification_preferences table
--    - Any other tables in the database
-- 3. After cleanup, users will get fresh OneSignal Player IDs on next login
-- 4. This is safe to run multiple times (idempotent operation)
-- ====================================================================

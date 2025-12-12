-- Check OneSignal integration status for all users
SELECT 
  id,
  display_id,
  email,
  onesignal_player_id,
  onesignal_external_id_synced_at,
  push_notifications_enabled,
  CASE 
    WHEN onesignal_player_id IS NOT NULL THEN '✅ Linked'
    ELSE '❌ Not linked'
  END as status
FROM users
WHERE display_id IS NOT NULL
ORDER BY onesignal_external_id_synced_at DESC NULLS LAST
LIMIT 10;

-- Add photo_tag notification type to the enum
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'photo_tag';

-- Backfill existing notification_preferences rows to include photoTagNotifications: true
-- Uses jsonb_set with create_if_missing=true so it only adds the key if absent
UPDATE notification_preferences
SET notification_settings = notification_settings || '{"photoTagNotifications": true}'::jsonb
WHERE NOT (notification_settings ? 'photoTagNotifications');

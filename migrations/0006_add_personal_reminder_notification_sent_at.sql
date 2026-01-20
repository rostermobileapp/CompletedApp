-- Add notification_sent_at column to personal_reminders table
-- This tracks when push notifications were sent for personal reminders

ALTER TABLE personal_reminders ADD COLUMN IF NOT EXISTS notification_sent_at TIMESTAMP;

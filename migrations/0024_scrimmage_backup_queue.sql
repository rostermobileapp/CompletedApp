-- Migration: scrimmage backup queue
-- Adds 'backup' to scrimmage_request_status enum,
-- 'scrimmage_backup' to notification_type enum,
-- and two queue-tracking columns on scrimmage_requests.
-- Safe to run on a database that already has these values/columns (idempotent guards).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'backup'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'scrimmage_request_status')
  ) THEN
    ALTER TYPE scrimmage_request_status ADD VALUE 'backup';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'scrimmage_backup'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type')
  ) THEN
    ALTER TYPE notification_type ADD VALUE 'scrimmage_backup';
  END IF;
END;
$$;

ALTER TABLE scrimmage_requests
  ADD COLUMN IF NOT EXISTS backup_position integer,
  ADD COLUMN IF NOT EXISTS backup_notified_at timestamp;

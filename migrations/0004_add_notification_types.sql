-- Add scrimmage-related notification types to the enum
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'scrimmage_invite';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'scrimmage_reminder';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'scrimmage_approved';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'scrimmage_updated';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'scrimmage_canceled';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'scrimmage_cohost_added';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'scrimmage_cohost_removed';

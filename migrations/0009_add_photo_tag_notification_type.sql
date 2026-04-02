-- Add photo_tag notification type to the enum
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'photo_tag';

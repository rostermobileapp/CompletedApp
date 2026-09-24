-- The badge catalog seed also reconciles the existing 3 Stars artwork and adds
-- its fifth (Diamond) tier at 50. Keep the enum available to standalone migrations.
ALTER TYPE badge_tier ADD VALUE IF NOT EXISTS 'diamond';
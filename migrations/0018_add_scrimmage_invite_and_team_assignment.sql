-- Add invite_group_id to scrimmages: live invite group for recurring scrimmages,
-- re-fetched at each send-time so group additions/removals are automatically reflected.
ALTER TABLE scrimmages ADD COLUMN IF NOT EXISTS invite_group_id varchar REFERENCES invite_groups(id) ON DELETE SET NULL;

-- Add invite_user_ids to scrimmages: directly-selected individual user IDs stored at
-- creation time, merged with live group membership in the recurring invite job.
ALTER TABLE scrimmages ADD COLUMN IF NOT EXISTS invite_user_ids text[] NOT NULL DEFAULT '{}'::text[];

-- Add team_assignment to scrimmage_requests: light/dark team colour assigned when
-- a commissioner approves (or later reassigns) a player's join request.
-- DB-level CHECK mirrors API-level validation for defence-in-depth.
ALTER TABLE scrimmage_requests ADD COLUMN IF NOT EXISTS team_assignment varchar CHECK (team_assignment IN ('light', 'dark'));

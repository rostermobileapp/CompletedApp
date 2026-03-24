-- Add sub_approval_workflow enum type and column to leagues table
DO $$ BEGIN
  CREATE TYPE "sub_approval_workflow" AS ENUM (
    'captain_and_commissioner',
    'captain_only',
    'commissioner_only',
    'substitute_only'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "leagues"
  ADD COLUMN IF NOT EXISTS "sub_approval_workflow" "sub_approval_workflow" NOT NULL DEFAULT 'captain_and_commissioner';

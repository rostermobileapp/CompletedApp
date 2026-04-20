-- ====================================================================
-- MANUAL Blank City Cleanup Script
-- ====================================================================
-- Purpose: Normalize empty-string city values to NULL in the users table.
--
-- Background: During the city-coordinates backfill run, some users were
-- found with city = '' instead of NULL. These rows slip through the
-- backfill query (city IS NOT NULL) but produce no geocoding result
-- because Nominatim finds nothing for an empty query string. Normalizing
-- to NULL stops them from polluting map queries and wastes no API calls
-- on any future re-run.
--
-- This script was run once against the development database on 2026-04-20.
-- Run it manually against any environment where blank cities may exist.
-- ====================================================================

-- STEP 1: Preview affected rows before making changes
-- --------------------------------------------------------------------
SELECT id, display_id, city
FROM users
WHERE city = ''
ORDER BY id;

-- STEP 2: Perform the cleanup
-- --------------------------------------------------------------------
UPDATE users
SET city = NULL
WHERE city = '';

-- STEP 3: Verify — should return 0
-- --------------------------------------------------------------------
SELECT COUNT(*) AS remaining_blank_cities
FROM users
WHERE city = '';

-- ====================================================================
-- NOTES:
-- 1. This operation is idempotent and safe to run multiple times.
-- 2. Only the city column is touched; no other columns are modified.
-- 3. Forward-looking guard also added in server/storage.ts so that
--    updateUserProfile / updateUserOnboarding will coerce city = ''
--    to NULL before writing, preventing recurrence.
-- ====================================================================

/**
 * Regression coverage for league cleanup and rink-wide scrimmage players.
 *
 * Run with:
 *   npx tsx --test server/tests/leagueDeletionAndVenuePool.integration.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { storage } from '../storage.js';

test('venue pools hide both placeholder models and league deletion clears all dependent records', async () => {
  const run = randomUUID().replace(/-/g, '');
  const commissionerId = `test_${run}_commissioner`;
  const legacyPlaceholderUserId = `test_${run}_legacy_placeholder`;
  const facilityId = `test_${run}_facility`;
  const leagueId = `test_${run}_league`;
  const seasonId = `test_${run}_season`;
  const teamId = `test_${run}_team`;
  const directPlaceholderId = `test_${run}_direct_placeholder`;
  const teamPlaceholderId = `test_${run}_team_placeholder`;
  const seasonPlaceholderId = `test_${run}_season_placeholder`;
  const facilityMembershipId = `test_${run}_facility_membership`;
  const scrimmageId = `test_${run}_scrimmage`;
  const calendarEventId = `test_${run}_calendar_event`;
  const paymentRequestId = `test_${run}_payment_request`;
  const uniqueLeagueId = `Z${run.slice(0, 5)}`.toUpperCase();

  try {
    await db.execute(sql`
      INSERT INTO users
        (id, email, first_name, last_name, role, onboarding_completed,
         last_updated, created_at, updated_at, fee_exempt)
      VALUES
        (${commissionerId}, ${`commissioner_${run}@example.com`}, 'Registered', 'Player',
         'free_tier', false, NOW(), NOW(), NOW(), false),
        (${legacyPlaceholderUserId}, ${`legacy_${run}@placeholder.roster`}, 'Legacy', 'Placeholder',
         'free_tier', false, NOW(), NOW(), NOW(), false)
    `);
    await db.execute(sql`
      INSERT INTO facilities (id, name, address, created_at, updated_at)
      VALUES (${facilityId}, 'Deletion Test Rink', '1 Test Way', NOW(), NOW())
    `);
    await db.execute(sql`
      INSERT INTO leagues
        (id, name, unique_league_id, sport, commissioner_id, facility_id,
         is_active, playoff_started, sub_approval_workflow, created_at, updated_at)
      VALUES
        (${leagueId}, 'Deletion Test League', ${uniqueLeagueId}, 'hockey',
         ${commissionerId}, ${facilityId}, true, false,
         'captain_and_commissioner', NOW(), NOW())
    `);
    await db.execute(sql`
      INSERT INTO league_memberships
        (id, user_id, league_id, status, requested_at, is_goalie, is_skater)
      VALUES
        (${randomUUID()}, ${commissionerId}, ${leagueId}, 'approved', NOW(), false, true),
        (${randomUUID()}, ${legacyPlaceholderUserId}, ${leagueId}, 'approved', NOW(), false, true)
    `);
    await db.execute(sql`
      INSERT INTO facility_memberships
        (id, user_id, facility_id, membership_type, status, start_date, created_at, updated_at)
      VALUES
        (${facilityMembershipId}, ${commissionerId}, ${facilityId}, 'basic', 'active',
         NOW(), NOW(), NOW())
    `);
    await db.execute(sql`
      INSERT INTO seasons (id, name, league_id, created_at, updated_at)
      VALUES (${seasonId}, 'Deletion Test Season', ${leagueId}, NOW(), NOW())
    `);
    await db.execute(sql`
      INSERT INTO teams (id, name, league_id, season_id, created_at, updated_at)
      VALUES (${teamId}, 'Deletion Test Team', ${leagueId}, ${seasonId}, NOW(), NOW())
    `);
    await db.execute(sql`
      INSERT INTO placeholder_players
        (id, league_id, first_name, last_name, is_goalie, is_skater, created_at)
      VALUES
        (${directPlaceholderId}, ${leagueId}, 'Direct', 'Placeholder', false, true, NOW())
    `);
    await db.execute(sql`
      INSERT INTO placeholder_players
        (id, team_id, first_name, last_name, is_goalie, is_skater, created_at)
      VALUES
        (${teamPlaceholderId}, ${teamId}, 'Team', 'Placeholder', false, true, NOW())
    `);
    await db.execute(sql`
      INSERT INTO placeholder_players
        (id, season_id, first_name, last_name, is_goalie, is_skater, created_at)
      VALUES
        (${seasonPlaceholderId}, ${seasonId}, 'Season', 'Placeholder', false, true, NOW())
    `);
    await db.execute(sql`
      INSERT INTO scrimmages
        (id, league_id, facility_id, creator_id, title, date_time, location,
         max_players, status, is_recurring, recurrence_type, created_at, updated_at)
      VALUES
        (${scrimmageId}, ${leagueId}, ${facilityId}, ${commissionerId},
         'Deletion Test Scrimmage', NOW() + INTERVAL '1 day', 'Deletion Test Rink',
         20, 'open', false, 'none', NOW(), NOW())
    `);
    await db.execute(sql`
      INSERT INTO scrimmage_requests (id, scrimmage_id, player_id, status, requested_at)
      VALUES (${randomUUID()}, ${scrimmageId}, ${commissionerId}, 'approved', NOW())
    `);
    await db.execute(sql`
      INSERT INTO scrimmage_co_hosts
        (id, scrimmage_id, user_id, added_at, added_by)
      VALUES
        (${randomUUID()}, ${scrimmageId}, ${commissionerId}, NOW(), ${commissionerId})
    `);
    await db.execute(sql`
      INSERT INTO scrimmage_invites (id, scrimmage_id, email, invited_at)
      VALUES (${randomUUID()}, ${scrimmageId}, ${`invite_${run}@example.com`}, NOW())
    `);
    await db.execute(sql`
      INSERT INTO scrimmage_reminders_sent
        (id, scrimmage_id, player_id, hours_before, sent_at)
      VALUES (${randomUUID()}, ${scrimmageId}, ${commissionerId}, 24, NOW())
    `);
    await db.execute(sql`
      INSERT INTO calendar_events
        (id, facility_id, sport_id, event_type, title, start_time, end_time,
         scrimmage_id, created_by, created_at, updated_at)
      VALUES
        (${calendarEventId}, ${facilityId}, 'hockey', 'scrimmage',
         'Deletion Test Calendar Event', NOW() + INTERVAL '1 day',
         NOW() + INTERVAL '2 days', ${scrimmageId}, ${commissionerId}, NOW(), NOW())
    `);
    await db.execute(sql`
      INSERT INTO event_participants
        (id, event_id, user_id, facility_membership_id, rsvp_status, joined_at)
      VALUES
        (${randomUUID()}, ${calendarEventId}, ${commissionerId},
         ${facilityMembershipId}, 'joined', NOW())
    `);
    await db.execute(sql`
      INSERT INTO payment_requests
        (id, creator_id, title, amount_per_person, related_scrimmage_id,
         created_at, updated_at)
      VALUES
        (${paymentRequestId}, ${commissionerId}, 'Deletion Test Invoice',
         10.00, ${scrimmageId}, NOW(), NOW())
    `);
    await db.execute(sql`
      INSERT INTO payment_request_recipients
        (id, payment_request_id, user_id, is_paid, is_confirmed, created_at, updated_at)
      VALUES
        (${randomUUID()}, ${paymentRequestId}, ${commissionerId}, false, false, NOW(), NOW())
    `);

    const venueMembers = await storage.getVenueScrimmageMembers(facilityId, [leagueId]);
    assert.ok(
      venueMembers.some((member: any) => member.user.id === commissionerId),
      'registered rink player should remain available',
    );
    assert.ok(
      !venueMembers.some((member: any) => member.user.id === legacyPlaceholderUserId),
      'legacy placeholder-backed user should be excluded server-side',
    );
    assert.ok(
      venueMembers.some((member: any) => member.isPlaceholder === true),
      'placeholder-player rows should remain explicitly classified for client filtering',
    );

    await storage.deleteLeague(leagueId);

    const remaining = await db.execute(sql`
      SELECT
        EXISTS (SELECT 1 FROM leagues WHERE id = ${leagueId}) AS league_exists,
        EXISTS (SELECT 1 FROM teams WHERE id = ${teamId}) AS team_exists,
        EXISTS (SELECT 1 FROM seasons WHERE id = ${seasonId}) AS season_exists,
        EXISTS (
          SELECT 1 FROM placeholder_players
          WHERE id IN (${directPlaceholderId}, ${teamPlaceholderId}, ${seasonPlaceholderId})
        ) AS placeholder_exists,
        EXISTS (SELECT 1 FROM scrimmages WHERE id = ${scrimmageId}) AS scrimmage_exists,
        EXISTS (SELECT 1 FROM calendar_events WHERE id = ${calendarEventId}) AS calendar_event_exists,
        (
          SELECT related_scrimmage_id
          FROM payment_requests
          WHERE id = ${paymentRequestId}
        ) AS invoice_scrimmage_id,
        EXISTS (SELECT 1 FROM facilities WHERE id = ${facilityId}) AS facility_exists
    `);
    const result = remaining.rows[0] as any;
    assert.equal(result.league_exists, false);
    assert.equal(result.team_exists, false);
    assert.equal(result.season_exists, false);
    assert.equal(result.placeholder_exists, false);
    assert.equal(result.scrimmage_exists, false);
    assert.equal(result.calendar_event_exists, false);
    assert.equal(result.invoice_scrimmage_id, null, 'invoice history should survive without a stale scrimmage link');
    assert.equal(result.facility_exists, true, 'shared rink data must not be deleted with a league');
  } finally {
    // Safe cleanup if an assertion or deletion step fails partway through.
    await db.execute(sql`DELETE FROM payment_request_recipients WHERE payment_request_id = ${paymentRequestId}`);
    await db.execute(sql`DELETE FROM payment_requests WHERE id = ${paymentRequestId}`);
    await db.execute(sql`DELETE FROM event_participants WHERE event_id = ${calendarEventId}`);
    await db.execute(sql`DELETE FROM calendar_events WHERE id = ${calendarEventId}`);
    await db.execute(sql`DELETE FROM scrimmage_co_hosts WHERE scrimmage_id = ${scrimmageId}`);
    await db.execute(sql`DELETE FROM scrimmage_invites WHERE scrimmage_id = ${scrimmageId}`);
    await db.execute(sql`DELETE FROM scrimmage_reminders_sent WHERE scrimmage_id = ${scrimmageId}`);
    await db.execute(sql`DELETE FROM scrimmage_requests WHERE scrimmage_id = ${scrimmageId}`);
    await db.execute(sql`DELETE FROM scrimmages WHERE id = ${scrimmageId}`);
    await db.execute(sql`
      DELETE FROM placeholder_players
      WHERE id IN (${directPlaceholderId}, ${teamPlaceholderId}, ${seasonPlaceholderId})
    `);
    await db.execute(sql`DELETE FROM league_memberships WHERE league_id = ${leagueId}`);
    await db.execute(sql`DELETE FROM teams WHERE id = ${teamId}`);
    await db.execute(sql`DELETE FROM seasons WHERE id = ${seasonId}`);
    await db.execute(sql`DELETE FROM leagues WHERE id = ${leagueId}`);
    await db.execute(sql`DELETE FROM facility_memberships WHERE facility_id = ${facilityId}`);
    await db.execute(sql`DELETE FROM facilities WHERE id = ${facilityId}`);
    await db.execute(sql`DELETE FROM users WHERE id = ${legacyPlaceholderUserId}`);
    await db.execute(sql`DELETE FROM users WHERE id = ${commissionerId}`);
  }
});
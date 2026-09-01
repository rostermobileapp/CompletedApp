/**
 * Integration tests for the backup-accept race-condition guard.
 *
 * These tests hit the real database (same DATABASE_URL used by the app) and
 * verify that the production storage methods — acceptBackupAtomically,
 * promoteNextBackupAtomically, resolveBackupResponse, and
 * claimAndNotifyNextBackup — behave correctly under concurrent load and edge
 * cases.
 *
 * Run with:
 *   npx tsx --test server/tests/backupRaceCondition.integration.test.ts
 *
 * All fixtures are inserted under a unique run ID and deleted in `after()`.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { storage } from '../storage.js';
import { sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Fixture IDs — unique per test run so parallel CI runs never collide
// ---------------------------------------------------------------------------
const RUN   = randomUUID().slice(0, 8);
const UID_A = `test_${RUN}_userA`; // backup player A
const UID_B = `test_${RUN}_userB`; // backup player B
const UID_C = `test_${RUN}_userC`; // organiser / already-approved player
const LID   = `test_${RUN}_league`;
const SCRIM = `test_${RUN}_scrim`;

// scrimmage_request rows created per test — we track them for cleanup
const createdRequestIds: string[] = [];

// ---------------------------------------------------------------------------
// Fixture setup / teardown
// ---------------------------------------------------------------------------
before(async () => {
  // Insert minimal user rows (only non-null required columns)
  await db.execute(sql`
    INSERT INTO users (id, role, onboarding_completed, last_updated, created_at, updated_at, fee_exempt)
    VALUES
      (${UID_A}, 'free_tier', false, NOW(), NOW(), NOW(), false),
      (${UID_B}, 'free_tier', false, NOW(), NOW(), NOW(), false),
      (${UID_C}, 'free_tier', false, NOW(), NOW(), NOW(), false)
    ON CONFLICT (id) DO NOTHING
  `);

  // Insert a minimal league row (unique_league_id must be unique — use run prefix)
  const uniqueLeagueId = `T${RUN.slice(0, 5)}`.toUpperCase();
  await db.execute(sql`
    INSERT INTO leagues (id, name, unique_league_id, sport, commissioner_id, is_active, playoff_started, sub_approval_workflow, created_at, updated_at)
    VALUES (${LID}, 'Test League', ${uniqueLeagueId}, 'hockey', ${UID_C}, true, false, 'captain_and_commissioner', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  // Insert a scrimmage with maxPlayers = 1 and a future dateTime
  // (one open spot → only one backup should win)
  await db.execute(sql`
    INSERT INTO scrimmages (id, league_id, creator_id, title, date_time, location, max_players, status, is_recurring, recurrence_type, invite_user_ids, created_at, updated_at)
    VALUES (${SCRIM}, ${LID}, ${UID_C}, 'Integration Test Scrimmage', NOW() + INTERVAL '2 hours', 'Test Rink', 1, 'open', false, 'none', '{}', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);
});

after(async () => {
  // Delete in FK order: requests → scrimmage → league → users
  // Use scrimmage_id filter for requests (avoids needing array binding for IDs)
  await db.execute(sql`DELETE FROM scrimmage_requests WHERE scrimmage_id = ${SCRIM}`);
  await db.execute(sql`DELETE FROM scrimmages WHERE id = ${SCRIM}`);
  await db.execute(sql`DELETE FROM leagues WHERE id = ${LID}`);
  // Delete users one at a time to avoid array binding issues with Neon serverless driver
  await db.execute(sql`DELETE FROM users WHERE id = ${UID_A}`);
  await db.execute(sql`DELETE FROM users WHERE id = ${UID_B}`);
  await db.execute(sql`DELETE FROM users WHERE id = ${UID_C}`);
});

// ---------------------------------------------------------------------------
// Helper to insert a backup request and track its ID for cleanup
// ---------------------------------------------------------------------------
async function insertBackupRequest(playerId: string, position: number, notifiedMinsAgo: number | null = 5): Promise<string> {
  const notifiedAt = notifiedMinsAgo != null
    ? `NOW() - INTERVAL '${notifiedMinsAgo} minutes'`
    : 'NULL';

  const result = await db.execute(sql`
    INSERT INTO scrimmage_requests
      (scrimmage_id, player_id, status, backup_position, backup_notified_at, requested_at)
    VALUES
      (${SCRIM}, ${playerId}, 'backup', ${position}, ${notifiedMinsAgo != null ? sql`NOW() - (${notifiedMinsAgo} * INTERVAL '1 minute')` : sql`NULL`}, NOW())
    ON CONFLICT (scrimmage_id, player_id) DO UPDATE
      SET status = 'backup',
          backup_position = EXCLUDED.backup_position,
          backup_notified_at = EXCLUDED.backup_notified_at
    RETURNING id
  `);
  const id = (result.rows[0] as any).id as string;
  if (!createdRequestIds.includes(id)) createdRequestIds.push(id);
  return id;
}

// Helper to reset a request back to backup so a test can reuse the same player slot
async function resetRequest(requestId: string, position: number, notifiedMinsAgo = 5) {
  await db.execute(sql`
    UPDATE scrimmage_requests
    SET status = 'backup',
        backup_position = ${position},
        backup_notified_at = NOW() - (${notifiedMinsAgo} * INTERVAL '1 minute'),
        approved_at = NULL,
        dismissed_at = NULL
    WHERE id = ${requestId}
  `);
}

// ---------------------------------------------------------------------------
// 1. Winning accept — real DB promotion
// ---------------------------------------------------------------------------
describe('acceptBackupAtomically — winning path', () => {
  test('promotes backup to approved when a slot is open', async () => {
    // Ensure no approved requests exist for this scrimmage
    await db.execute(sql`
      UPDATE scrimmage_requests SET status = 'dismissed' WHERE scrimmage_id = ${SCRIM} AND status = 'approved'
    `);

    const reqId = await insertBackupRequest(UID_A, 1, 5);

    const result = await storage.acceptBackupAtomically(reqId, 1, SCRIM);

    assert.ok(result.ok, 'Should succeed when a slot is open');
    assert.equal(result.request.status, 'approved');
    assert.equal(result.request.backupPosition, null, 'backupPosition cleared after promotion');
    assert.ok(result.request.approvedAt, 'approvedAt should be set');

    // Verify persisted in DB
    const fromDb = await storage.getScrimmageRequestById(reqId);
    assert.equal(fromDb?.status, 'approved');
    assert.equal(fromDb?.backupPosition, null);
  });
});

// ---------------------------------------------------------------------------
// 2. Losing accept — slot already full
// ---------------------------------------------------------------------------
describe('acceptBackupAtomically — losing path', () => {
  test('returns ok:false when all slots are taken', async () => {
    // Player A is already approved — slot is full (maxPlayers = 1)
    const reqIdA = await insertBackupRequest(UID_A, 1, 5);
    // Promote A first to fill the only slot
    await storage.acceptBackupAtomically(reqIdA, 1, SCRIM);

    // Now B tries to accept — should fail
    const reqIdB = await insertBackupRequest(UID_B, 2, 5);
    const result = await storage.acceptBackupAtomically(reqIdB, 1 /* maxPlayers */, SCRIM);

    assert.ok(!result.ok, 'Should fail when scrimmage is at capacity');
    assert.equal((result as { ok: false; reason: string }).reason, 'full');

    // Verify B is still 'backup' in DB
    const fromDb = await storage.getScrimmageRequestById(reqIdB);
    assert.equal(fromDb?.status, 'backup', 'Loser should still be backup (not yet dismissed by route)');
  });
});

// ---------------------------------------------------------------------------
// 3. Concurrent accepts — exactly one promotion
// ---------------------------------------------------------------------------
describe('acceptBackupAtomically — race condition', () => {
  test('two simultaneous accepts produce exactly one approved and one full-rejection', async () => {
    // Reset: clear any existing approved rows for this scrimmage
    await db.execute(sql`
      UPDATE scrimmage_requests SET status = 'dismissed' WHERE scrimmage_id = ${SCRIM} AND status = 'approved'
    `);

    const reqIdA = await insertBackupRequest(UID_A, 1, 5);
    const reqIdB = await insertBackupRequest(UID_B, 2, 5);

    // Fire both accepts simultaneously — serializable transaction ensures only one wins
    const [resultA, resultB] = await Promise.all([
      storage.acceptBackupAtomically(reqIdA, 1, SCRIM),
      storage.acceptBackupAtomically(reqIdB, 1, SCRIM),
    ]);

    const winners = [resultA, resultB].filter(r => r.ok);
    const losers  = [resultA, resultB].filter(r => !r.ok);

    assert.equal(winners.length, 1, 'Exactly one accept should succeed');
    assert.equal(losers.length,  1, 'Exactly one accept should fail');
    assert.equal((losers[0] as { ok: false; reason: string }).reason, 'full');

    // Verify approved count in DB is exactly 1
    const countResult = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM scrimmage_requests
      WHERE scrimmage_id = ${SCRIM} AND status = 'approved'
    `);
    const approvedCount = (countResult.rows[0] as any).cnt as number;
    assert.equal(approvedCount, 1, 'Database must reflect exactly one approved player');
  });
});

// ---------------------------------------------------------------------------
// 4. Automatic promotion after an approved player withdraws
// ---------------------------------------------------------------------------
describe('promoteNextBackupAtomically — ordered automatic promotion', () => {
  test('promotes only the first backup when exactly one vacancy exists', async () => {
    await db.execute(sql`UPDATE scrimmages SET max_players = 2 WHERE id = ${SCRIM}`);

    try {
      await db.execute(sql`
        UPDATE scrimmage_requests
        SET status = 'dismissed',
            backup_position = NULL,
            backup_notified_at = NULL,
            approved_at = NULL,
            dismissed_at = NOW()
        WHERE scrimmage_id = ${SCRIM}
      `);
      await db.execute(sql`
        INSERT INTO scrimmage_requests
          (scrimmage_id, player_id, status, approved_at, requested_at)
        VALUES (${SCRIM}, ${UID_C}, 'approved', NOW(), NOW())
        ON CONFLICT (scrimmage_id, player_id) DO UPDATE
          SET status = 'approved',
              approved_at = NOW(),
              dismissed_at = NULL,
              backup_position = NULL,
              backup_notified_at = NULL
      `);
      await insertBackupRequest(UID_A, 2, null);
      await insertBackupRequest(UID_B, 1, null);

      const results = await Promise.all([
        storage.promoteNextBackupAtomically(SCRIM),
        storage.promoteNextBackupAtomically(SCRIM),
      ]);
      const promotions = results.filter(
        (result): result is NonNullable<typeof result> => result != null,
      );

      assert.equal(promotions.length, 1, 'Only one backup may consume one vacancy');
      assert.equal(promotions[0].playerId, UID_B, 'Lowest backup position must be promoted first');
      assert.equal(promotions[0].status, 'approved');
      assert.equal(promotions[0].backupPosition, null);

      const queueRows = await db.execute(sql`
        SELECT player_id, status, backup_position
        FROM scrimmage_requests
        WHERE scrimmage_id = ${SCRIM}
          AND player_id IN (${UID_A}, ${UID_B})
      `);
      const playerA = queueRows.rows.find((row: any) => row.player_id === UID_A) as any;
      assert.equal(playerA.status, 'backup', 'Second backup must remain queued');
      assert.equal(playerA.backup_position, 2);
    } finally {
      await db.execute(sql`UPDATE scrimmages SET max_players = 1 WHERE id = ${SCRIM}`);
    }
  });

  test('promotes backups for First to RSVP scrimmages', async () => {
    await db.execute(sql`
      UPDATE scrimmages SET join_mode = 'first_come' WHERE id = ${SCRIM}
    `);

    try {
      await db.execute(sql`
        UPDATE scrimmage_requests
        SET status = 'dismissed', backup_position = NULL,
            backup_notified_at = NULL, approved_at = NULL, dismissed_at = NOW()
        WHERE scrimmage_id = ${SCRIM}
      `);
      const requestId = await insertBackupRequest(UID_A, 1, null);

      const promoted = await storage.promoteNextBackupAtomically(SCRIM);

      assert.equal(promoted?.id, requestId);
      assert.equal((await storage.getScrimmageRequestById(requestId))?.status, 'approved');
    } finally {
      await db.execute(sql`
        UPDATE scrimmages SET join_mode = 'approval' WHERE id = ${SCRIM}
      `);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Decline path — resolveBackupResponse(id, false)
// ---------------------------------------------------------------------------
describe('resolveBackupResponse — decline', () => {
  test('sets status to dismissed and clears backupPosition', async () => {
    await db.execute(sql`
      UPDATE scrimmage_requests SET status = 'dismissed' WHERE scrimmage_id = ${SCRIM} AND status = 'approved'
    `);

    const reqId = await insertBackupRequest(UID_A, 1, 5);
    const updated = await storage.resolveBackupResponse(reqId, false);

    assert.equal(updated?.status, 'dismissed');
    assert.equal(updated?.backupPosition, null);
    assert.ok(updated?.dismissedAt, 'dismissedAt should be set on decline');

    // Verify in DB
    const fromDb = await storage.getScrimmageRequestById(reqId);
    assert.equal(fromDb?.status, 'dismissed');
    assert.equal(fromDb?.backupPosition, null);
  });
});

// ---------------------------------------------------------------------------
// 6. resolveBackupResponse — no-op when row is already resolved
// ---------------------------------------------------------------------------
describe('resolveBackupResponse — already resolved (zero-row case)', () => {
  test('returns undefined without throwing when the row is not in backup status', async () => {
    // Insert a request and immediately promote it to approved
    const reqId = await insertBackupRequest(UID_A, 1, 5);
    await storage.acceptBackupAtomically(reqId, 1, SCRIM);

    // Confirm it is now approved, not backup
    const confirmed = await storage.getScrimmageRequestById(reqId);
    assert.equal(confirmed?.status, 'approved');

    // Calling resolveBackupResponse on an already-approved row should be a no-op
    const result = await storage.resolveBackupResponse(reqId, false);
    // The WHERE clause filters on status='backup', so 0 rows match → returns undefined
    assert.equal(result, undefined, 'Should return undefined (not throw) when row is already resolved');

    // DB row must still be approved — we did not accidentally overwrite it
    const afterCall = await storage.getScrimmageRequestById(reqId);
    assert.equal(afterCall?.status, 'approved', 'Previously approved row must not be downgraded');
  });
});

// ---------------------------------------------------------------------------
// 7. claimAndNotifyNextBackup — atomic single-claim guarantee
//
// FOR UPDATE SKIP LOCKED ensures that when two concurrent transactions race
// for the SAME eligible row, only one wins.  We verify this by having a
// single unnotified backup row and firing two simultaneous claim calls.
// ---------------------------------------------------------------------------
describe('claimAndNotifyNextBackup — exactly one row stamped per eligible row', () => {
  test('two concurrent claims on a single eligible row stamp it exactly once', async () => {
    // Clear all requests so there is exactly ONE eligible row (UID_A, position 1)
    await db.execute(sql`
      UPDATE scrimmage_requests
      SET status = 'dismissed', backup_position = NULL
      WHERE scrimmage_id = ${SCRIM}
    `);
    // Insert exactly one unnotified backup row
    await db.execute(sql`
      INSERT INTO scrimmage_requests
        (scrimmage_id, player_id, status, backup_position, backup_notified_at, requested_at)
      VALUES
        (${SCRIM}, ${UID_A}, 'backup', 1, NULL, NOW())
      ON CONFLICT (scrimmage_id, player_id) DO UPDATE
        SET status = 'backup', backup_position = 1, backup_notified_at = NULL,
            approved_at = NULL, dismissed_at = NULL
    `);

    // Fire two concurrent claims — both race for the same single row
    const [claimA, claimB] = await Promise.all([
      storage.claimAndNotifyNextBackup(SCRIM),
      storage.claimAndNotifyNextBackup(SCRIM),
    ]);

    const claims = [claimA, claimB].filter(Boolean);
    // With FOR UPDATE SKIP LOCKED, only one transaction acquires the row;
    // the other finds no unlocked eligible row and returns undefined.
    assert.equal(claims.length, 1, 'Exactly one concurrent claim should succeed (FOR UPDATE SKIP LOCKED)');

    // Verify in DB: the single row has backupNotifiedAt stamped exactly once
    const notifiedResult = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM scrimmage_requests
      WHERE scrimmage_id = ${SCRIM}
        AND status = 'backup'
        AND backup_notified_at IS NOT NULL
    `);
    const notifiedCount = (notifiedResult.rows[0] as any).cnt as number;
    assert.equal(notifiedCount, 1, 'Exactly one row should have backupNotifiedAt stamped');
  });

  test('sequential calls advance through the queue — each call claims the next position', async () => {
    // Set up two unnotified backup rows
    await db.execute(sql`
      INSERT INTO scrimmage_requests
        (scrimmage_id, player_id, status, backup_position, backup_notified_at, requested_at)
      VALUES
        (${SCRIM}, ${UID_A}, 'backup', 1, NULL, NOW()),
        (${SCRIM}, ${UID_B}, 'backup', 2, NULL, NOW())
      ON CONFLICT (scrimmage_id, player_id) DO UPDATE
        SET status = 'backup',
            backup_position = EXCLUDED.backup_position,
            backup_notified_at = NULL,
            approved_at = NULL,
            dismissed_at = NULL
    `);

    const first  = await storage.claimAndNotifyNextBackup(SCRIM);
    const second = await storage.claimAndNotifyNextBackup(SCRIM);

    assert.ok(first,  'First sequential claim should succeed');
    assert.ok(second, 'Second sequential claim should succeed');
    assert.equal(first!.backupPosition,  1, 'First claim must be position 1 (lowest)');
    assert.equal(second!.backupPosition, 2, 'Second claim must be position 2');
  });
});

// ---------------------------------------------------------------------------
// 8. Organiser count integrity — approved count after race
// ---------------------------------------------------------------------------
describe('organiser view — approved count after concurrent accepts', () => {
  test('approved count never exceeds maxPlayers after concurrent accepts', async () => {
    // Clear state
    await db.execute(sql`
      UPDATE scrimmage_requests SET status = 'dismissed', backup_position = NULL
      WHERE scrimmage_id = ${SCRIM} AND status = 'approved'
    `);

    const reqIdA = await insertBackupRequest(UID_A, 1, 5);
    const reqIdB = await insertBackupRequest(UID_B, 2, 5);

    // Both try to accept against maxPlayers = 1
    await Promise.all([
      storage.acceptBackupAtomically(reqIdA, 1, SCRIM),
      storage.acceptBackupAtomically(reqIdB, 1, SCRIM),
    ]);

    const countResult = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM scrimmage_requests
      WHERE scrimmage_id = ${SCRIM} AND status = 'approved'
    `);
    const approved = (countResult.rows[0] as any).cnt as number;
    assert.ok(approved <= 1, `Approved count (${approved}) must not exceed maxPlayers (1)`);
  });
});

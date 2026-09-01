/**
 * Integration coverage for queued-versus-delivered scrimmage invitations.
 *
 * Run with:
 *   npx tsx --test server/tests/scrimmageInviteScheduling.integration.test.ts
 */

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { storage } from '../storage.js';
import {
  generateAndPersistRecurringOccurrences,
  getScrimmageInviteSendAt,
} from '../scrimmageInviteJob.js';

const RUN = randomUUID().replaceAll('-', '').slice(0, 10);
const CREATOR_ID = `sched_creator_${RUN}`;
const PLAYER_ID = `sched_player_${RUN}`;
const COHOST_ID = `sched_cohost_${RUN}`;
const LEAGUE_ID = `sched_league_${RUN}`;
const TODAY_ID = `sched_today_${RUN}`;
const TBD_ID = `sched_tbd_${RUN}`;
const QUEUED_ID = `sched_queued_${RUN}`;
const DELIVERED_ID = `sched_delivered_${RUN}`;
const PARENT_ID = `sched_parent_${RUN}`;
const CLAIM_ID = `sched_claim_${RUN}`;
const ANNOUNCEMENT_ID = `sched_announcement_${RUN}`;
const MONTHLY_LEAGUE_ID = `sched_monthly_league_${RUN}`;
const MONTHLY_PARENT_ID = `sched_monthly_parent_${RUN}`;
const DRIFTED_MONTHLY_PARENT_ID = `sched_drifted_monthly_${RUN}`;
const DRIFTED_MONTHLY_CHILD_IDS = [
  `sched_drift_oct_${RUN}`,
  `sched_drift_nov_${RUN}`,
  `sched_drift_dec_${RUN}`,
  `sched_drift_jan_${RUN}`,
];

before(async () => {
  await db.execute(sql`
    INSERT INTO users (
      id, role, onboarding_completed, last_updated, created_at, updated_at, fee_exempt
    )
    VALUES
      (${CREATOR_ID}, 'free_tier', false, NOW(), NOW(), NOW(), false),
      (${PLAYER_ID}, 'free_tier', false, NOW(), NOW(), NOW(), false),
      (${COHOST_ID}, 'free_tier', false, NOW(), NOW(), NOW(), false)
  `);

  await db.execute(sql`
    INSERT INTO leagues (
      id, name, unique_league_id, sport, commissioner_id, timezone,
      is_active, playoff_started, sub_approval_workflow, created_at, updated_at
    )
    VALUES (
      ${MONTHLY_LEAGUE_ID}, 'Monthly Recurrence Test',
      ${`M${RUN.slice(0, 5)}`.toUpperCase()}, 'hockey', ${CREATOR_ID},
      'America/Los_Angeles', true, false, 'captain_and_commissioner',
      NOW(), NOW()
    )
  `);

  await db.execute(sql`
    INSERT INTO leagues (
      id, name, unique_league_id, sport, commissioner_id, timezone,
      is_active, playoff_started, sub_approval_workflow, created_at, updated_at
    )
    VALUES (
      ${LEAGUE_ID}, 'Invite Scheduling Test', ${`S${RUN.slice(0, 5)}`.toUpperCase()},
      'hockey', ${CREATOR_ID}, 'America/New_York',
      true, false, 'captain_and_commissioner', NOW(), NOW()
    )
  `);

  await db.execute(sql`
    INSERT INTO scrimmages (
      id, league_id, creator_id, title, date_time, location, max_players,
      status, is_recurring, recurrence_type, invite_user_ids, time_tbd,
      invite_days_before, invite_time_of_day, invite_sent_at,
      has_deferred_invites, created_at, updated_at
    )
    VALUES
      (
        ${TODAY_ID}, ${LEAGUE_ID}, ${CREATOR_ID}, 'Same-day delivered', NOW() - INTERVAL '1 hour',
        'Test Rink', 20, 'open', false, 'none', ARRAY[${PLAYER_ID}], false,
        NULL, NULL, NOW(), false, NOW(), NOW()
      ),
      (
        ${TBD_ID}, ${LEAGUE_ID}, ${CREATOR_ID}, 'TBD queued', NOW() + INTERVAL '10 days',
        'Test Rink', 20, 'open', false, 'none', ARRAY[${PLAYER_ID}], true,
        5, '09:00', NULL, true, NOW(), NOW()
      ),
      (
        ${QUEUED_ID}, ${LEAGUE_ID}, ${CREATOR_ID}, 'Timed queued', NOW() + INTERVAL '11 days',
        'Test Rink', 20, 'open', false, 'none', ARRAY[${PLAYER_ID}], false,
        5, '09:00', NULL, true, NOW(), NOW()
      ),
      (
        ${DELIVERED_ID}, ${LEAGUE_ID}, ${CREATOR_ID}, 'Timed delivered', NOW() + INTERVAL '12 days',
        'Test Rink', 20, 'open', false, 'none', ARRAY[${PLAYER_ID}], false,
        NULL, NULL, NOW(), false, NOW(), NOW()
      ),
      (
        ${PARENT_ID}, ${LEAGUE_ID}, ${CREATOR_ID}, 'Recurring first occurrence', NOW() + INTERVAL '13 days',
        'Test Rink', 20, 'open', true, 'weekly', ARRAY[${PLAYER_ID}], false,
        5, '09:00', NULL, true, NOW(), NOW()
      ),
      (
        ${CLAIM_ID}, ${LEAGUE_ID}, ${CREATOR_ID}, 'Atomic claim', NOW() + INTERVAL '14 days',
        'Test Rink', 20, 'open', false, 'none', ARRAY[${PLAYER_ID}], false,
        5, '09:00', NULL, true, NOW(), NOW()
      )
  `);

  await db.execute(sql`
    INSERT INTO scrimmages (
      id, league_id, creator_id, title, date_time, location, max_players,
      status, is_recurring, recurrence_type, recurrence_end_date,
      recurrence_count, invite_user_ids, time_tbd, has_deferred_invites,
      created_at, updated_at
    )
    VALUES (
      ${MONTHLY_PARENT_ID}, ${MONTHLY_LEAGUE_ID}, ${CREATOR_ID},
      'Monthly end-date parent', '2026-10-31 20:00:00', 'Test Rink', 20,
      'open', true, 'monthly', '2026-11-30 00:00:00', 12,
      ARRAY[${PLAYER_ID}], false, false, NOW(), NOW()
    )
  `);

  await db.execute(sql`
    INSERT INTO scrimmages (
      id, league_id, creator_id, title, date_time, location, max_players,
      status, is_recurring, recurrence_type, recurrence_count,
      recurrence_times_independent, invite_user_ids, time_tbd,
      has_deferred_invites, parent_scrimmage_id, created_at, updated_at
    )
    VALUES
      (
        ${DRIFTED_MONTHLY_PARENT_ID}, ${MONTHLY_LEAGUE_ID}, ${CREATOR_ID},
        'Legacy drifted monthly parent', '2026-09-04 00:00:00', 'Test Rink', 20,
        'open', true, 'monthly', 5, true, ARRAY[${PLAYER_ID}], true, true,
        NULL, NOW(), NOW()
      ),
      (
        ${DRIFTED_MONTHLY_CHILD_IDS[0]}, ${MONTHLY_LEAGUE_ID}, ${CREATOR_ID},
        'Legacy drifted monthly child', '2026-10-04 00:00:00', 'Test Rink', 20,
        'open', false, 'monthly', 5, true, ARRAY[${PLAYER_ID}], true, true,
        ${DRIFTED_MONTHLY_PARENT_ID}, NOW(), NOW()
      ),
      (
        ${DRIFTED_MONTHLY_CHILD_IDS[1]}, ${MONTHLY_LEAGUE_ID}, ${CREATOR_ID},
        'Legacy drifted monthly child', '2026-11-03 00:00:00', 'Test Rink', 20,
        'open', false, 'monthly', 5, true, ARRAY[${PLAYER_ID}], true, true,
        ${DRIFTED_MONTHLY_PARENT_ID}, NOW(), NOW()
      ),
      (
        ${DRIFTED_MONTHLY_CHILD_IDS[2]}, ${MONTHLY_LEAGUE_ID}, ${CREATOR_ID},
        'Legacy drifted monthly child', '2026-12-03 00:00:00', 'Test Rink', 20,
        'open', false, 'monthly', 5, true, ARRAY[${PLAYER_ID}], true, true,
        ${DRIFTED_MONTHLY_PARENT_ID}, NOW(), NOW()
      ),
      (
        ${DRIFTED_MONTHLY_CHILD_IDS[3]}, ${MONTHLY_LEAGUE_ID}, ${CREATOR_ID},
        'Legacy drifted monthly child', '2027-01-02 00:00:00', 'Test Rink', 20,
        'open', false, 'monthly', 5, true, ARRAY[${PLAYER_ID}], true, true,
        ${DRIFTED_MONTHLY_PARENT_ID}, NOW(), NOW()
      )
  `);

  await db.execute(sql`
    INSERT INTO scrimmage_co_hosts (
      scrimmage_id, user_id, added_by, can_approve_requests,
      can_send_reminders, can_manage_payments, added_at
    )
    VALUES (${TBD_ID}, ${COHOST_ID}, ${CREATOR_ID}, true, true, true, NOW())
  `);
});

after(async () => {
  await db.execute(sql`DELETE FROM user_notifications WHERE scrimmage_id IN (${TBD_ID}, ${QUEUED_ID}, ${DELIVERED_ID}, ${PARENT_ID}, ${CLAIM_ID})`);
  await db.execute(sql`DELETE FROM scrimmage_co_hosts WHERE scrimmage_id = ${TBD_ID}`);
  await db.execute(sql`DELETE FROM scrimmages WHERE league_id = ${LEAGUE_ID}`);
  await db.execute(sql`DELETE FROM scrimmages WHERE league_id = ${MONTHLY_LEAGUE_ID}`);
  await db.execute(sql`DELETE FROM announcements WHERE id = ${ANNOUNCEMENT_ID}`);
  await db.execute(sql`DELETE FROM leagues WHERE id = ${LEAGUE_ID}`);
  await db.execute(sql`DELETE FROM leagues WHERE id = ${MONTHLY_LEAGUE_ID}`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${PLAYER_ID}, ${COHOST_ID}, ${CREATOR_ID})`);
});

describe('scrimmage invite visibility', () => {
  test('players see only delivered exact-time occurrences', async () => {
    const invites = await storage.getScrimmageInvitesForUser(PLAYER_ID);
    const ids = new Set(invites.map((invite) => invite.id));

    assert.equal(ids.has(TBD_ID), false);
    assert.equal(ids.has(QUEUED_ID), false);
    assert.equal(ids.has(PARENT_ID), false);
    assert.equal(ids.has(DELIVERED_ID), true);
    assert.equal(ids.has(TODAY_ID), true);
  });

  test('organizers still see their queued and TBD occurrences', async () => {
    const invites = await storage.getScrimmageInvitesForUser(CREATOR_ID);
    const ids = new Set(invites.map((invite) => invite.id));

    assert.equal(ids.has(TBD_ID), true);
    assert.equal(ids.has(QUEUED_ID), true);
    assert.equal(ids.has(PARENT_ID), true);
  });

  test('all viewers receive the approved-player open spot count', async () => {
    const requestId = randomUUID();
    await db.execute(sql`
      INSERT INTO scrimmage_requests (id, scrimmage_id, player_id, status, approved_at)
      VALUES (${requestId}, ${PARENT_ID}, ${PLAYER_ID}, 'approved', NOW())
    `);

    try {
      const creatorInvites = await storage.getScrimmageInvitesForUser(CREATOR_ID);
      const creatorParent = creatorInvites.find((invite) => invite.id === PARENT_ID);
      assert.equal(creatorParent?.openSpots, 19);

      const playerInvites = await storage.getScrimmageInvitesForUser(PLAYER_ID);
      const playerDelivered = playerInvites.find((invite) => invite.id === DELIVERED_ID);
      assert.equal(playerDelivered?.openSpots, 20);
    } finally {
      await db.execute(sql`DELETE FROM scrimmage_requests WHERE id = ${requestId}`);
    }
  });

  test('co-hosts share organizer visibility for queued and TBD occurrences', async () => {
    const invites = await storage.getScrimmageInvitesForUser(COHOST_ID);
    assert.equal(invites.some((invite) => invite.id === TBD_ID), true);
  });
});

describe('scheduled occurrence selection and claims', () => {
  test('includes the recurring parent occurrence but excludes TBD and delivered rows', async () => {
    const candidates = await storage.getScrimmagesNeedingInvites();
    const ids = new Set(candidates.map((scrimmage) => scrimmage.id));

    assert.equal(ids.has(TBD_ID), false);
    assert.equal(ids.has(DELIVERED_ID), false);
    assert.equal(ids.has(QUEUED_ID), true);
    assert.equal(ids.has(PARENT_ID), true);
  });

  test('only one concurrent worker claims an occurrence and successful player delivery progress survives retry', async () => {
    const claims = await Promise.all([
      storage.claimScrimmageInviteDelivery(CLAIM_ID),
      storage.claimScrimmageInviteDelivery(CLAIM_ID),
    ]);

    assert.equal(claims.filter(Boolean).length, 1);
    assert.equal(claims.find(Boolean)?.inviteSentAt, null, 'a lease is not a completed delivery');
    const firstNotification = await storage.createNotificationIfNotExists({
      userId: PLAYER_ID,
      type: 'scrimmage_invite',
      title: 'First delivery attempt',
      message: 'Player delivery succeeded before an email failed',
      actionUrl: `/scrimmage/${CLAIM_ID}`,
      scrimmageId: CLAIM_ID,
    });
    assert.ok(firstNotification, 'the first attempt would send one player push');

    const whileLeased = await storage.getScrimmageInvitesForUser(PLAYER_ID);
    assert.equal(whileLeased.some((invite) => invite.id === CLAIM_ID), false);

    const winningClaim = claims.find(Boolean)!;
    // Simulate a later email failure: release without completing, then retry.
    await storage.releaseScrimmageInviteDelivery(CLAIM_ID, winningClaim.inviteDeliveryClaimId!);
    const retryClaim = await storage.claimScrimmageInviteDelivery(CLAIM_ID);
    assert.ok(retryClaim);
    const duplicateNotification = await storage.createNotificationIfNotExists({
      userId: PLAYER_ID,
      type: 'scrimmage_invite',
      title: 'Retry delivery attempt',
      message: 'This retry must not create a second push marker',
      actionUrl: `/scrimmage/${CLAIM_ID}`,
      scrimmageId: CLAIM_ID,
    });
    assert.equal(duplicateNotification, null, 'the retry must not resend the successful player push');

    const completed = await storage.completeScrimmageInviteDelivery(
      CLAIM_ID,
      retryClaim.inviteDeliveryClaimId!,
    );
    assert.ok(completed?.inviteSentAt);
    const afterCompletion = await storage.getScrimmageInvitesForUser(PLAYER_ID);
    assert.equal(afterCompletion.some((invite) => invite.id === CLAIM_ID), true);
  });

  test('an expired worker cannot complete or release a replacement lease', async () => {
    const firstClaim = await storage.claimScrimmageInviteDelivery(QUEUED_ID);
    assert.ok(firstClaim);
    const replacementToken = new Date(firstClaim.inviteDeliveryClaimedAt!.getTime() + 1_000);
    const replacementClaimId = randomUUID();
    await db.execute(sql`
      UPDATE scrimmages
      SET invite_delivery_claimed_at = ${replacementToken},
          invite_delivery_claim_id = ${replacementClaimId}
      WHERE id = ${QUEUED_ID}
    `);

    const staleCompletion = await storage.completeScrimmageInviteDelivery(
      QUEUED_ID,
      firstClaim.inviteDeliveryClaimId!,
    );
    assert.equal(staleCompletion, null);
    await storage.releaseScrimmageInviteDelivery(QUEUED_ID, firstClaim.inviteDeliveryClaimId!);

    const stillClaimed = await storage.getScrimmage(QUEUED_ID);
    assert.equal(stillClaimed?.inviteDeliveryClaimedAt?.getTime(), replacementToken.getTime());
    assert.equal(stillClaimed?.inviteDeliveryClaimId, replacementClaimId);
    assert.equal(stillClaimed?.inviteSentAt, null);
    assert.equal(await storage.renewScrimmageInviteDelivery(QUEUED_ID, replacementClaimId), true);
    await storage.releaseScrimmageInviteDelivery(QUEUED_ID, replacementClaimId);
  });

  test('new recurring children never share the parent occurrence announcement', async () => {
    await db.execute(sql`
      INSERT INTO announcements (id, content, league_id, author_id, is_pinned, created_at, updated_at)
      VALUES (
        ${ANNOUNCEMENT_ID}, 'Parent invite', ${LEAGUE_ID}, ${CREATOR_ID}, false, NOW(), NOW()
      )
    `);
    await db.execute(sql`
      UPDATE scrimmages SET announcement_id = ${ANNOUNCEMENT_ID} WHERE id = ${PARENT_ID}
    `);
    const parent = await storage.getScrimmage(PARENT_ID);
    assert.ok(parent);

    const child = await storage.createRecurringScrimmageOccurrence(
      { ...parent, recurrenceTimesIndependent: true },
      '2026-12-20T20:00:00',
    );
    assert.equal(child.announcementId, null);
    assert.equal(child.timeTbd, true);
  });
});

test('scheduled send time preserves league-local calendar days across DST', () => {
  const sendAt = getScrimmageInviteSendAt(
    '2026-03-10T20:00:00',
    3,
    '09:00',
    'America/New_York',
  );

  assert.equal(sendAt.toISOString(), '2026-03-07T14:00:00.000Z');
});

test('scheduled send time also preserves the configured hour across fall DST', () => {
  const sendAt = getScrimmageInviteSendAt(
    '2026-11-04T20:00:00',
    3,
    '09:00',
    'America/New_York',
  );

  assert.equal(sendAt.toISOString(), '2026-11-01T14:00:00.000Z');
});

test('monthly occurrence job accepts a persisted end date and includes its final local day', async () => {
  const parent = await storage.getScrimmage(MONTHLY_PARENT_ID);
  assert.ok(parent);
  assert.ok(parent.recurrenceEndDate instanceof Date);

  const created = await generateAndPersistRecurringOccurrences(parent, 20);

  assert.deepEqual(
    created.map((occurrence) => occurrence.dateTime),
    ['2026-11-30 20:00:00'],
  );

  const secondRun = await generateAndPersistRecurringOccurrences(parent, 20);
  assert.deepEqual(secondRun, []);

  const childCount = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM scrimmages
    WHERE parent_scrimmage_id = ${MONTHLY_PARENT_ID}
      AND date_time::date = DATE '2026-11-30'
  `);
  assert.equal(Number((childCount.rows[0] as { count: number }).count), 1);
});

test('monthly occurrence job re-anchors children created by the legacy 30-day formula', async () => {
  const parent = await storage.getScrimmage(DRIFTED_MONTHLY_PARENT_ID);
  assert.ok(parent);

  const created = await generateAndPersistRecurringOccurrences(parent, 20);
  assert.deepEqual(created, []);

  const children = await db.execute(sql`
    SELECT id, date_time::date::text AS date_key
    FROM scrimmages
    WHERE parent_scrimmage_id = ${DRIFTED_MONTHLY_PARENT_ID}
    ORDER BY date_time
  `);
  assert.deepEqual(
    children.rows.map((row: any) => [row.id, row.date_key]),
    [
      [DRIFTED_MONTHLY_CHILD_IDS[0], '2026-10-04'],
      [DRIFTED_MONTHLY_CHILD_IDS[1], '2026-11-04'],
      [DRIFTED_MONTHLY_CHILD_IDS[2], '2026-12-04'],
      [DRIFTED_MONTHLY_CHILD_IDS[3], '2027-01-04'],
    ],
  );

  const secondRun = await generateAndPersistRecurringOccurrences(parent, 20);
  assert.deepEqual(secondRun, []);
});
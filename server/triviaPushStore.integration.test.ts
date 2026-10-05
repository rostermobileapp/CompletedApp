import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { createTriviaPushStore } from "./triviaPushStore";

const testUrl = process.env.TRIVIA_PUSH_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (url.hostname !== "127.0.0.1" || url.port !== "55433" || url.pathname !== "/roster_trivia_push_test") {
    throw Error("Trivia push SQL tests may use only the isolated local roster_trivia_push_test database on port 55433.");
  }
}

test("isolated PostgreSQL delivery claims and recipient safety", { skip: !testUrl }, async t => {
  const db = new Pool({ connectionString: testUrl });
  const store = createTriviaPushStore((sql, values) => db.query(sql, values));
  try {
    await db.query(`
      CREATE TABLE users (id varchar PRIMARY KEY, display_id varchar, email varchar, deleted_at timestamptz);
      CREATE TABLE notification_preferences (
        user_id varchar PRIMARY KEY REFERENCES users(id), push_enabled boolean,
        onesignal_external_id varchar, onesignal_player_id varchar,
        notification_settings jsonb NOT NULL DEFAULT '{}'::jsonb
      );
    `);
    await db.query(readFileSync(new URL("../migrations/0041_daily_trivia_push_deliveries.sql", import.meta.url), "utf8"));
    const clock = (await db.query(`SELECT (now() AT TIME ZONE 'America/New_York')::date::text AS date,
      (now() AT TIME ZONE 'America/New_York')::time >= time '12:00' AS noon`)).rows[0];
    const date = clock.date as string;
    await db.query(`INSERT INTO users VALUES
      ('owner','U00001','owner@example.test',NULL),
      ('other','U00002','other@example.test',NULL),
      ('optout','U00003','optout@example.test',NULL),
      ('placeholder','U00004','fake@placeholder.roster',NULL),
      ('deleted','U00005','deleted@example.test',now()),
      ('unregistered','U00006','unregistered@example.test',NULL);
      INSERT INTO notification_preferences (user_id,push_enabled,onesignal_external_id,onesignal_player_id) VALUES
      ('owner',true,'U00001',NULL),('other',true,NULL,'device'),
      ('optout',false,'U00003',NULL),('placeholder',true,'U00004',NULL),
      ('deleted',true,'U00005',NULL),('unregistered',true,'','');`);

    await t.test("selection enforces scope, opt-out, deletion, placeholder and device eligibility", async () => {
      assert.deepEqual((await store.list(date, ["U00001"])).map(r => r.id), ["owner"]);
      assert.deepEqual((await store.list(date, null)).map(r => r.id), ["other", "owner"]);
      assert.deepEqual(await store.list(date, []), []);
      assert.equal(await store.claim("other", date, ["U00001"]), null);
      assert.equal(await store.claim("optout", date, null), null);
    });
    await t.test("Trivia-only opt-out prevents selection and first claim without disabling other pushes", async () => {
      await db.query(`UPDATE notification_preferences
        SET notification_settings='{"triviaReminders":false,"inAppMessages":true}' WHERE user_id='other'`);
      assert.deepEqual(await store.list(date, ["U00002"]), []);
      assert.equal(await store.claim("other", date, ["U00002"]), null);
      assert.equal((await db.query(`SELECT push_enabled FROM notification_preferences WHERE user_id='other'`)).rows[0].push_enabled, true);
      await db.query(`UPDATE notification_preferences
        SET notification_settings=notification_settings || '{"triviaReminders":true}'::jsonb WHERE user_id='other'`);
      assert.deepEqual((await store.list(date, ["U00002"])).map(row => row.id), ["other"]);
    });
    const claims = await Promise.all(Array.from({ length: 12 }, () => store.claim("owner", date, ["U00001"])));
    const lease = claims.find(Boolean)!;
    await t.test("concurrent SQL claims grant exactly one lease", async () => {
      assert.equal(claims.filter(Boolean).length, 1);
      assert.match(lease.idempotencyKey, /^[0-9a-f-]{36}$/);
      assert.equal(await store.eligible("owner", date, lease, ["U00001"]), clock.noon);
    });
    await t.test("eligibility is rechecked after claiming, including clock and consent", async () => {
      await db.query(`UPDATE notification_preferences SET push_enabled=false WHERE user_id='owner'`);
      assert.equal(await store.eligible("owner", date, lease, ["U00001"]), false);
      await db.query(`UPDATE notification_preferences SET push_enabled=true WHERE user_id='owner'`);
      await db.query(`UPDATE notification_preferences
        SET notification_settings='{"triviaReminders":false}' WHERE user_id='owner'`);
      assert.deepEqual(await store.list(date, ["U00001"]), []);
      assert.equal(await store.claim("owner", date, ["U00001"]), null);
      assert.equal(await store.eligible("owner", date, lease, ["U00001"]), false);
      await db.query(`UPDATE notification_preferences
        SET notification_settings = notification_settings || '{"inAppMessages":false}'::jsonb
        WHERE user_id='owner'`);
      assert.equal(await store.eligible("owner", date, lease, ["U00001"]), false);
      const prefs = (await db.query(`SELECT notification_settings FROM notification_preferences WHERE user_id='owner'`)).rows[0];
      assert.deepEqual(prefs.notification_settings, { triviaReminders: false, inAppMessages: false });
      await db.query(`UPDATE notification_preferences
        SET notification_settings = notification_settings || '{"triviaReminders":true}'::jsonb
        WHERE user_id='owner'`);
      assert.equal(await store.eligible("owner", date, lease, ["U00001"]), clock.noon);
      assert.equal(await store.eligible("owner", "2000-01-01", lease, ["U00001"]), false);
    });
    await t.test("rejection persists retry state without marking a delivery sent", async () => {
      await store.finish("owner", date, lease, false, "Mock provider rejection");
      const row = (await db.query(`SELECT sent_at,lease_token,last_error, next_attempt_at > now() AS backed_off
        FROM trivia_push_deliveries WHERE user_id='owner'`)).rows[0];
      assert.equal(row.sent_at, null);
      assert.equal(row.lease_token, null);
      assert.equal(row.backed_off, true);
      assert.equal(row.last_error, "Mock provider rejection");
      assert.equal(await store.claim("owner", date, ["U00001"]), null);
    });
    await db.query(`UPDATE trivia_push_deliveries SET next_attempt_at=now()-interval '1 second' WHERE user_id='owner'`);
    const retry = (await store.claim("owner", date, ["U00001"]))!;
    await t.test("retries preserve provider idempotency, and expired owners cannot overwrite a new lease", async () => {
      assert.equal(retry.idempotencyKey, lease.idempotencyKey);
      await assert.rejects(store.finish("owner", date, lease, true, null), /replaced/);
      await db.query(`UPDATE trivia_push_deliveries SET lease_expires_at=now()-interval '1 second',
        next_attempt_at=now()-interval '1 second' WHERE user_id='owner'`);
      const replacement = (await store.claim("owner", date, ["U00001"]))!;
      assert.equal(replacement.idempotencyKey, retry.idempotencyKey);
      await assert.rejects(store.finish("owner", date, retry, true, null), /replaced/);
      await store.finish("owner", date, replacement, true, null);
    });
    await t.test("successful acceptance survives restart and cannot be reclaimed", async () => {
      const restarted = createTriviaPushStore((sql, values) => db.query(sql, values));
      assert.deepEqual(await restarted.list(date, ["U00001"]), []);
      assert.equal(await restarted.claim("owner", date, ["U00001"]), null);
      const row = (await db.query(`SELECT sent_at,last_error,attempts FROM trivia_push_deliveries WHERE user_id='owner'`)).rows[0];
      assert.ok(row.sent_at);
      assert.equal(row.last_error, null);
      assert.equal(row.attempts, 3);
    });
    await t.test("another date gets an independent occurrence but cannot pass today's send check", async () => {
      const otherDay = (await store.claim("owner", "2000-01-01", ["U00001"]))!;
      assert.notEqual(otherDay.idempotencyKey, lease.idempotencyKey);
      assert.equal(await store.eligible("owner", "2000-01-01", otherDay, ["U00001"]), false);
    });
  } finally {
    await db.end();
  }
});
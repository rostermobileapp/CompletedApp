import { before, after, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { saveOnboardingReferral } from "../onboardingReferral";
import { createSignupAttribution } from "../../client/src/lib/signupAttribution";
import { appAttributionUrl } from "../../shared/signupAttribution";

function attributionStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}

const url = process.env.ATTRIBUTION_TEST_DB_URL;
describe("signup attribution (isolated PostgreSQL)", { skip: !url }, () => {
  let pool: pg.Pool;
  before(async () => {
    const target = new URL(url!);
    assert.ok(["127.0.0.1", "localhost"].includes(target.hostname));
    assert.equal(target.pathname, "/attribution_test");
    pool = new pg.Pool({ connectionString: url, host: target.hostname, port: Number(target.port),
      user: target.username, database: "attribution_test", ssl: false, max: 8 });
    await pool.query(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;
      CREATE TABLE users(id text PRIMARY KEY,referral_partner_id text,referral_code text,referral_source_other text,role text DEFAULT 'player');
      CREATE TABLE referral_partners(id text PRIMARY KEY,referral_code text UNIQUE,status text,org_name text);
      CREATE TABLE referral_user_links(id serial PRIMARY KEY,user_id text,referral_partner_id text,is_paid boolean,paid_tier text,paid_at timestamp);
      CREATE TABLE referral_conversions(id serial PRIMARY KEY,partner_id text,referral_code text,user_id text,conversion_type text,tier text,platform text,gross_price_cents int,status text);`);
  });
  after(async () => { await pool?.end(); });
  beforeEach(async () => {
    await pool.query(`TRUNCATE users,referral_partners,referral_user_links,referral_conversions;
      INSERT INTO users(id) VALUES('new-user');
      INSERT INTO referral_partners VALUES
        ('hpib','HPIB1234','approved','HPIB'),('second','SECOND','approved','Second'),
        ('inactive','INACTIVE','suspended','Inactive');`);
  });
  const validator = async (code: string) => {
    const row = (await pool.query("SELECT id,referral_code,org_name FROM referral_partners WHERE referral_code=$1 AND status='approved'", [code])).rows[0];
    return row ? { id: row.id, code: row.referral_code, orgName: row.org_name } : null;
  };

  test("web link → signup metadata → confirmation → validated partner and link saved", async () => {
    const link = appAttributionUrl("/", "https://www.rosterhockey.com/?ref=HPIB1234&utm_source=hpib&utm_campaign=fall");
    const app = createSignupAttribution(attributionStorage(), validator);
    await app.capture(link);
    const signupMetadata = await app.metadata();
    assert.equal(signupMetadata.initial_referral?.id, "hpib");
    assert.equal(signupMetadata.acquisition_campaign?.utm_source, "hpib");
    // Revalidate untrusted signup metadata after authentication/onboarding.
    const confirmed = await validator(signupMetadata.initial_referral!.code);
    await saveOnboardingReferral(pool, "new-user", { referralPartnerId: confirmed!.id });
    const user = (await pool.query("SELECT * FROM users WHERE id='new-user'")).rows[0];
    assert.equal(user.referral_partner_id, "hpib");
    assert.equal(user.referral_code, "HPIB1234");
    assert.equal((await pool.query("SELECT count(*)::int n FROM referral_user_links")).rows[0].n, 1);
  });

  test("native/store install with no URL retains the manual partner fallback", async () => {
    const app = createSignupAttribution(attributionStorage(), validator);
    await app.capture("/");
    assert.equal(app.read().partner, undefined);
    await saveOnboardingReferral(pool, "new-user", { referralPartnerId: "hpib" });
    assert.equal((await pool.query("SELECT referral_partner_id FROM users")).rows[0].referral_partner_id, "hpib");
  });

  test("first saved partner survives URL/manual/code-only/clear/other attempts and repeat confirmations", async () => {
    await saveOnboardingReferral(pool, "new-user", { referralPartnerId: "hpib" });
    for (const body of [{ referralPartnerId: "second" }, { referralCode: "SECOND" }, { clearReferral: true }, { referralSourceOther: "Someone" }]) {
      await assert.rejects(saveOnboardingReferral(pool, "new-user", body), { code: "REFERRAL_LOCKED" });
    }
    await saveOnboardingReferral(pool, "new-user", { referralPartnerId: "hpib" });
    assert.equal((await pool.query("SELECT referral_partner_id FROM users")).rows[0].referral_partner_id, "hpib");
    assert.equal((await pool.query("SELECT count(*)::int n FROM referral_user_links")).rows[0].n, 1);
  });

  test("simultaneous competing saves commit exactly one partner and one corresponding link", async () => {
    const outcomes = await Promise.allSettled(["hpib", "second"].map(referralPartnerId =>
      saveOnboardingReferral(pool, "new-user", { referralPartnerId })));
    assert.equal(outcomes.filter(r => r.status === "fulfilled").length, 1);
    const user = (await pool.query("SELECT referral_partner_id FROM users")).rows[0];
    const links = (await pool.query("SELECT referral_partner_id FROM referral_user_links")).rows;
    assert.equal(links.length, 1);
    assert.equal(links[0].referral_partner_id, user.referral_partner_id);
  });

  test("inactive/tampered partners cannot be saved and campaign data cannot create credit", async () => {
    await assert.rejects(saveOnboardingReferral(pool, "new-user", { referralPartnerId: "inactive" }), { code: "INVALID_REFERRAL" });
    await assert.rejects(saveOnboardingReferral(pool, "new-user", { referralPartnerId: "invented" }), { code: "INVALID_REFERRAL" });
    await saveOnboardingReferral(pool, "new-user", { acquisition_campaign: { referralPartnerId: "hpib", utm_source: "hpib" } } as any);
    assert.equal((await pool.query("SELECT referral_partner_id FROM users")).rows[0].referral_partner_id, null);
    assert.equal((await pool.query("SELECT count(*)::int n FROM referral_user_links")).rows[0].n, 0);
    assert.equal((await pool.query("SELECT count(*)::int n FROM referral_conversions")).rows[0].n, 0);
  });

  test("existing paid-user claim behavior is retained and retries cannot duplicate claims", async () => {
    await pool.query("UPDATE users SET role='player_pro'");
    await saveOnboardingReferral(pool, "new-user", { referralPartnerId: "hpib" });
    await saveOnboardingReferral(pool, "new-user", { referralPartnerId: "hpib" });
    assert.equal((await pool.query("SELECT count(*)::int n FROM referral_conversions")).rows[0].n, 1);
    const link = (await pool.query("SELECT is_paid,paid_tier FROM referral_user_links")).rows[0];
    assert.deepEqual(link, { is_paid: true, paid_tier: "player_pro" });
  });

  test("manual Other and None remain available without a claimed partner", async () => {
    await saveOnboardingReferral(pool, "new-user", { referralSourceOther: "Coach" });
    assert.equal((await pool.query("SELECT referral_source_other FROM users")).rows[0].referral_source_other, "Coach");
    await saveOnboardingReferral(pool, "new-user", { clearReferral: true });
    assert.equal((await pool.query("SELECT referral_source_other FROM users")).rows[0].referral_source_other, null);
  });

  test("a failed link insert rolls back both the user attribution and the link", async () => {
    await pool.query("ALTER TABLE referral_user_links ADD CONSTRAINT fixture_reject_link CHECK(user_id <> 'new-user')");
    try {
      await assert.rejects(saveOnboardingReferral(pool, "new-user", { referralPartnerId: "hpib" }));
      assert.equal((await pool.query("SELECT referral_partner_id FROM users")).rows[0].referral_partner_id, null);
      assert.equal((await pool.query("SELECT count(*)::int n FROM referral_user_links")).rows[0].n, 0);
    } finally {
      await pool.query("ALTER TABLE referral_user_links DROP CONSTRAINT fixture_reject_link");
    }
  });
});

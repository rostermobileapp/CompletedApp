import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { readManualProOverride } from "../manualProOverride";
import { resolvePersonalPro } from "../personalProCoverage";
import { createProCoverageService } from "../proCoverageService";
import { hasAccountPro, hasProFor } from "../../shared/proCoverage";
import { reconcileOne, type ApplePurchaseLink } from "../applePurchaseReconciliation";

test("owner-managed overrides take precedence without disabling subscription expiry", async t => {
  const connection = process.env.MANUAL_PRO_TEST_DATABASE_URL;
  if (!connection) throw Error("MANUAL_PRO_TEST_DATABASE_URL required");
  const url = new URL(connection);
  if (url.hostname !== "127.0.0.1" || url.port !== "56451" || url.pathname !== "/manual_pro_test")
    throw Error("Only the disposable loopback manual_pro_test database is allowed");
  const pool = new Pool({ connectionString: connection });
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TYPE public.user_role AS ENUM('free_tier','player_pro','commissioner','secondary_commissioner');
      CREATE TABLE public.users(id varchar PRIMARY KEY, role public.user_role NOT NULL,
        stripe_subscription_id varchar, iap_original_transaction_id varchar,
        deleted_at timestamptz,
        updated_at timestamptz DEFAULT now(), last_updated timestamptz DEFAULT now());
      CREATE TABLE public.account_user_merges(source_user_id varchar);
      CREATE FUNCTION public.reject_retired_account_reactivation() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.deleted_at IS NULL AND EXISTS(
          SELECT 1 FROM account_user_merges WHERE source_user_id=NEW.id
        ) THEN RAISE EXCEPTION 'Retired account cannot be reactivated'; END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER users_reject_retired_reactivation BEFORE UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION public.reject_retired_account_reactivation();
      INSERT INTO users(id,role) VALUES('manual','player_pro'),('legacy','player_pro'),
        ('ordinary','player_pro'),('commissioner','commissioner'),('other','free_tier');
      CREATE TABLE apple_purchase_links(user_id varchar PRIMARY KEY,customer_id varchar,
        original_transaction_id varchar,product_id varchar,original_purchased_at timestamptz,
        expires_at timestamptz,revoked_by_apple boolean DEFAULT false,apple_revocation_reason varchar,
        revoked_period_expires_at timestamptz,last_apple_signed_at timestamptz,last_checked_at timestamptz,
        role_before_apple varchar,stripe_role_before_apple varchar,stripe_subscription_id_before_apple varchar,
        association_source varchar);
      CREATE TABLE google_iap_claims(user_id varchar,token_hash varchar,product_id varchar,expires_at timestamptz);
      INSERT INTO apple_purchase_links(user_id,customer_id,original_transaction_id,product_id,
        original_purchased_at,role_before_apple,association_source)
        VALUES('manual','known-customer','original','com.rosterapp.commissioner_monthly',
          '2026-01-01','free_tier','automatic');
      UPDATE users SET iap_original_transaction_id='original' WHERE id='manual';
      INSERT INTO google_iap_claims VALUES('manual','hash','player_pro_monthly','2026-01-01');`);
    await t.test("older nonproduction databases have no override", async () => {
      assert.equal(await readManualProOverride(db, "manual"), false);
    });
    await db.query(await readFile(new URL("../../scripts/production/manual-pro-overrides.sql", import.meta.url), "utf8"));
    const role = async (id: string) => (await db.query("SELECT role FROM users WHERE id=$1", [id])).rows[0].role;
    const grant = async (id: string, baseline = "free_tier") => {
      await db.query(`INSERT INTO pro_access.manual_overrides(user_id,billing_role,reason)
        VALUES($1,$2,'Synthetic owner grant')`, [id, baseline]);
    };
    const service = createProCoverageService({
      account: async id => {
        const u = (await db.query("SELECT id,role FROM users WHERE id=$1", [id])).rows[0];
        return u;
      },
      personal: async u => await readManualProOverride(db, u.id)
        ? { personal: false, legacy: true, source: "manual_override" }
        : resolvePersonalPro(u, u.id === "legacy" ? {} : {
          apple: { product: "com.rosterapp.commissioner_monthly", expires: null },
          google: { product: "player_pro_monthly", expires: "2026-01-01" },
        }),
      teams: async () => [{ id: "team", leagueId: "league" }],
      team: async id => id === "team" ? { id, leagueId: "league" } : undefined,
      seats: async () => [],
      seat: async () => false,
    });
    await t.test("expired purchase history blocks role-only access before granting", async () => {
      assert.equal(await service.hasProFor("manual"), false);
    });
    await t.test("private grant unlocks account, team and client snapshot checks", async () => {
      await grant("manual");
      assert.equal(await role("manual"), "player_pro");
      assert.equal(await service.hasProFor("manual"), true);
      assert.equal(await service.hasProFor("manual", { teamId: "team" }), true);
      const snapshot = (await service.snapshot("manual"))!;
      assert.equal(snapshot.account.source, "manual_override");
      assert.equal(hasAccountPro(snapshot.account), true);
      assert.equal(hasProFor(snapshot, { leagueId: "league" }), true);
      assert.equal(hasProFor(snapshot, { teamId: "missing" }), false);
    });
    await t.test("actual Apple reconciliation preserves grant and does not publish Free metadata", async () => {
      const link = (await db.query("SELECT * FROM apple_purchase_links WHERE user_id='manual'")).rows[0] as ApplePurchaseLink;
      const metadata: string[] = [];
      await reconcileOne(link, {
        pool: { query: db.query.bind(db), connect: async () => ({
          query: async (sql, params) => {
            // Keep the whole disposable fixture inside its outer transaction.
            if (sql === "BEGIN") return db.query("SAVEPOINT apple_reconcile");
            if (sql === "COMMIT") return db.query("RELEASE SAVEPOINT apple_reconcile");
            if (sql === "ROLLBACK") return db.query("ROLLBACK TO SAVEPOINT apple_reconcile");
            return db.query(sql, params);
          },
          release() {},
        }) },
        getSubscriptions: async () => [],
        updateUserMetadata: async (_id, value) => { metadata.push(value); },
      });
      assert.equal(await role("manual"), "player_pro");
      assert.deepEqual(metadata, []);
      assert.equal(await service.hasProFor("manual"), true);
    });
    await t.test("repeated billing downgrades cannot remove the Player Pro floor", async () => {
      for (let i = 0; i < 2; i++) {
        await db.query("UPDATE users SET role='free_tier' WHERE id='manual'");
        assert.equal(await role("manual"), "player_pro");
      }
      assert.equal((await db.query("SELECT billing_role FROM pro_access.manual_overrides WHERE user_id='manual'")).rows[0].billing_role, "free_tier");
    });
    await t.test("active higher billing roles stay higher; revoke restores the billing role", async () => {
      await grant("commissioner", "commissioner");
      assert.equal(await role("commissioner"), "commissioner");
      await db.query("UPDATE pro_access.manual_overrides SET enabled=false WHERE user_id='commissioner'");
      assert.equal(await role("commissioner"), "commissioner");
      await db.query("UPDATE users SET role='commissioner' WHERE id='manual'");
      assert.equal(await role("manual"), "commissioner");
      await db.query("UPDATE users SET role='free_tier' WHERE id='manual'");
    });
    await t.test("disable immediately restores expired access, and re-enable restores the grant", async () => {
      await db.query("UPDATE pro_access.manual_overrides SET enabled=false WHERE user_id='manual'");
      assert.equal(await role("manual"), "free_tier");
      assert.equal(await service.hasProFor("manual"), false);
      await db.query("UPDATE pro_access.manual_overrides SET enabled=true WHERE user_id='manual'");
      assert.equal(await service.hasProFor("manual"), true);
      assert.equal(await role("manual"), "player_pro");
    });
    await t.test("delete removes grant; ordinary expiry and legacy manual grants remain intact", async () => {
      await db.query("DELETE FROM pro_access.manual_overrides WHERE user_id='manual'");
      assert.equal(await role("manual"), "free_tier");
      assert.equal(await service.hasProFor("manual"), false);
      await db.query("UPDATE users SET role='free_tier' WHERE id='ordinary'");
      assert.equal(await role("ordinary"), "free_tier");
      assert.equal(await service.hasProFor("ordinary"), false);
      assert.equal(await service.hasProFor("legacy"), true);
      assert.equal(await role("other"), "free_tier");
    });
    await t.test("browser and provider roles cannot read, self-grant or call privileged functions", async () => {
      for (const who of ["anon", "authenticated", "service_role"]) {
        for (const query of [
          "SELECT * FROM pro_access.manual_overrides",
          "INSERT INTO pro_access.manual_overrides(user_id,reason) VALUES('other','self-grant')",
          "SELECT pro_access.preserve_manual_pro()",
        ]) {
          await db.query("SAVEPOINT denied");
          await db.query(`SET LOCAL ROLE ${who}`);
          await assert.rejects(db.query(query), (e: any) => e.code === "42501");
          await db.query("ROLLBACK TO SAVEPOINT denied");
        }
      }
    });
    await t.test("invalid grants roll back and cannot transfer to another account", async () => {
      await grant("manual");
      await db.query("SAVEPOINT no_transfer");
      await assert.rejects(db.query("UPDATE pro_access.manual_overrides SET user_id='other' WHERE user_id='manual'"));
      await db.query("ROLLBACK TO SAVEPOINT no_transfer");
      assert.equal(await readManualProOverride(db, "other"), false);
    });
    await t.test("grants cannot bypass the existing account retirement guard", async () => {
      await db.query("INSERT INTO public.account_user_merges VALUES('other')");
      await db.query("SAVEPOINT retired");
      await assert.rejects(grant("other"), /Retired account cannot be reactivated/);
      await db.query("ROLLBACK TO SAVEPOINT retired");
      assert.equal(await readManualProOverride(db, "other"), false);
      assert.equal(await role("other"), "free_tier");
    });
  } finally {
    await db.query("ROLLBACK");
    db.release();
    await pool.end();
  }
});

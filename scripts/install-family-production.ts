import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { familyProductionConnection } from "./lib/family-production-db";
import { productionFamilyInstalled } from "../server/productionFamilyRuntime";

const report: Record<string, unknown> = { productionChanged: false, automaticallyEnrolled: 0, childActivationEnabled: false };
let db: Awaited<ReturnType<typeof familyProductionConnection>> | undefined;
try {
  if (!process.argv.includes("--production-read-only") &&
    !process.argv.includes("--apply-owner-authorized-family")) throw new Error("EXPLICIT_MODE_REQUIRED");
  db = await familyProductionConnection();
  const sql = await readFile(new URL("./production/high-school-family.sql", import.meta.url), "utf8");
  const guards = await readFile(new URL("./sql/family-account-guards.sql", import.meta.url), "utf8");
  const manifest = createHash("sha256").update(sql).update(guards).digest("hex");
  await db.query("BEGIN READ ONLY");
  await db.query("SET LOCAL statement_timeout='8s'");
  const existing = await productionFamilyInstalled(db);
  if (existing) {
    const installed = (await db.query("SELECT manifest FROM hs_parent_security.live_version WHERE version=1")).rows[0];
    if (installed?.manifest !== manifest) throw new Error("INSTALLED_MANIFEST_DIFFERS");
  }
  // Catalog-only impact audit: no DOBs, email addresses or game/roster rows.
  report.referencesReviewed = (await db.query(`SELECT count(*)::int AS n FROM pg_depend
    WHERE refobjid IN('public.teams'::regclass,'public.team_memberships'::regclass,'auth.users'::regclass)`)).rows[0].n;
  report.membershipUniqueIndexes = (await db.query(`SELECT pg_get_indexdef(indexrelid) AS definition
    FROM pg_index WHERE indrelid='public.team_memberships'::regclass AND indisunique`)).rows.map(r => r.definition);
  report.originalTablesRlsEnabled = (await db.query(`SELECT bool_and(c.relrowsecurity) AS ready
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN('r','p')`)).rows[0].ready;
  report.authColumnsReady = (await db.query(`WITH required(table_name,column_name) AS(VALUES
    ('users','id'),('users','email'),('users','email_change'),('users','phone'),('users','phone_change'),
    ('users','deleted_at'),('users','email_confirmed_at'),('users','encrypted_password'),('users','updated_at'),
    ('sessions','id'),('sessions','user_id'),('sessions','not_after'),('refresh_tokens','user_id'),
    ('identities','id'),('identities','user_id'),('identities','provider_id'),('identities','provider'),
    ('identities','identity_data'),('mfa_factors','user_id'))
    SELECT NOT EXISTS(SELECT 1 FROM required r WHERE NOT EXISTS(SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema='auth' AND c.table_name=r.table_name AND c.column_name=r.column_name)) AS ready`)).rows[0].ready;
  if (report.authColumnsReady !== true || report.originalTablesRlsEnabled !== true)
    throw new Error("LIVE_SCHEMA_PREREQUISITES_MISSING");
  await db.query("ROLLBACK");
  if (!existing && process.argv.includes("--apply-owner-authorized-family")) {
    // The SQL itself begins a transaction; a failure anywhere, including the
    // final readiness check, rolls back ALL DDL/settings. No trial user writes.
    await db.query("SELECT set_config('roster.family_production','approved-rollout',false)");
    const installation = sql.replace("-- ACCOUNT_GUARDS", guards)
      .replace("-- LIVE_MANIFEST", `INSERT INTO hs_parent_security.live_version VALUES(1,'${manifest}');`);
    await db.query(installation);
    if (!await productionFamilyInstalled(db)) throw new Error("POST_INSTALL_READINESS_FAILED");
    if ((await db.query("SELECT count(*)::int AS n FROM hs_parent_security.accounts")).rows[0].n !== 0)
      throw new Error("UNEXPECTED_ENROLLMENT");
    await db.query("COMMIT");
    report.productionChanged = true;
  }
  report.installed = await productionFamilyInstalled(db);
  if (report.installed) {
    const key = process.env.VITE_SUPABASE_ANON_KEY;
    if (!key) throw new Error("PUBLIC_API_PROBE_CONFIGURATION_MISSING");
    let apiReady = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await fetch(`${new URL(process.env.SUPABASE_URL!).origin}/rest/v1/rpc/roster_family_direct_access_allowed`, {
        headers: { apikey: key, ...(!key.startsWith("sb_publishable_") ? { Authorization: `Bearer ${key}` } : {}) },
        redirect: "error", signal: AbortSignal.timeout(12_000),
      });
      apiReady = response.ok && response.headers.get("x-roster-family-guard") === "1" && await response.json() === true;
      if (apiReady) break;
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 1000));
    }
    report.actualApiGuardObserved = apiReady;
    if (!apiReady) throw new Error("API_GUARD_NOT_OBSERVED");
  }
  report.enrollmentRequiresExplicitReleaseFlag = true;
  report.outcome = "verified";
} catch (error) {
  await db?.query("ROLLBACK").catch(() => {});
  report.outcome = "stopped_without_approving_readiness";
  report.errorCode = typeof (error as any)?.code === "string" ? (error as any).code : "FAMILY_INSTALLATION_NOT_READY";
  process.exitCode = 1;
} finally {
  await db?.end();
  console.log(JSON.stringify(report, null, 2));
}

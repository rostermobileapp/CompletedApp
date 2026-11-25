import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { familyProductionConnection } from "./lib/family-production-db";

const apply = process.argv.includes("--apply-owner-authorized-manual-pro");
let db: Awaited<ReturnType<typeof familyProductionConnection>> | undefined;
let stage = "preflight";
try {
  if (!apply && !process.argv.includes("--production-read-only")) throw Error("EXPLICIT_MODE_REQUIRED");
  db = await familyProductionConnection();
  const sql = await readFile(new URL("./production/manual-pro-overrides.sql", import.meta.url), "utf8");
  const manifest = createHash("sha256").update(sql).digest("hex");
  await db.query(apply ? "BEGIN" : "BEGIN READ ONLY");
  await db.query("SET LOCAL statement_timeout = 10000");
  await db.query("SET LOCAL lock_timeout = 3000");
  // The existing account-retirement trigger inherits public in the path.
  // Fail closed if a browser/provider role can inject objects into that schema.
  const unsafePath = (await db.query(`SELECT EXISTS(
    SELECT 1 FROM (VALUES('anon'),('authenticated'),('service_role')) AS r(name)
    WHERE has_schema_privilege(r.name,'public','CREATE')) AS unsafe`)).rows[0].unsafe;
  if (unsafePath) throw Error("PUBLIC_SCHEMA_CREATE_PRIVILEGES_REQUIRE_REVIEW");
  const target = (await db.query(
    "SELECT id, role FROM public.users WHERE display_id=$1" + (apply ? " FOR UPDATE" : ""), ["U00250"],
  )).rows[0];
  if (!target || !["free_tier", "player_pro"].includes(target.role)) throw Error("TARGET_REVIEW_REQUIRED");
  const exists = (await db.query("SELECT to_regnamespace('pro_access') IS NOT NULL AS installed")).rows[0].installed;
  if (exists) {
    const version = (await db.query("SELECT manifest FROM pro_access.installation WHERE version=1")).rows[0];
    if (version?.manifest !== manifest) throw Error("MANUAL_PRO_INSTALLATION_DIFFERS");
  }
  if (apply) {
    if (!exists) {
      stage = "installation";
      await db.query(sql);
      await db.query("INSERT INTO pro_access.installation VALUES(1,$1)", [manifest]);
    }
    // Explicitly approved complimentary Player Pro grant. No other account is migrated.
    stage = "target_grant";
    await db.query(`INSERT INTO pro_access.manual_overrides(user_id,billing_role,reason)
      VALUES($1,'free_tier',$2) ON CONFLICT(user_id) DO NOTHING`,
      [target.id, "Owner-authorized complimentary Player Pro"]);
    const result = (await db.query(`SELECT u.role, o.enabled FROM public.users u
      JOIN pro_access.manual_overrides o ON o.user_id=u.id WHERE u.id=$1`, [target.id])).rows[0];
    if (result?.role !== "player_pro" || result?.enabled !== true) throw Error("GRANT_NOT_VERIFIED");
    stage = "privacy_verification";
    const privateTables = (await db.query(`SELECT count(*)::int AS count FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='pro_access' AND c.relkind='r' AND c.relrowsecurity`)).rows[0].count;
    if (privateTables !== 2) throw Error("PRIVATE_STORAGE_NOT_VERIFIED");
    const exposed = (await db.query(`SELECT EXISTS(
      SELECT 1 FROM (VALUES('anon'),('authenticated'),('service_role')) AS r(name)
      WHERE has_schema_privilege(r.name,'pro_access','USAGE')
         OR has_table_privilege(r.name,'pro_access.manual_overrides','SELECT')
         OR has_table_privilege(r.name,'pro_access.manual_overrides','INSERT')
         OR has_table_privilege(r.name,'pro_access.manual_overrides','UPDATE')
         OR has_table_privilege(r.name,'pro_access.manual_overrides','DELETE')
         OR has_function_privilege(r.name,'pro_access.preserve_manual_pro()','EXECUTE')
         OR has_function_privilege(r.name,'pro_access.apply_manual_pro()','EXECUTE')
      ) AS exposed`)).rows[0].exposed;
    if (exposed) throw Error("MANUAL_GRANT_ACCESS_EXPOSED");
  }
  await db.query(apply ? "COMMIT" : "ROLLBACK");
  console.log(JSON.stringify({ outcome: "verified", installed: exists || apply, changed: apply && !exists,
    targetGrant: apply, purchaseHistoryChanged: false, otherAccountsGranted: 0, published: false }));
} catch (error) {
  await db?.query("ROLLBACK").catch(() => {});
  console.error(JSON.stringify({ outcome: "stopped", stage, code: (error as any)?.code ?? (error as Error).message }));
  process.exitCode = 1;
} finally {
  await db?.end();
}

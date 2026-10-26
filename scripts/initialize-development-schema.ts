import "../server/runtimeBootstrap";
import { pool } from "../server/db";
import { readFile } from "node:fs/promises";

async function installOptionalAwardSchema() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('roster:development-schema'))");
    const installed = await client.query("SELECT to_regclass('public.team_awards') IS NOT NULL AS ready");
    if (!installed.rows[0].ready) {
      // Reproduce the repository's original opt-in schema only in this new dev
      // project. Keep its feature flag disabled; never copy live grants/artwork.
      for (const filename of ["0044_custom_team_awards.sql", "0044_custom_team_award_storage.sql"]) {
        const source = await readFile(new URL(`../migrations/${filename}`, import.meta.url), "utf8");
        if (!/^BEGIN;\r?$/m.test(source) || !/^COMMIT;\s*$/m.test(source)) {
          throw new Error("Development migration must have an explicit transaction wrapper");
        }
        await client.query(source.replace(/^BEGIN;\r?\n/m, "").replace(/^COMMIT;\s*$/m, ""));
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  await (await import("../server/teamAwardDbInit")).ensureTeamAwardDatabaseUpdates(pool);
}

async function main() {
  if (process.env.NONPRODUCTION_ISOLATED !== "1" || process.env.NODE_ENV !== "development") {
    throw new Error("Explicit initialization requires isolated development");
  }
  const unexpected = await pool.query(`
    SELECT count(*)::int AS count FROM users
    WHERE email IS NULL OR email NOT IN (
      'commissioner@roster-dev.invalid','captain@roster-dev.invalid','player@roster-dev.invalid'
    )
  `);
  if (unexpected.rows[0].count !== 0) throw new Error("Development contains non-fixture users");
  await installOptionalAwardSchema();
  // Explicit schema/metadata setup, never server startup. Operational recovery,
  // purchase reconciliation, historical awards and worker starters are excluded.
  await (await import("../server/referralDbInit")).initReferralDb();
  await (await import("../server/draftDbInit")).initDraftDb();
  await (await import("../server/googleIapClaimsInit")).initGoogleIapClaimsDb();
  await (await import("../server/applePurchaseLinks")).initApplePurchaseLinks();
  await (await import("../server/accountUserMergeDbInit")).initAccountUserMergeDb();
  await (await import("../server/badgeDbInit")).ensureBadgeTables();
  await (await import("../server/triviaDbInit")).ensureTriviaTables();
  await (await import("../server/birthday")).ensureBirthdayTable();
  await (await import("../server/demo")).ensureDemoTables();
  await (await import("../server/beerBadgeEvaluationQueue")).ensureBeerBadgeEvaluationQueue();
  await (await import("../server/lineComboLearningDb")).ensureLineComboLearningDatabase(pool);
  console.info("[Dev schema] Explicit schema and nonpersonal catalog initialization finished; no production workers were started.");
}
main().catch(error => {
  console.error("[Dev schema] Initialization stopped.", { code: error?.code ?? "INITIALIZATION_REFUSED" });
  process.exitCode = 1;
}).finally(() => pool.end());

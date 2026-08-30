/**
 * Rebuild the isolated Demo environment from the current "Mentor 35+" league.
 * This intentionally shares the transactional implementation used by the API;
 * no production IDs, users, or seasons are baked into this script.
 */
import { ensureDemoTables, syncDemo } from "../server/demo";

ensureDemoTables()
  .then(syncDemo)
  .then(({ demoLeagueId, syncedAt, povUsers }) => {
    console.log(`Demo league ${demoLeagueId} synced at ${syncedAt.toISOString()} (${povUsers.length} POV users).`);
    process.exit(0);
  })
  .catch((error) => {
    console.error("Demo sync failed:", error);
    process.exit(1);
  });
/**
 * Backfill sequential display IDs for existing leagues, teams, and users.
 *
 * Format:
 *   Users   → U00001, U00002, … (ordered by createdAt ASC; tobin@rosterhockey.com first)
 *   Leagues → L00001, L00002, … (ordered by createdAt ASC)
 *   Teams   → T00001, T00002, … (ordered by createdAt ASC)
 *
 * Run once:  npx tsx scripts/backfill-display-ids.ts
 *
 * Safe to re-run: skips rows that already have a correctly-formatted ID.
 */

import { db } from '../server/db';
import { users, leagues, teams } from '../shared/schema';
import { asc } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

async function backfill() {
  console.log('=== Backfill sequential display IDs ===\n');

  // ── Users ────────────────────────────────────────────────────────────────
  console.log('Fetching users...');
  const allUsers = await db
    .select({ id: users.id, email: users.email, displayId: users.displayId, createdAt: users.createdAt })
    .from(users)
    .orderBy(asc(users.createdAt));

  // Put tobin@rosterhockey.com first regardless of createdAt order
  const FOUNDER_EMAIL = 'tobin@rosterhockey.com';
  const founderIdx = allUsers.findIndex(u => u.email === FOUNDER_EMAIL);
  if (founderIdx > 0) {
    const [founder] = allUsers.splice(founderIdx, 1);
    allUsers.unshift(founder);
  }

  let userUpdated = 0;
  let userSkipped = 0;
  for (let i = 0; i < allUsers.length; i++) {
    const u = allUsers[i];
    const newId = `U${String(i + 1).padStart(5, '0')}`;
    // Skip if already has correct sequential ID
    if (u.displayId === newId) { userSkipped++; continue; }
    await db.execute(sql`UPDATE users SET display_id = ${newId} WHERE id = ${u.id}`);
    console.log(`  User ${u.email ?? u.id} → ${newId}${u.displayId ? ` (was ${u.displayId})` : ''}`);
    userUpdated++;
  }
  console.log(`Users: ${userUpdated} updated, ${userSkipped} already correct\n`);

  // ── Leagues ──────────────────────────────────────────────────────────────
  console.log('Fetching leagues...');
  const allLeagues = await db
    .select({ id: leagues.id, name: leagues.name, uniqueLeagueId: leagues.uniqueLeagueId, createdAt: leagues.createdAt })
    .from(leagues)
    .orderBy(asc(leagues.createdAt));

  let leagueUpdated = 0;
  let leagueSkipped = 0;
  for (let i = 0; i < allLeagues.length; i++) {
    const l = allLeagues[i];
    const newId = `L${String(i + 1).padStart(5, '0')}`;
    if (l.uniqueLeagueId === newId) { leagueSkipped++; continue; }
    await db.execute(sql`UPDATE leagues SET unique_league_id = ${newId} WHERE id = ${l.id}`);
    console.log(`  League "${l.name}" → ${newId}${l.uniqueLeagueId ? ` (was ${l.uniqueLeagueId})` : ''}`);
    leagueUpdated++;
  }
  console.log(`Leagues: ${leagueUpdated} updated, ${leagueSkipped} already correct\n`);

  // ── Teams ────────────────────────────────────────────────────────────────
  console.log('Fetching teams...');
  const allTeams = await db
    .select({ id: teams.id, name: teams.name, uniqueTeamId: teams.uniqueTeamId, createdAt: teams.createdAt })
    .from(teams)
    .orderBy(asc(teams.createdAt));

  let teamUpdated = 0;
  let teamSkipped = 0;
  for (let i = 0; i < allTeams.length; i++) {
    const t = allTeams[i];
    const newId = `T${String(i + 1).padStart(5, '0')}`;
    if (t.uniqueTeamId === newId) { teamSkipped++; continue; }
    await db.execute(sql`UPDATE teams SET unique_team_id = ${newId} WHERE id = ${t.id}`);
    console.log(`  Team "${t.name}" → ${newId}${t.uniqueTeamId ? ` (was ${t.uniqueTeamId})` : ''}`);
    teamUpdated++;
  }
  console.log(`Teams: ${teamUpdated} updated, ${teamSkipped} already correct\n`);

  console.log('=== Backfill complete ===');
  process.exit(0);
}

backfill().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});

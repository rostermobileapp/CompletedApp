/**
 * seed-demo-season.ts
 *
 * Creates a "Demo - Winter 2025" duplicate season inside the "Mentor 35+" league.
 * All data is read dynamically from the source league / source season — no hardcoded rosters.
 *
 * Rules:
 *   - Reads teams that belong to the source season (or are league-level with no season,
 *     which is how the Mentor 35+ teams are currently structured in the DB).
 *   - Every league member EXCEPT Tobin Kern gets a fresh placeholder account
 *     (email: firstname.lastname.<timestamp>@placeholder.roster).
 *   - Tobin Kern (commissioner) is the only real user in the demo season.
 *   - Team captains who are NOT approved league members get captain_id = null in the demo;
 *     no extra users are created for them.
 *   - All inserts run inside a single transaction — a failure at any step rolls back
 *     completely, preventing partial data from blocking the idempotency guard.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../shared/schema';
import { eq, and, isNull, or } from 'drizzle-orm';

const DEST_URL = process.env.DATABASE_URL!;

// Source league / season identifiers
const LEAGUE_ID = '8f4c9613-80e3-41d4-a940-f69893268687';
const SOURCE_SEASON_ID = 'd2af8ac6-199a-45d8-abf4-825524cf1bb3'; // "Winter 2025"

// Expected team names in this league — used to guard against accidental duplication
// of any league-level teams that shouldn't be included.
const EXPECTED_SOURCE_TEAMS = new Set([
  'Orange', 'Mavericks', "Puck'n Bucks", 'Lumberjacks', 'Red Barons',
  'Muffin Men', 'Red Barrons', 'RW&B', 'Gold', 'Lot Lizards',
]);

const TOBIN_KERN_ID = '005a021a-9cd1-4e15-85c0-95a4fcdb01fa';
const DEMO_SEASON_NAME = 'Demo - Winter 2025';

let tsCounter = Date.now();
function nextTs(): number {
  return tsCounter++;
}

function placeholderEmail(firstName: string, lastName: string): string {
  const normalize = (s: string) =>
    s.toLowerCase().trim().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
  const fn = normalize(firstName) || 'player';
  const ln = normalize(lastName);
  return `${fn}${ln ? '.' + ln : ''}.${nextTs()}@placeholder.roster`;
}

function generateDisplayId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

async function seedDemoSeason() {
  console.log('🚀 Starting Demo Season Seeding...\n');

  const client = postgres(DEST_URL);
  const db = drizzle(client, { schema });

  // ── Guard: prevent duplicate runs ──────────────────────────────────────────
  const existing = await db
    .select()
    .from(schema.seasons)
    .where(and(eq(schema.seasons.leagueId, LEAGUE_ID), eq(schema.seasons.name, DEMO_SEASON_NAME)));

  if (existing.length > 0) {
    console.log(`⚠️  Demo season "${DEMO_SEASON_NAME}" already exists (ID: ${existing[0].id}). Aborting.`);
    await client.end();
    return;
  }

  // ── Step 1: Read source data (outside transaction) ─────────────────────────
  console.log('1️⃣  Reading source data...');

  // Source teams: league-level (season_id IS NULL) or linked to source season,
  // filtered to only the known expected team names to prevent accidental inclusion
  // of any other teams that may exist in the league.
  const allCandidateTeams = await db
    .select()
    .from(schema.teams)
    .where(
      and(
        eq(schema.teams.leagueId, LEAGUE_ID),
        or(isNull(schema.teams.seasonId), eq(schema.teams.seasonId, SOURCE_SEASON_ID))
      )
    );

  const sourceTeams = allCandidateTeams.filter(t => EXPECTED_SOURCE_TEAMS.has(t.name));

  // Assert exact expected count before doing any writes
  if (sourceTeams.length !== EXPECTED_SOURCE_TEAMS.size) {
    const found = sourceTeams.map(t => t.name).join(', ');
    throw new Error(
      `Expected ${EXPECTED_SOURCE_TEAMS.size} source teams but found ${sourceTeams.length}. ` +
      `Found: ${found}`
    );
  }

  const leagueMembers = await db
    .select()
    .from(schema.leagueMemberships)
    .where(and(eq(schema.leagueMemberships.leagueId, LEAGUE_ID), eq(schema.leagueMemberships.status, 'approved')));

  const memberUserRecords: schema.User[] = [];
  for (const m of leagueMembers) {
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, m.userId));
    if (u) memberUserRecords.push(u);
  }
  const userById = new Map(memberUserRecords.map(u => [u.id, u]));

  const allTeamMemberships: schema.TeamMembership[] = [];
  for (const team of sourceTeams) {
    const memberships = await db
      .select()
      .from(schema.teamMemberships)
      .where(eq(schema.teamMemberships.teamId, team.id));
    allTeamMemberships.push(...memberships);
  }

  const nonTobinMembers = leagueMembers.filter(m => m.userId !== TOBIN_KERN_ID);

  console.log(`   Source season ID: ${SOURCE_SEASON_ID}`);
  console.log(`   Teams: ${sourceTeams.length} (${sourceTeams.map(t => t.name).join(', ')})`);
  console.log(`   League members: ${leagueMembers.length} (${nonTobinMembers.length} → placeholders, 1 = Tobin)`);
  console.log(`   Source team memberships: ${allTeamMemberships.length}`);

  // ── Steps 2-6 inside a single transaction ─────────────────────────────────
  let seasonId!: string;
  const userIdMap = new Map<string, string>();
  userIdMap.set(TOBIN_KERN_ID, TOBIN_KERN_ID);

  await db.transaction(async (tx) => {
    // 2. Create demo season
    console.log('\n2️⃣  Creating demo season...');
    const [season] = await tx
      .insert(schema.seasons)
      .values({
        id: crypto.randomUUID(),
        name: DEMO_SEASON_NAME,
        leagueId: LEAGUE_ID,
        isActive: true,
      })
      .returning();
    seasonId = season.id;
    console.log(`   ✅ Season: "${season.name}" (${season.id})`);

    // 3. Create placeholder users
    console.log('\n3️⃣  Creating placeholder users...');
    let placeholderCount = 0;
    for (const lm of leagueMembers) {
      if (lm.userId === TOBIN_KERN_ID) continue;

      const srcUser = userById.get(lm.userId);
      const firstName = (srcUser?.firstName ?? 'Player').trim();
      const lastName = (srcUser?.lastName ?? '').trim();

      const newUserId = crypto.randomUUID();
      userIdMap.set(lm.userId, newUserId);

      await tx.insert(schema.users).values({
        id: newUserId,
        displayId: generateDisplayId(),
        email: placeholderEmail(firstName, lastName),
        firstName,
        lastName,
        role: 'free_tier',
        onboardingCompleted: false,
        isPrimaryCommissioner: false,
      });
      placeholderCount++;
    }
    console.log(`   ✅ Created ${placeholderCount} placeholder users`);

    // 4. Create demo teams
    console.log('\n4️⃣  Creating demo teams...');
    const teamIdMap = new Map<string, string>();

    for (const srcTeam of sourceTeams) {
      const newTeamId = crypto.randomUUID();
      teamIdMap.set(srcTeam.id, newTeamId);

      // Captain resolution:
      //   Tobin → real ID | league member → placeholder ID | non-member → null
      let demoCaptainId: string | null = null;
      if (srcTeam.captainId) {
        if (srcTeam.captainId === TOBIN_KERN_ID) {
          demoCaptainId = TOBIN_KERN_ID;
        } else if (userIdMap.has(srcTeam.captainId)) {
          demoCaptainId = userIdMap.get(srcTeam.captainId)!;
        }
      }

      await tx.insert(schema.teams).values({
        id: newTeamId,
        name: srcTeam.name,
        leagueId: LEAGUE_ID,
        seasonId: season.id,
        captainId: demoCaptainId,
        creatorId: TOBIN_KERN_ID,
        wins: 0,
        losses: 0,
        ties: 0,
        goalsFor: 0,
        goalsAgainst: 0,
      });

      const captainNote = demoCaptainId
        ? ` (captain: ${demoCaptainId === TOBIN_KERN_ID ? 'Tobin [real]' : 'placeholder'})`
        : ' (no captain)';
      console.log(`   ✅ Team: "${srcTeam.name}"${captainNote}`);
    }

    // 5. Add league memberships for placeholder users
    console.log('\n5️⃣  Adding league memberships...');
    let leagueMembershipCount = 0;
    for (const srcLm of leagueMembers) {
      if (srcLm.userId === TOBIN_KERN_ID) continue;

      const newUserId = userIdMap.get(srcLm.userId);
      if (!newUserId) continue;

      await tx.insert(schema.leagueMemberships).values({
        id: crypto.randomUUID(),
        userId: newUserId,
        leagueId: LEAGUE_ID,
        status: 'approved',
        approvedAt: new Date(),
        approvedBy: TOBIN_KERN_ID,
        isGoalie: srcLm.isGoalie,
        isSkater: srcLm.isSkater,
        leagueRole: 'free_tier',
        position: srcLm.position,
        jerseyNumber: srcLm.jerseyNumber,
        skillLevel: srcLm.skillLevel,
      }).onConflictDoNothing();
      leagueMembershipCount++;
    }
    console.log(`   ✅ Added ${leagueMembershipCount} placeholder league memberships`);
    console.log(`   ℹ️  Tobin Kern's existing league membership is unchanged`);

    // 6. Add team memberships
    console.log('\n6️⃣  Adding team memberships...');
    let teamMembershipCount = 0;
    let skipped = 0;
    for (const srcTm of allTeamMemberships) {
      const newUserId = userIdMap.get(srcTm.userId);
      const newTeamId = teamIdMap.get(srcTm.teamId);

      if (!newUserId || !newTeamId) {
        skipped++;
        continue;
      }

      await tx.insert(schema.teamMemberships).values({
        id: crypto.randomUUID(),
        userId: newUserId,
        teamId: newTeamId,
        status: 'approved',
        isCaptain: srcTm.isCaptain,
        approvedBy: TOBIN_KERN_ID,
        position: srcTm.position,
        jerseyNumber: srcTm.jerseyNumber,
        skillLevel: srcTm.skillLevel,
      }).onConflictDoNothing();
      teamMembershipCount++;
    }
    if (skipped > 0) {
      console.log(`   ⚠️  Skipped ${skipped} record(s) (user not a league member)`);
    }
    console.log(`   ✅ Added ${teamMembershipCount} team memberships`);
  });

  // ── Step 7: Post-seed verification (reads; outside transaction) ───────────
  console.log('\n7️⃣  Running verification...');

  const demoTeams = await db
    .select()
    .from(schema.teams)
    .where(eq(schema.teams.seasonId, seasonId));

  const tobinTeamMembership = await db
    .select()
    .from(schema.teamMemberships)
    .where(eq(schema.teamMemberships.userId, TOBIN_KERN_ID));

  // Filter to only demo season team memberships
  const demoTeamIds = new Set(demoTeams.map(t => t.id));
  const tobinDemoMemberships = tobinTeamMembership.filter(tm => demoTeamIds.has(tm.teamId));

  const teamCountOk = demoTeams.length === EXPECTED_SOURCE_TEAMS.size;
  const teamNamesOk = demoTeams.every(t => EXPECTED_SOURCE_TEAMS.has(t.name));
  const tobinIsCaptain = tobinDemoMemberships.some(tm => tm.isCaptain);
  const tobinInMavericks = tobinDemoMemberships.length > 0;

  const allGreen = teamCountOk && teamNamesOk && tobinIsCaptain;

  console.log(`   ${teamCountOk ? '✅' : '❌'} Teams: ${demoTeams.length} / ${EXPECTED_SOURCE_TEAMS.size} expected`);
  console.log(`   ${teamNamesOk ? '✅' : '❌'} All expected team names present`);
  console.log(`   ${tobinInMavericks ? '✅' : '❌'} Tobin Kern has team membership in demo season`);
  console.log(`   ${tobinIsCaptain ? '✅' : '❌'} Tobin Kern has is_captain = true`);

  if (!allGreen) {
    throw new Error('Post-seed verification failed — see above');
  }

  await client.end();

  console.log('\n✨ Demo season seeding completed successfully!');
  console.log(`\n📊 Summary:`);
  console.log(`   Season: "${DEMO_SEASON_NAME}" (ID: ${seasonId})`);
  console.log(`   Teams: ${demoTeams.length}`);
  console.log(`   Placeholder users: ${nonTobinMembers.length}`);
  console.log(`   Real users: 1 (Tobin Kern — commissioner)`);
}

seedDemoSeason().catch(console.error);

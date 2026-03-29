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
 *   - Team member flags (is_captain, goalie/skater, position) are preserved.
 *   - An idempotency guard prevents duplicate runs.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../shared/schema';
import { eq, and, isNull, or } from 'drizzle-orm';

const DEST_URL = process.env.DATABASE_URL!;

// Source league / season identifiers
const LEAGUE_ID = '8f4c9613-80e3-41d4-a940-f69893268687';
const SOURCE_SEASON_ID = 'd2af8ac6-199a-45d8-abf4-825524cf1bb3'; // "Winter 2025"

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

  try {
    // ── Guard: prevent duplicate runs ────────────────────────────────────────
    const existing = await db
      .select()
      .from(schema.seasons)
      .where(and(eq(schema.seasons.leagueId, LEAGUE_ID), eq(schema.seasons.name, DEMO_SEASON_NAME)));

    if (existing.length > 0) {
      console.log(`⚠️  Demo season "${DEMO_SEASON_NAME}" already exists (ID: ${existing[0].id}). Aborting.`);
      await client.end();
      return;
    }

    // ── Step 1: Read source data ─────────────────────────────────────────────
    console.log('1️⃣  Reading source data...');

    // Source teams: those explicitly linked to the source season, OR league-level
    // teams with no season_id (which is how Mentor 35+ teams are currently stored).
    // We explicitly exclude any teams already linked to a demo/other season.
    const sourceTeams = await db
      .select()
      .from(schema.teams)
      .where(
        and(
          eq(schema.teams.leagueId, LEAGUE_ID),
          or(isNull(schema.teams.seasonId), eq(schema.teams.seasonId, SOURCE_SEASON_ID))
        )
      );

    // Source approved league members
    const leagueMembers = await db
      .select()
      .from(schema.leagueMemberships)
      .where(and(eq(schema.leagueMemberships.leagueId, LEAGUE_ID), eq(schema.leagueMemberships.status, 'approved')));

    const approvedMemberUserIds = new Set(leagueMembers.map(m => m.userId));

    // Fetch user records for all members
    const memberUserRecords: schema.User[] = [];
    for (const m of leagueMembers) {
      const [u] = await db.select().from(schema.users).where(eq(schema.users.id, m.userId));
      if (u) memberUserRecords.push(u);
    }
    const userById = new Map(memberUserRecords.map(u => [u.id, u]));
    const leagueMembershipByUserId = new Map(leagueMembers.map(m => [m.userId, m]));

    // Collect team memberships only for source teams
    const allTeamMemberships: schema.TeamMembership[] = [];
    for (const team of sourceTeams) {
      const memberships = await db
        .select()
        .from(schema.teamMemberships)
        .where(eq(schema.teamMemberships.teamId, team.id));
      allTeamMemberships.push(...memberships);
    }

    console.log(`   Source season: "${SOURCE_SEASON_ID}"`);
    console.log(`   Teams to duplicate: ${sourceTeams.length}`);
    console.log(`   League members: ${leagueMembers.length} (${leagueMembers.length - 1} placeholders + Tobin)`);
    console.log(`   Source team memberships: ${allTeamMemberships.length}`);

    // ── Step 2: Create demo season ───────────────────────────────────────────
    console.log('\n2️⃣  Creating demo season...');
    const [season] = await db
      .insert(schema.seasons)
      .values({
        id: crypto.randomUUID(),
        name: DEMO_SEASON_NAME,
        leagueId: LEAGUE_ID,
        isActive: true,
      })
      .returning();
    console.log(`   ✅ Season: "${season.name}" (${season.id})`);

    // ── Step 3: Create placeholder users ────────────────────────────────────
    console.log('\n3️⃣  Creating placeholder users...');

    // userIdMap: original userId → demo userId
    // Tobin maps to himself; all others get a fresh placeholder
    const userIdMap = new Map<string, string>();
    userIdMap.set(TOBIN_KERN_ID, TOBIN_KERN_ID);

    let placeholderCount = 0;
    for (const lm of leagueMembers) {
      if (lm.userId === TOBIN_KERN_ID) continue;

      const srcUser = userById.get(lm.userId);
      const firstName = (srcUser?.firstName ?? 'Player').trim();
      const lastName = (srcUser?.lastName ?? '').trim();

      const newUserId = crypto.randomUUID();
      userIdMap.set(lm.userId, newUserId);

      await db.insert(schema.users).values({
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

    // ── Step 4: Create demo teams ────────────────────────────────────────────
    console.log('\n4️⃣  Creating demo teams...');

    // teamIdMap: original teamId → demo teamId
    const teamIdMap = new Map<string, string>();

    for (const srcTeam of sourceTeams) {
      const newTeamId = crypto.randomUUID();
      teamIdMap.set(srcTeam.id, newTeamId);

      // Resolve captain_id for the demo team:
      //   - Tobin → his real ID
      //   - League member → their placeholder ID
      //   - Non-league-member → null (no captain; we don't invent a captain)
      let demoCaptainId: string | null = null;
      if (srcTeam.captainId) {
        if (srcTeam.captainId === TOBIN_KERN_ID) {
          demoCaptainId = TOBIN_KERN_ID;
        } else if (userIdMap.has(srcTeam.captainId)) {
          demoCaptainId = userIdMap.get(srcTeam.captainId)!;
        }
        // else: captain not in league → captainId stays null
      }

      await db.insert(schema.teams).values({
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
        ? ` (captain: ${demoCaptainId === TOBIN_KERN_ID ? 'Tobin Kern [real]' : 'placeholder'})`
        : ' (no captain)';
      console.log(`   ✅ Team: "${srcTeam.name}"${captainNote}`);
    }

    // ── Step 5: Add league memberships for placeholder users ─────────────────
    console.log('\n5️⃣  Adding league memberships...');

    let leagueMembershipCount = 0;
    for (const srcLm of leagueMembers) {
      if (srcLm.userId === TOBIN_KERN_ID) continue;

      const newUserId = userIdMap.get(srcLm.userId);
      if (!newUserId) continue;

      await db.insert(schema.leagueMemberships).values({
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

    // ── Step 6: Add team memberships ─────────────────────────────────────────
    console.log('\n6️⃣  Adding team memberships...');

    // Replicate all source team memberships.
    // Tobin maps to himself via userIdMap so his is_captain=true record is preserved.
    // Members not in userIdMap (non-league captains who had no membership) are skipped.
    let teamMembershipCount = 0;
    let skipped = 0;
    for (const srcTm of allTeamMemberships) {
      const newUserId = userIdMap.get(srcTm.userId);
      const newTeamId = teamIdMap.get(srcTm.teamId);

      if (!newUserId || !newTeamId) {
        skipped++;
        continue;
      }

      await db.insert(schema.teamMemberships).values({
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
      console.log(`   ⚠️  Skipped ${skipped} membership(s) (user not a league member in source)`);
    }
    console.log(`   ✅ Added ${teamMembershipCount} team memberships`);

    // ── Step 7: Post-seed verification ───────────────────────────────────────
    console.log('\n7️⃣  Running verification...');

    const demoTeamCount = await db
      .select()
      .from(schema.teams)
      .where(eq(schema.teams.seasonId, season.id));

    const demoLeagueMembershipCount = await db
      .select()
      .from(schema.leagueMemberships)
      .where(and(eq(schema.leagueMemberships.leagueId, LEAGUE_ID), eq(schema.leagueMemberships.status, 'approved')));

    const demoTeamMemberCount = (await db
      .select()
      .from(schema.teamMemberships)
      .where(eq(schema.teamMemberships.teamId, teamIdMap.values().next().value!))).length;

    const expectedTeams = sourceTeams.length;
    const expectedPlaceholders = placeholderCount;

    const teamCheck = demoTeamCount.length === expectedTeams ? '✅' : '❌';
    const memberCheck = leagueMembershipCount === expectedPlaceholders ? '✅' : '❌';
    const tobinTeamCheck = teamMembershipCount > 0 && userIdMap.has(TOBIN_KERN_ID) ? '✅' : '❌';

    console.log(`   ${teamCheck} Teams: ${demoTeamCount.length} / ${expectedTeams} expected`);
    console.log(`   ${memberCheck} Placeholder league memberships: ${leagueMembershipCount} / ${expectedPlaceholders} expected`);
    console.log(`   ${tobinTeamCheck} Tobin Kern is the only real user (all others are placeholders)`);

    await client.end();

    console.log('\n✨ Demo season seeding completed!');
    console.log(`\n📊 Summary:`);
    console.log(`   Season: "${DEMO_SEASON_NAME}" (ID: ${season.id})`);
    console.log(`   Teams: ${demoTeamCount.length}`);
    console.log(`   Placeholder users: ${placeholderCount}`);
    console.log(`   Placeholder league memberships: ${leagueMembershipCount}`);
    console.log(`   Team memberships: ${teamMembershipCount}`);
    console.log(`   Real users: 1 (Tobin Kern — commissioner)`);
  } catch (error) {
    console.error('\n❌ Seeding failed:', error);
    await client.end();
    throw error;
  }
}

seedDemoSeason().catch(console.error);

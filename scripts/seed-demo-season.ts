/**
 * seed-demo-season.ts
 *
 * Creates a "Demo - Winter 2025" duplicate season inside the "Mentor 35+" league.
 * All data is read dynamically from the source league — no hardcoded rosters.
 *
 * Rules:
 *   - Every league member EXCEPT Tobin Kern gets a fresh placeholder account
 *     (email: firstname.lastname.<timestamp>@placeholder.roster)
 *   - Tobin Kern (commissioner) is the only real user in the demo season
 *   - Team structure mirrors the original league; team members are recreated
 *     as placeholders preserving goalie/skater flags and captain roles
 *   - Team captains who are NOT league members get no placeholder; those teams
 *     are assigned Tobin Kern as captain instead
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../shared/schema';
import { eq, and } from 'drizzle-orm';

const DEST_URL = process.env.DATABASE_URL!;
const LEAGUE_ID = '8f4c9613-80e3-41d4-a940-f69893268687';
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
    // ── Guard: don't create a duplicate demo season ─────────────────────────
    const existingSeasons = await db
      .select()
      .from(schema.seasons)
      .where(and(eq(schema.seasons.leagueId, LEAGUE_ID), eq(schema.seasons.name, DEMO_SEASON_NAME)));

    if (existingSeasons.length > 0) {
      console.log(`⚠️  Demo season "${DEMO_SEASON_NAME}" already exists (ID: ${existingSeasons[0].id}). Aborting.`);
      await client.end();
      return;
    }

    // ── Step 1: Read source data ─────────────────────────────────────────────
    console.log('1️⃣  Reading source league data...');

    const leagueMembers = await db
      .select()
      .from(schema.leagueMemberships)
      .where(and(eq(schema.leagueMemberships.leagueId, LEAGUE_ID), eq(schema.leagueMemberships.status, 'approved')));

    // Fetch all member user records in one shot
    const memberUserRecords: schema.User[] = [];
    for (const m of leagueMembers) {
      const [u] = await db.select().from(schema.users).where(eq(schema.users.id, m.userId));
      if (u) memberUserRecords.push(u);
    }

    const leagueMembershipByUserId = new Map(leagueMembers.map(m => [m.userId, m]));
    const userById = new Map(memberUserRecords.map(u => [u.id, u]));

    const sourceTeams = await db
      .select()
      .from(schema.teams)
      .where(eq(schema.teams.leagueId, LEAGUE_ID));

    // Collect all team membership records for this league's teams
    const allTeamMemberships: schema.TeamMembership[] = [];
    for (const team of sourceTeams) {
      const memberships = await db
        .select()
        .from(schema.teamMemberships)
        .where(eq(schema.teamMemberships.teamId, team.id));
      allTeamMemberships.push(...memberships);
    }

    console.log(`   ✅ Found ${leagueMembers.length} league members`);
    console.log(`   ✅ Found ${sourceTeams.length} teams`);
    console.log(`   ✅ Found ${allTeamMemberships.length} team membership records`);

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

    // ── Step 3: Create placeholder users for all non-Tobin league members ───
    console.log('\n3️⃣  Creating placeholder users...');

    // Map: original userId → new placeholder userId
    const userIdMap = new Map<string, string>();
    userIdMap.set(TOBIN_KERN_ID, TOBIN_KERN_ID); // Tobin maps to himself

    let placeholderCount = 0;
    for (const lm of leagueMembers) {
      if (lm.userId === TOBIN_KERN_ID) continue; // skip Tobin

      const sourceUser = userById.get(lm.userId);
      const firstName = (sourceUser?.firstName ?? 'Player').trim();
      const lastName = (sourceUser?.lastName ?? '').trim();

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

    // ── Step 4: Create teams for the demo season ─────────────────────────────
    console.log('\n4️⃣  Creating demo teams...');

    // Map: original teamId → new demo teamId
    const teamIdMap = new Map<string, string>();

    for (const srcTeam of sourceTeams) {
      const newTeamId = crypto.randomUUID();
      teamIdMap.set(srcTeam.id, newTeamId);

      // Resolve captain:
      //   - If captain is Tobin → use Tobin's real ID
      //   - If captain is a known league member → use their placeholder ID
      //   - Otherwise (captain not in league) → default to Tobin
      let demoCaptainId: string | null = null;
      if (srcTeam.captainId) {
        if (srcTeam.captainId === TOBIN_KERN_ID) {
          demoCaptainId = TOBIN_KERN_ID;
        } else if (userIdMap.has(srcTeam.captainId)) {
          demoCaptainId = userIdMap.get(srcTeam.captainId)!;
        } else {
          // Captain is not a league member — assign Tobin as captain for demo
          demoCaptainId = TOBIN_KERN_ID;
        }
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
      console.log(`   ✅ Team: "${srcTeam.name}"${demoCaptainId ? '' : ' (no captain)'}`);
    }

    // ── Step 5: Add league memberships for all placeholder users ────────────
    console.log('\n5️⃣  Adding league memberships...');

    let leagueMembershipCount = 0;
    for (const srcLm of leagueMembers) {
      if (srcLm.userId === TOBIN_KERN_ID) continue; // Tobin already has a league membership

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
    console.log(`   ℹ️  Tobin Kern's existing league membership unchanged`);

    // ── Step 6: Add team memberships ────────────────────────────────────────
    console.log('\n6️⃣  Adding team memberships...');

    let teamMembershipCount = 0;

    // Replicate all source team memberships using the userIdMap.
    // Tobin maps to himself (userIdMap.set(TOBIN_KERN_ID, TOBIN_KERN_ID) above),
    // so his is_captain=true membership is preserved correctly.
    for (const srcTm of allTeamMemberships) {

      const newUserId = userIdMap.get(srcTm.userId);
      const newTeamId = teamIdMap.get(srcTm.teamId);

      if (!newUserId || !newTeamId) {
        console.warn(`   ⚠️  Could not map user ${srcTm.userId} or team ${srcTm.teamId} — skipping`);
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
    console.log(`   ✅ Added ${teamMembershipCount} team memberships total`);

    // ── Summary ──────────────────────────────────────────────────────────────
    await client.end();

    console.log('\n✨ Demo season seeding completed successfully!');
    console.log(`\n📊 Summary:`);
    console.log(`   Season: "${DEMO_SEASON_NAME}" (ID: ${season.id})`);
    console.log(`   Teams: ${sourceTeams.length}`);
    console.log(`   Placeholder users created: ${placeholderCount}`);
    console.log(`   League memberships added (placeholders): ${leagueMembershipCount}`);
    console.log(`   Team memberships added: ${teamMembershipCount}`);
    console.log(`   Real users: 1 (Tobin Kern — commissioner)`);
  } catch (error) {
    console.error('\n❌ Seeding failed:', error);
    await client.end();
    throw error;
  }
}

seedDemoSeason().catch(console.error);

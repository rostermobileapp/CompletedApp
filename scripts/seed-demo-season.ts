import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../shared/schema';
import { eq } from 'drizzle-orm';

const DEST_URL = process.env.DATABASE_URL!;

const LEAGUE_ID = '8f4c9613-80e3-41d4-a940-f69893268687';
const TOBIN_KERN_ID = '005a021a-9cd1-4e15-85c0-95a4fcdb01fa';

const TS = Date.now();
let tsOffset = 0;

function nextTs() {
  return TS + tsOffset++;
}

function placeholderEmail(firstName: string, lastName: string): string {
  const fn = firstName.toLowerCase().trim().replace(/\s+/g, '');
  const ln = lastName.toLowerCase().trim().replace(/\s+/g, '');
  return `${fn}.${ln}.${nextTs()}@placeholder.roster`;
}

function generateDisplayId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

type PlayerDef = {
  firstName: string;
  lastName: string;
  isGoalie: boolean;
  isSkater: boolean;
};

type TeamDef = {
  key: string;
  name: string;
  captainKey: string | null;
};

const PLAYERS: Record<string, PlayerDef> = {
  alexander_mahvi:   { firstName: 'Alexander', lastName: 'Mahvi',     isGoalie: false, isSkater: true  },
  andrew_marino:     { firstName: 'Andrew',    lastName: 'Marino',    isGoalie: true,  isSkater: false },
  brad_zicarelli:    { firstName: 'Brad',      lastName: 'Zicarelli', isGoalie: false, isSkater: true  },
  brendan_maynard:   { firstName: 'Brendan',   lastName: 'Maynard',   isGoalie: false, isSkater: true  },
  brian_sellers:     { firstName: 'Brian',     lastName: 'Sellers',   isGoalie: false, isSkater: true  },
  brian_weinkamer:   { firstName: 'Brian',     lastName: 'Weinkamer', isGoalie: false, isSkater: true  },
  bryan_siersma:     { firstName: 'Bryan',     lastName: 'Siersma',   isGoalie: false, isSkater: true  },
  cale_makar:        { firstName: 'Cale',      lastName: 'Makar',     isGoalie: false, isSkater: true  },
  chris_novicky:     { firstName: 'Chris',     lastName: 'Novicky',   isGoalie: false, isSkater: true  },
  connor_robbins:    { firstName: 'Connor',    lastName: 'Robbins',   isGoalie: false, isSkater: true  },
  curtis_rice:       { firstName: 'Curtis',    lastName: 'Rice',      isGoalie: true,  isSkater: false },
  dan_lieske:        { firstName: 'Dan',       lastName: 'Lieske',    isGoalie: false, isSkater: true  },
  derek_cogar:       { firstName: 'Derek',     lastName: 'Cogar',     isGoalie: false, isSkater: true  },
  donny_urbancic:    { firstName: 'Donny',     lastName: 'Urbancic',  isGoalie: false, isSkater: true  },
  eddie_bolden:      { firstName: 'Eddie',     lastName: 'Bolden',    isGoalie: false, isSkater: true  },
  gavin_haase:       { firstName: 'Gavin',     lastName: 'Haase',     isGoalie: false, isSkater: true  },
  gerry_zadnik:      { firstName: 'Gerry',     lastName: 'Zadnik',    isGoalie: false, isSkater: true  },
  greg_kern:         { firstName: 'Greg',      lastName: 'Kern',      isGoalie: false, isSkater: true  },
  jason_hallums:     { firstName: 'Jason',     lastName: 'Hallums',   isGoalie: true,  isSkater: false },
  jason_wiess:       { firstName: 'Jason',     lastName: 'Wiess',     isGoalie: false, isSkater: true  },
  justin_ropos:      { firstName: 'Justin',    lastName: 'Ropos',     isGoalie: false, isSkater: true  },
  justin_schmidt:    { firstName: 'Justin',    lastName: 'Schmidt',   isGoalie: false, isSkater: true  },
  ken_sable:         { firstName: 'Ken',       lastName: 'Sable',     isGoalie: false, isSkater: true  },
  kyle_van:          { firstName: 'Kyle',      lastName: 'Van',       isGoalie: false, isSkater: true  },
  ludwiga9:          { firstName: 'Ludwiga',   lastName: '',          isGoalie: false, isSkater: true  },
  mark_tratar:       { firstName: 'Mark',      lastName: 'Tratar',    isGoalie: false, isSkater: true  },
  matt_belaj:        { firstName: 'Matt',      lastName: 'Belaj',     isGoalie: false, isSkater: true  },
  michael_verch:     { firstName: 'Michael',   lastName: 'Verch',     isGoalie: false, isSkater: true  },
  mike_campbell:     { firstName: 'Mike',      lastName: 'Campbell',  isGoalie: false, isSkater: true  },
  mike_jeffrey:      { firstName: 'Mike',      lastName: 'Jeffrey',   isGoalie: false, isSkater: true  },
  mike_riebe:        { firstName: 'Mike',      lastName: 'Riebe',     isGoalie: false, isSkater: true  },
  mike_van:          { firstName: 'Mike',      lastName: 'Van',       isGoalie: false, isSkater: true  },
  nick_ciani:        { firstName: 'Nick',      lastName: 'Ciani',     isGoalie: false, isSkater: true  },
  pat_kramer:        { firstName: 'Pat',       lastName: 'Kramer',    isGoalie: false, isSkater: true  },
  pat_mcarthur:      { firstName: 'Pat',       lastName: 'McArthur',  isGoalie: false, isSkater: true  },
  patrick_david:     { firstName: 'Patrick',   lastName: 'David',     isGoalie: false, isSkater: true  },
  rico_piccirillo:   { firstName: 'Rico',      lastName: 'Piccirillo',isGoalie: false, isSkater: true  },
  rob_drago:         { firstName: 'Rob',       lastName: 'Drago',     isGoalie: false, isSkater: true  },
  rob_mackinlay:     { firstName: 'Rob',       lastName: 'MacKinlay', isGoalie: false, isSkater: true  },
  shawn_sadler:      { firstName: 'Shawn',     lastName: 'Sadler',    isGoalie: false, isSkater: true  },
  tj_kern:           { firstName: 'TJ',        lastName: 'Kern',      isGoalie: false, isSkater: true  },
  tristan_neeb:      { firstName: 'Tristan',   lastName: 'Neeb',      isGoalie: false, isSkater: true  },
  wes_sneek:         { firstName: 'Wes',       lastName: 'Sneek',     isGoalie: false, isSkater: true  },
  william_white:     { firstName: 'William',   lastName: 'White',     isGoalie: false, isSkater: true  },
  // Team captains who aren't league members
  mike_elrod:        { firstName: 'Mike',      lastName: 'Elrod',     isGoalie: false, isSkater: true  },
  barry_mcslapper:   { firstName: 'Barry',     lastName: 'McSlapper', isGoalie: false, isSkater: true  },
  cam_mcstick:       { firstName: 'Cam',       lastName: 'McStickTap',isGoalie: false, isSkater: true  },
};

const TEAMS: TeamDef[] = [
  { key: 'orange',      name: 'Orange',       captainKey: 'mike_jeffrey'   },
  { key: 'mavericks',   name: 'Mavericks',    captainKey: null             }, // Tobin Kern (real user)
  { key: 'puckn_bucks', name: "Puck'n Bucks", captainKey: 'nick_ciani'     },
  { key: 'lumberjacks', name: 'Lumberjacks',  captainKey: 'jason_wiess'    },
  { key: 'red_barons',  name: 'Red Barons',   captainKey: 'alexander_mahvi'},
  { key: 'muffin_men',  name: 'Muffin Men',   captainKey: 'mike_elrod'     },
  { key: 'red_barrons', name: 'Red Barrons',  captainKey: null             },
  { key: 'rwb',         name: 'RW&B',         captainKey: null             },
  { key: 'gold',        name: 'Gold',         captainKey: 'barry_mcslapper'},
  { key: 'lot_lizards', name: 'Lot Lizards',  captainKey: 'cam_mcstick'    },
];

const TEAM_MEMBERS: Record<string, string[]> = {
  orange:      ['eddie_bolden', 'ludwiga9', 'mike_jeffrey', 'rob_drago', 'shawn_sadler', 'wes_sneek'],
  mavericks:   ['brendan_maynard', 'derek_cogar', 'justin_ropos', 'ken_sable', 'mark_tratar',
                 'matt_belaj', 'mike_riebe', 'pat_mcarthur', 'rico_piccirillo', 'rob_mackinlay', 'william_white'],
  puckn_bucks: ['nick_ciani', 'patrick_david'],
  lumberjacks: ['jason_wiess'],
  red_barons:  ['alexander_mahvi', 'curtis_rice', 'gavin_haase', 'michael_verch'],
  muffin_men:  ['brad_zicarelli', 'brian_weinkamer', 'bryan_siersma', 'cale_makar', 'donny_urbancic', 'jason_hallums'],
  red_barrons: [],
  rwb:         [],
  gold:        [],
  lot_lizards: [],
};

// Players in the league but without team assignments
const LEAGUE_ONLY_PLAYERS = [
  'andrew_marino', 'brian_sellers', 'chris_novicky', 'connor_robbins',
  'dan_lieske', 'gerry_zadnik', 'greg_kern', 'justin_schmidt',
  'kyle_van', 'mike_campbell', 'mike_van', 'pat_kramer', 'tj_kern', 'tristan_neeb',
];

async function seedDemoSeason() {
  console.log('🚀 Starting Demo Season Seeding...\n');

  const client = postgres(DEST_URL);
  const db = drizzle(client, { schema });

  try {
    // Step 1: Create the demo season
    console.log('1️⃣  Creating Demo - Winter 2025 season...');
    const [season] = await db.insert(schema.seasons).values({
      id: crypto.randomUUID(),
      name: 'Demo - Winter 2025',
      leagueId: LEAGUE_ID,
      isActive: true,
    }).returning();
    console.log(`   ✅ Created season: ${season.name} (${season.id})`);

    // Step 2: Create placeholder users for all players
    console.log('\n2️⃣  Creating placeholder users...');
    const userIdMap: Record<string, string> = {};

    for (const [key, player] of Object.entries(PLAYERS)) {
      const userId = crypto.randomUUID();
      userIdMap[key] = userId;
      const email = placeholderEmail(player.firstName, player.lastName || key);
      const displayId = generateDisplayId();

      await db.insert(schema.users).values({
        id: userId,
        displayId,
        email,
        firstName: player.firstName,
        lastName: player.lastName,
        role: 'free_tier',
        onboardingCompleted: false,
        isPrimaryCommissioner: false,
      });
    }
    console.log(`   ✅ Created ${Object.keys(PLAYERS).length} placeholder users`);

    // Step 3: Create teams
    console.log('\n3️⃣  Creating teams...');
    const teamIdMap: Record<string, string> = {};

    for (const teamDef of TEAMS) {
      const teamId = crypto.randomUUID();
      teamIdMap[teamDef.key] = teamId;

      let captainId: string | null = null;
      if (teamDef.key === 'mavericks') {
        captainId = TOBIN_KERN_ID;
      } else if (teamDef.captainKey) {
        captainId = userIdMap[teamDef.captainKey];
      }

      await db.insert(schema.teams).values({
        id: teamId,
        name: teamDef.name,
        leagueId: LEAGUE_ID,
        seasonId: season.id,
        captainId,
        creatorId: TOBIN_KERN_ID,
        wins: 0,
        losses: 0,
        ties: 0,
        goalsFor: 0,
        goalsAgainst: 0,
      });
      console.log(`   ✅ Created team: ${teamDef.name}`);
    }

    // Step 4: Add Tobin Kern as league member (if not already - he already is)
    // But we need him in the demo season context - his existing league membership covers the whole league
    console.log('\n4️⃣  Adding league memberships...');

    // Add Tobin Kern first (he already has a membership, but we add approved one)
    // Check if he already has a membership
    const existingTobinMembership = await db
      .select()
      .from(schema.leagueMemberships)
      .where(
        eq(schema.leagueMemberships.userId, TOBIN_KERN_ID)
      );
    console.log(`   ℹ️  Tobin already has ${existingTobinMembership.length} league membership(s)`);

    // Add league memberships for all placeholder users
    for (const [key, userId] of Object.entries(userIdMap)) {
      const player = PLAYERS[key];
      const isTeamCaptain = ['mike_elrod', 'barry_mcslapper', 'cam_mcstick'].includes(key);

      await db.insert(schema.leagueMemberships).values({
        id: crypto.randomUUID(),
        userId,
        leagueId: LEAGUE_ID,
        status: 'approved',
        approvedAt: new Date(),
        approvedBy: TOBIN_KERN_ID,
        isGoalie: player.isGoalie,
        isSkater: player.isSkater,
        leagueRole: 'free_tier',
      }).onConflictDoNothing();
    }
    console.log(`   ✅ Added ${Object.keys(userIdMap).length} placeholder league memberships`);

    // Step 5: Add team memberships
    console.log('\n5️⃣  Adding team memberships...');

    // Add Tobin Kern to Mavericks as captain
    await db.insert(schema.teamMemberships).values({
      id: crypto.randomUUID(),
      userId: TOBIN_KERN_ID,
      teamId: teamIdMap.mavericks,
      status: 'approved',
      isCaptain: true,
      approvedBy: TOBIN_KERN_ID,
    }).onConflictDoNothing();
    console.log(`   ✅ Added Tobin Kern to Mavericks as captain`);

    // Add placeholder players to their teams
    let membershipCount = 0;
    for (const [teamKey, memberKeys] of Object.entries(TEAM_MEMBERS)) {
      const teamId = teamIdMap[teamKey];

      for (const memberKey of memberKeys) {
        const userId = userIdMap[memberKey];
        if (!userId) continue;

        const teamDef = TEAMS.find(t => t.key === teamKey)!;
        const isCaptain = teamKey !== 'mavericks' && teamDef.captainKey === memberKey;

        await db.insert(schema.teamMemberships).values({
          id: crypto.randomUUID(),
          userId,
          teamId,
          status: 'approved',
          isCaptain,
          approvedBy: TOBIN_KERN_ID,
        }).onConflictDoNothing();
        membershipCount++;
      }
    }

    // Add team captains for teams where captain isn't in the member list
    for (const teamDef of TEAMS) {
      if (!teamDef.captainKey || teamDef.key === 'mavericks') continue;
      const teamMembers = TEAM_MEMBERS[teamDef.key] || [];
      // If captain is NOT already in the team member list, add them
      if (!teamMembers.includes(teamDef.captainKey)) {
        const userId = userIdMap[teamDef.captainKey];
        if (userId) {
          await db.insert(schema.teamMemberships).values({
            id: crypto.randomUUID(),
            userId,
            teamId: teamIdMap[teamDef.key],
            status: 'approved',
            isCaptain: true,
            approvedBy: TOBIN_KERN_ID,
          }).onConflictDoNothing();
          membershipCount++;
        }
      }
    }

    console.log(`   ✅ Added ${membershipCount + 1} team memberships`);

    // Step 6: Add league-only players (no team assignment)
    console.log('\n6️⃣  Verifying league-only players are included...');
    console.log(`   ✅ ${LEAGUE_ONLY_PLAYERS.length} players added to league with no team assignment`);

    await client.end();

    console.log('\n✨ Demo season seeding completed successfully!');
    console.log(`   Season: "Demo - Winter 2025" (ID: ${season.id})`);
    console.log(`   Teams: ${TEAMS.length}`);
    console.log(`   Placeholder users: ${Object.keys(PLAYERS).length}`);
    console.log(`   League memberships: ${Object.keys(PLAYERS).length} placeholder + 1 Tobin (existing)`);
  } catch (error) {
    console.error('\n❌ Seeding failed:', error);
    await client.end();
    throw error;
  }
}

seedDemoSeason().catch(console.error);

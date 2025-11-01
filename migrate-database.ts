import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './shared/schema';

// Source database (old Supabase with data)
const SOURCE_URL = 'postgresql://postgres.xffixgkittntgcytigpz:Lieslkern2!@aws-1-us-east-1.pooler.supabase.com:6543/postgres';

// Destination database (current DATABASE_URL from environment)
const DEST_URL = process.env.DATABASE_URL!;

async function checkSourceData() {
  console.log('🔍 Checking source database...\n');
  
  const sourceClient = postgres(SOURCE_URL);
  const sourceDb = drizzle(sourceClient, { schema });

  try {
    // Check what data exists
    const users = await sourceDb.select().from(schema.users);
    const leagues = await sourceDb.select().from(schema.leagues);
    const teams = await sourceDb.select().from(schema.teams);
    const leagueMemberships = await sourceDb.select().from(schema.leagueMemberships);
    const teamMemberships = await sourceDb.select().from(schema.teamMemberships);
    const games = await sourceDb.select().from(schema.games);

    console.log('📊 Source Database Summary:');
    console.log(`   Users: ${users.length}`);
    console.log(`   Leagues: ${leagues.length}`);
    console.log(`   Teams: ${teams.length}`);
    console.log(`   League Memberships: ${leagueMemberships.length}`);
    console.log(`   Team Memberships: ${teamMemberships.length}`);
    console.log(`   Games: ${games.length}`);
    
    // Find the league with 99 members
    if (leagues.length > 0) {
      console.log('\n🏒 Leagues found:');
      for (const league of leagues) {
        const memberCount = leagueMemberships.filter(m => m.leagueId === league.id).length;
        console.log(`   - ${league.name} (ID: ${league.uniqueLeagueId}): ${memberCount} members`);
      }
    }

    await sourceClient.end();
    return { users, leagues, teams, leagueMemberships, teamMemberships, games };
  } catch (error) {
    console.error('❌ Error checking source database:', error);
    await sourceClient.end();
    throw error;
  }
}

async function migrateData() {
  console.log('🚀 Starting database migration...\n');

  // Check source first
  const sourceData = await checkSourceData();

  if (sourceData.users.length === 0) {
    console.log('\n⚠️  Source database is empty! Nothing to migrate.');
    return;
  }

  console.log('\n📦 Connecting to destination database...');
  const destClient = postgres(DEST_URL);
  const destDb = drizzle(destClient, { schema });

  try {
    // Migrate in order of dependencies
    console.log('\n1️⃣  Migrating users...');
    for (const user of sourceData.users) {
      await destDb.insert(schema.users).values(user).onConflictDoNothing();
    }
    console.log(`   ✅ Migrated ${sourceData.users.length} users`);

    console.log('\n2️⃣  Migrating facilities...');
    const sourceClient = postgres(SOURCE_URL);
    const sourceDb = drizzle(sourceClient, { schema });
    const facilities = await sourceDb.select().from(schema.facilities);
    for (const facility of facilities) {
      await destDb.insert(schema.facilities).values(facility).onConflictDoNothing();
    }
    console.log(`   ✅ Migrated ${facilities.length} facilities`);

    console.log('\n3️⃣  Migrating leagues...');
    for (const league of sourceData.leagues) {
      await destDb.insert(schema.leagues).values(league).onConflictDoNothing();
    }
    console.log(`   ✅ Migrated ${sourceData.leagues.length} leagues`);

    console.log('\n4️⃣  Migrating teams...');
    for (const team of sourceData.teams) {
      await destDb.insert(schema.teams).values(team).onConflictDoNothing();
    }
    console.log(`   ✅ Migrated ${sourceData.teams.length} teams`);

    console.log('\n5️⃣  Migrating league memberships...');
    for (const membership of sourceData.leagueMemberships) {
      await destDb.insert(schema.leagueMemberships).values(membership).onConflictDoNothing();
    }
    console.log(`   ✅ Migrated ${sourceData.leagueMemberships.length} league memberships`);

    console.log('\n6️⃣  Migrating team memberships...');
    for (const membership of sourceData.teamMemberships) {
      await destDb.insert(schema.teamMemberships).values(membership).onConflictDoNothing();
    }
    console.log(`   ✅ Migrated ${sourceData.teamMemberships.length} team memberships`);

    console.log('\n7️⃣  Migrating games...');
    for (const game of sourceData.games) {
      await destDb.insert(schema.games).values(game).onConflictDoNothing();
    }
    console.log(`   ✅ Migrated ${sourceData.games.length} games`);

    // Migrate other tables
    console.log('\n8️⃣  Migrating additional data...');
    
    const seasons = await sourceDb.select().from(schema.seasons);
    for (const season of seasons) {
      await destDb.insert(schema.seasons).values(season).onConflictDoNothing();
    }
    console.log(`   ✅ Migrated ${seasons.length} seasons`);

    const playerStats = await sourceDb.select().from(schema.playerStats);
    for (const stat of playerStats) {
      await destDb.insert(schema.playerStats).values(stat).onConflictDoNothing();
    }
    console.log(`   ✅ Migrated ${playerStats.length} player stats`);

    const conversations = await sourceDb.select().from(schema.conversations);
    for (const conv of conversations) {
      await destDb.insert(schema.conversations).values(conv).onConflictDoNothing();
    }
    console.log(`   ✅ Migrated ${conversations.length} conversations`);

    const messages = await sourceDb.select().from(schema.messages);
    for (const msg of messages) {
      await destDb.insert(schema.messages).values(msg).onConflictDoNothing();
    }
    console.log(`   ✅ Migrated ${messages.length} messages`);

    const paymentRequests = await sourceDb.select().from(schema.paymentRequests);
    for (const pr of paymentRequests) {
      await destDb.insert(schema.paymentRequests).values(pr).onConflictDoNothing();
    }
    console.log(`   ✅ Migrated ${paymentRequests.length} payment requests`);

    await sourceClient.end();
    await destClient.end();

    console.log('\n✨ Migration completed successfully!');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    await destClient.end();
    throw error;
  }
}

// Run migration
migrateData().catch(console.error);

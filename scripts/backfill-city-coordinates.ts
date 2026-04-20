/**
 * backfill-city-coordinates.ts
 *
 * One-time script: geocodes stored city values to lat/lng for all users who
 * have a city set but no lat/lng coordinates yet.
 *
 * Uses Nominatim (OpenStreetMap) with a 1-second delay between requests to
 * comply with the Nominatim usage policy.
 *
 * Run once with:
 *   npx tsx scripts/backfill-city-coordinates.ts
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../shared/schema';
import { isNull, isNotNull, and, eq, sql, ne } from 'drizzle-orm';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is not set.');
  process.exit(1);
}

const client = postgres(DATABASE_URL);
const db = drizzle(client, { schema });

async function geocodeCity(city: string): Promise<{ lat: string; lng: string } | null> {
  const encoded = encodeURIComponent(city);
  const url = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'RosterAppBackfillScript/1.0 (backfill-city-coordinates)',
        'Accept-Language': 'en',
      },
    });

    if (!response.ok) {
      console.warn(`  Nominatim returned HTTP ${response.status} for city: ${city}`);
      return null;
    }

    const results = (await response.json()) as Array<{ lat: string; lon: string }>;
    if (!results || results.length === 0) {
      console.warn(`  No geocoding result found for city: "${city}"`);
      return null;
    }

    return { lat: results[0].lat, lng: results[0].lon };
  } catch (err) {
    console.error(`  Error geocoding city "${city}":`, err);
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('Fetching users with a city but no coordinates...');

  const usersToBackfill = await db
    .select({
      id: schema.users.id,
      city: schema.users.city,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
    })
    .from(schema.users)
    .where(
      and(
        isNotNull(schema.users.city),
        sql`trim(${schema.users.city}) != ''`,
        isNull(schema.users.lat),
        isNull(schema.users.lng),
      ),
    );

  console.log(`Found ${usersToBackfill.length} user(s) to backfill.`);

  if (usersToBackfill.length === 0) {
    console.log('Nothing to do. Exiting.');
    await client.end();
    return;
  }

  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;

  for (let i = 0; i < usersToBackfill.length; i++) {
    const user = usersToBackfill[i];
    const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.id;
    console.log(`[${i + 1}/${usersToBackfill.length}] ${displayName} — city: "${user.city}"`);

    const coords = await geocodeCity(user.city!);

    if (!coords) {
      skipCount++;
      console.log(`  Skipped (no result).`);
    } else {
      try {
        await db
          .update(schema.users)
          .set({ lat: coords.lat, lng: coords.lng })
          .where(eq(schema.users.id, user.id));

        successCount++;
        console.log(`  Updated: lat=${coords.lat}, lng=${coords.lng}`);
      } catch (dbErr) {
        failCount++;
        console.error(`  DB update failed for user ${user.id}:`, dbErr);
      }
    }

    if (i < usersToBackfill.length - 1) {
      await sleep(1100);
    }
  }

  console.log('\n--- Backfill complete ---');
  console.log(`  Updated:  ${successCount}`);
  console.log(`  Skipped:  ${skipCount}`);
  console.log(`  Errors:   ${failCount}`);

  await client.end();
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});

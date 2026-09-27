import { createHash } from "crypto";
import { isNotNull, sql } from "drizzle-orm";
import { googleIapClaims, users } from "@shared/schema";
import { db } from "./db";

export const hashGoogleIapToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

// Startup safety net for installations where the numbered SQL migration has
// not been applied yet. Backfill current legacy owners without printing tokens.
export async function initGoogleIapClaimsDb(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS google_iap_claims (
      token_hash VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR NOT NULL,
      claimed_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_google_iap_claims_user_id ON google_iap_claims (user_id)`);

  const legacy = await db.select({
    userId: users.id,
    token: users.iapOriginalTransactionId,
  }).from(users).where(isNotNull(users.iapOriginalTransactionId));
  const owners = new Map<string, string | null>();
  for (const { userId, token } of legacy) {
    if (!token) continue;
    const hash = hashGoogleIapToken(token);
    if (owners.has(hash) && owners.get(hash) !== userId) owners.set(hash, null);
    else if (!owners.has(hash)) owners.set(hash, userId);
  }
  const claims = Array.from(owners, ([tokenHash, userId]) => ({ tokenHash, userId }))
    .filter((claim): claim is { tokenHash: string; userId: string } => claim.userId !== null);
  if (claims.length > 0) {
    await db.insert(googleIapClaims).values(claims).onConflictDoNothing();
  }
  if (owners.size !== claims.length) {
    console.warn('[GoogleIAP] Conflicting legacy purchase owners require manual review');
  }
}
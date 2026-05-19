import { sql } from "drizzle-orm";
import { db } from "./db";
import { photoUploadQuota } from "@shared/schema";
import { eq, and } from "drizzle-orm";

export const MONTHLY_PHOTO_LIMIT = 5;

export function getCurrentPeriodStart(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

export function getNextPeriodStart(): string {
  const now = new Date();
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return nextMonth.toISOString();
}

export interface QuotaResult {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  resetDate: string;
}

/**
 * Atomically checks the user's current quota and increments it if under the limit.
 * Uses FOR UPDATE row lock to prevent race conditions on simultaneous uploads.
 */
export async function checkAndReservePhotoQuota(userId: string): Promise<QuotaResult> {
  const periodStart = getCurrentPeriodStart();
  const resetDate = getNextPeriodStart();

  const result = await db.transaction(async (tx) => {
    // Upsert row for current period (no-op if already exists)
    await tx.execute(
      sql`INSERT INTO photo_upload_quota (user_id, period_start, upload_count, updated_at)
          VALUES (${userId}, ${periodStart}, 0, now())
          ON CONFLICT (user_id, period_start) DO NOTHING`
    );

    // Lock the row and read current count
    const rows = await tx.execute(
      sql`SELECT upload_count FROM photo_upload_quota
          WHERE user_id = ${userId} AND period_start = ${periodStart}
          FOR UPDATE`
    );

    const current = Number((rows.rows[0] as any).upload_count);

    if (current >= MONTHLY_PHOTO_LIMIT) {
      return { allowed: false, used: current };
    }

    // Increment
    const updated = await tx.execute(
      sql`UPDATE photo_upload_quota
          SET upload_count = upload_count + 1, updated_at = now()
          WHERE user_id = ${userId} AND period_start = ${periodStart}
          RETURNING upload_count`
    );

    const newCount = Number((updated.rows[0] as any).upload_count);
    return { allowed: true, used: newCount };
  });

  return {
    allowed: result.allowed,
    used: result.used,
    limit: MONTHLY_PHOTO_LIMIT,
    remaining: Math.max(0, MONTHLY_PHOTO_LIMIT - result.used),
    resetDate,
  };
}

/**
 * Rolls back a previously reserved quota slot (e.g. if the actual upload fails).
 */
export async function rollbackPhotoQuota(userId: string): Promise<void> {
  const periodStart = getCurrentPeriodStart();
  await db.execute(
    sql`UPDATE photo_upload_quota
        SET upload_count = GREATEST(0, upload_count - 1), updated_at = now()
        WHERE user_id = ${userId} AND period_start = ${periodStart}`
  );
}

/**
 * Returns the user's current quota status without modifying the count.
 */
export async function getPhotoQuotaStatus(userId: string): Promise<QuotaResult> {
  const periodStart = getCurrentPeriodStart();
  const resetDate = getNextPeriodStart();

  const rows = await db
    .select()
    .from(photoUploadQuota)
    .where(
      and(
        eq(photoUploadQuota.userId, userId),
        eq(photoUploadQuota.periodStart, periodStart)
      )
    )
    .limit(1);

  const used = rows.length > 0 ? rows[0].uploadCount : 0;

  return {
    allowed: used < MONTHLY_PHOTO_LIMIT,
    used,
    limit: MONTHLY_PHOTO_LIMIT,
    remaining: Math.max(0, MONTHLY_PHOTO_LIMIT - used),
    resetDate,
  };
}

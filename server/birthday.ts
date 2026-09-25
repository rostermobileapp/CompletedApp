import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { fromZonedTime } from "date-fns-tz";
import { db } from "./db";
import { birthdayGreetings, users } from "@shared/schema";
import { sendPushNotificationToUser } from "./oneSignalNotifications";

/** Returns the local birthday's date key only from noon until midnight. */
export function eligibleBirthdayDate(
  dateOfBirth: string | null | undefined,
  timezone: string | null | undefined,
  now = new Date(),
): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth || "");
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const birth = new Date(Date.UTC(year, month - 1, day));
  if (birth.getUTCFullYear() !== year || birth.getUTCMonth() !== month - 1 || birth.getUTCDate() !== day) return null;

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "America/New_York",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
    }).formatToParts(now);
    const part = (name: string) => Number(parts.find(p => p.type === name)?.value);
    const localYear = part("year");
    if (year > localYear || part("month") !== month || part("day") !== day || part("hour") < 12) return null;
    return `${localYear}-${match[2]}-${match[3]}`;
  } catch {
    // Invalid stored IANA timezone: do not guess and send at the wrong hour.
    return null;
  }
}

export async function ensureBirthdayTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS birthday_greetings (
      user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      birthday_date date NOT NULL,
      popup_dismissed_at timestamptz,
      push_claimed_at timestamptz,
      push_sent_at timestamptz,
      PRIMARY KEY (user_id, birthday_date)
    )
  `);
}

export async function getBirthdayStatus(userId: string) {
  const [user] = await db.select({
    dateOfBirth: users.dateOfBirth, timezone: users.timezone, displayId: users.displayId,
  }).from(users).where(eq(users.id, userId));
  if (!user || user.displayId?.startsWith("D")) return { eligible: false };
  const birthdayDate = eligibleBirthdayDate(user.dateOfBirth, user.timezone);
  if (!birthdayDate) return { eligible: false };
  const [greeting] = await db.select({ dismissed: birthdayGreetings.popupDismissedAt })
    .from(birthdayGreetings)
    .where(and(eq(birthdayGreetings.userId, userId), eq(birthdayGreetings.birthdayDate, birthdayDate)));
  const [year, month, day] = birthdayDate.split("-").map(Number);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
  const expiresAt = fromZonedTime(`${nextDay}T00:00:00`, user.timezone || "America/New_York").toISOString();
  return { eligible: !greeting?.dismissed, birthdayDate, expiresAt };
}

export async function dismissBirthday(userId: string) {
  const status = await getBirthdayStatus(userId);
  if (!status.birthdayDate) return false;
  await db.insert(birthdayGreetings)
    .values({ userId, birthdayDate: status.birthdayDate, popupDismissedAt: new Date() })
    .onConflictDoUpdate({
      target: [birthdayGreetings.userId, birthdayGreetings.birthdayDate],
      set: { popupDismissedAt: new Date() },
    });
  return true;
}

function birthdayPushKey(userId: string, birthdayDate: string): string {
  const hash = createHash("sha256").update(`roster-birthday:${userId}:${birthdayDate}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

let running = false;
export async function checkBirthdayPushes(now = new Date()) {
  if (running) return;
  running = true;
  try {
    // A local date can be up to one day ahead/behind UTC; limit DB reads to
    // these three month/day values before checking each person's own timezone.
    const days = [-1, 0, 1].map(offset => {
      const day = new Date(now.getTime() + offset * 86400000);
      return `${String(day.getUTCMonth() + 1).padStart(2, "0")}-${String(day.getUTCDate()).padStart(2, "0")}`;
    });
    const candidates = await db.execute(sql`
      SELECT u.id, u.date_of_birth, u.timezone
      FROM users u
      JOIN notification_preferences p ON p.user_id = u.id
      WHERE substring(u.date_of_birth from 6 for 5) IN (${sql.join(days.map(day => sql`${day}`), sql`, `)})
        AND coalesce(u.display_id, '') NOT LIKE 'D%'
        AND p.push_enabled = true
        AND (p.onesignal_player_id IS NOT NULL OR p.onesignal_external_id IS NOT NULL)
        AND coalesce(p.notification_settings->>'birthday', 'true') <> 'false'
    `);
    for (const user of candidates.rows) {
      const userId = String(user.id);
      const birthdayDate = eligibleBirthdayDate(
        user.date_of_birth as string | null, user.timezone as string | null, new Date(),
      );
      if (!birthdayDate) continue;
      const claim = new Date();
      const claimed = await db.execute(sql`
        INSERT INTO birthday_greetings (user_id, birthday_date, push_claimed_at)
        VALUES (${userId}, ${birthdayDate}::date, ${claim})
        ON CONFLICT (user_id, birthday_date) DO UPDATE
          SET push_claimed_at = excluded.push_claimed_at
        WHERE birthday_greetings.push_sent_at IS NULL
          AND (birthday_greetings.push_claimed_at IS NULL
               OR birthday_greetings.push_claimed_at < now() - interval '10 minutes')
        RETURNING user_id
      `);
      if (!claimed.rows.length) continue;
      // Revalidate immediately before the external side effect (including a
      // timezone or DOB edit while the job was running).
      const [current] = (await db.execute(sql`
        SELECT u.date_of_birth, u.timezone, p.push_enabled,
               coalesce(p.notification_settings->>'birthday', 'true') AS birthday_enabled,
               (p.onesignal_player_id IS NOT NULL OR p.onesignal_external_id IS NOT NULL) AS subscribed
        FROM users u JOIN notification_preferences p ON p.user_id = u.id
        WHERE u.id = ${userId}
      `)).rows;
      const stillEligible = current && current.push_enabled === true && current.subscribed === true
        && current.birthday_enabled !== "false"
        && eligibleBirthdayDate(current.date_of_birth as string | null, current.timezone as string | null) === birthdayDate;
      const sent = stillEligible && await sendPushNotificationToUser({
        userId, title: "Roster Hockey", message: "Happy Birthday",
        data: { type: "birthday" },
        idempotencyKey: birthdayPushKey(userId, birthdayDate),
      });
      if (sent) {
        await db.execute(sql`
          UPDATE birthday_greetings SET push_sent_at = now()
          WHERE user_id = ${userId} AND birthday_date = ${birthdayDate}::date
            AND push_claimed_at = ${claim} AND push_sent_at IS NULL
        `);
      } else {
        await db.execute(sql`
          UPDATE birthday_greetings SET push_claimed_at = NULL
          WHERE user_id = ${userId} AND birthday_date = ${birthdayDate}::date
            AND push_claimed_at = ${claim} AND push_sent_at IS NULL
        `);
      }
    }
  } catch (error) {
    console.error("[Birthday] Push job failed:", error);
  } finally {
    running = false;
  }
}

let timer: ReturnType<typeof setInterval> | null = null;
export function startBirthdayPushJob() {
  if (timer) return;
  void checkBirthdayPushes();
  timer = setInterval(() => { void checkBirthdayPushes(); }, 60_000);
}
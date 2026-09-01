/**
 * Shared backup-queue utilities used by both routes.ts and scrimmageReminderJob.ts.
 * Kept in a separate file to avoid importing the full routes module from the reminder job.
 */

import { storage } from "./storage";
import { formatDayAndTime, parseLeagueLocalDateTime } from "./dateUtils";

import { broadcastNotificationUpdate } from "./notificationBroadcast";
import { isDemoLeague } from "./demo";

/**
 * How many minutes before a scrimmage starts the backup cascade is frozen.
 * Any approved-player removal or timeout expiry that would trigger a notification
 * within this window is silently discarded — the backup would have no realistic
 * time to travel and show up.
 */
export const BACKUP_CASCADE_CUTOFF_MINUTES = 60;

/**
 * Promote the first organizer-approved backup into an open roster spot and
 * notify them immediately. The promotion itself is atomic; notification
 * failures must not undo the roster change.
 */
export async function promoteNextBackup(scrimmageId: string): Promise<string | undefined> {
  try {
    const scrimmage = await storage.getScrimmage(scrimmageId);
    if (!scrimmage || scrimmage.status === "cancelled") return;
    if (
      !scrimmage.timeTbd &&
      parseLeagueLocalDateTime(scrimmage.dateTime, scrimmage.timezone || "America/New_York").getTime() <= Date.now()
    ) {
      console.log(`[BackupQueue] Skipping promotion — scrimmage ${scrimmageId} has already started`);
      return;
    }
    if (await isDemoLeague(scrimmage.leagueId)) return;

    const promoted = await storage.promoteNextBackupAtomically(scrimmageId);
    if (!promoted) return;

    const player = await storage.getUser(promoted.playerId);
    if (!player) {
      console.error(`[BackupQueue] Promoted backup ${promoted.id} has no user record`);
      return promoted.playerId;
    }

    const timezone = scrimmage.timezone || "America/New_York";
    const { date, time } = formatDayAndTime(scrimmage.dateTime, timezone);
    const message = `A player dropped out of "${scrimmage.title}", and you're now approved to play on ${date} at ${time}.`;

    await storage.createNotification({
      userId: player.id,
      type: "scrimmage_approved",
      title: `You're in! ${scrimmage.title}`,
      message,
      actionUrl: `/scrimmage/${scrimmageId}`,
      actionText: "View Scrimmage",
      scrimmageId,
    });
    broadcastNotificationUpdate(player.id);

    const { sendScrimmageBackupPromotionPushNotification } = await import("./oneSignalNotifications");
    await sendScrimmageBackupPromotionPushNotification(
      player.id,
      scrimmage.title,
      `${date} at ${time}`,
      scrimmageId,
    );

    console.log(`[BackupQueue] Promoted backup player ${player.id} for scrimmage ${scrimmageId}`);
    return player.id;
  } catch (err) {
    console.error("[BackupQueue] promoteNextBackup error:", err);
    return undefined;
  }
}

/**
 * Find the next unnotified backup for a scrimmage and send them an open-spot
 * push + in-app notification. Safe to call when the queue is empty (no-op).
 */
export async function notifyNextBackup(scrimmageId: string): Promise<void> {
  try {
    // Guard: freeze the cascade once the scrimmage is within BACKUP_CASCADE_CUTOFF_MINUTES.
    // A player notified right before the cutoff still has up to 15 min to respond,
    // all before game time, so we only block new notifications past this point.
    const scrimmage = await storage.getScrimmage(scrimmageId);
    if (!scrimmage) return;
    if (await isDemoLeague(scrimmage.leagueId)) return;
    if (scrimmage.joinMode === "first_come") {
      console.log(`[BackupQueue] Skipping notification — scrimmage ${scrimmageId} uses First to RSVP`);
      return;
    }
    if (scrimmage.timeTbd) {
      console.log(`[BackupQueue] Skipping cascade — scrimmage ${scrimmageId} has no confirmed time`);
      return;
    }
    const timezone = scrimmage.timezone || "America/New_York";
    const cutoffMs = BACKUP_CASCADE_CUTOFF_MINUTES * 60 * 1000;
    if (parseLeagueLocalDateTime(scrimmage.dateTime, timezone).getTime() <= Date.now() + cutoffMs) {
      console.log(
        `[BackupQueue] Skipping cascade — scrimmage ${scrimmageId} starts within ${BACKUP_CASCADE_CUTOFF_MINUTES} min`
      );
      return;
    }

    // Single atomic UPDATE: claims the next eligible backup and stamps backupNotifiedAt.
    // If two concurrent cascades race here, only one will get a row back; the other
    // receives undefined and exits early — guaranteeing exactly one notification.
    const next = await storage.claimAndNotifyNextBackup(scrimmageId);
    if (!next) return;

    const player = await storage.getUser(next.playerId);
    if (!player) return;

    const { date, time } = formatDayAndTime(scrimmage.dateTime, timezone);

    await storage.createNotification({
      userId: player.id,
      type: "scrimmage_backup",
      title: `Spot opened — ${scrimmage.title}`,
      message: `A spot just opened for "${scrimmage.title}" on ${date} at ${time}. Do you want to skate?`,
      actionUrl: `/scrimmage/${scrimmageId}`,
      actionText: "Respond",
      scrimmageId,
    });

    broadcastNotificationUpdate(player.id);

    const { sendPushNotificationToUser } = await import("./oneSignalNotifications");
    await sendPushNotificationToUser({
      userId: player.id,
      title: `Spot opened — ${scrimmage.title}`,
      message: `A spot just opened for ${date} at ${time}. Tap to accept or decline.`,
    });

    console.log(
      `[BackupQueue] Notified backup player ${player.id} for scrimmage ${scrimmageId}`
    );
  } catch (err) {
    console.error("[BackupQueue] notifyNextBackup error:", err);
  }
}

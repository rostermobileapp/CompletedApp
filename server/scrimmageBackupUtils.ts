/**
 * Shared backup-queue utilities used by both routes.ts and scrimmageReminderJob.ts.
 * Kept in a separate file to avoid importing the full routes module from the reminder job.
 */

import { storage } from "./storage";
import { formatDayAndTime } from "./dateUtils";

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
    if (scrimmage.timeTbd) {
      console.log(`[BackupQueue] Skipping cascade — scrimmage ${scrimmageId} has no confirmed time`);
      return;
    }
    const cutoffMs = BACKUP_CASCADE_CUTOFF_MINUTES * 60 * 1000;
    if (new Date(scrimmage.dateTime).getTime() <= Date.now() + cutoffMs) {
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

    const league = await storage.getLeague(scrimmage.leagueId);
    const timezone = league?.timezone || "America/New_York";
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

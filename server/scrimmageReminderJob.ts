import { db } from "./db";
import { scrimmages, scrimmageRequests, scrimmageRemindersSent, users, userNotifications } from "@shared/schema";
import { and, eq, gt, lt, inArray, sql } from "drizzle-orm";
import { storage } from "./storage";
import { format } from "date-fns";
import { sendScheduleReminderPushNotification } from "./oneSignalNotifications";
import { parseLeagueLocalDateTime } from "./dateUtils";

const REMINDER_CHECK_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes
const BACKUP_TIMEOUT_INTERVAL_MS = 60 * 1000;     // Check backup timeouts every 1 minute

export async function checkAndSendScrimmageReminders(): Promise<void> {
  try {
    const now = new Date();
    // Convert to ISO string for comparison with string timestamp column
    const nowStr = now.toISOString();
    
    // Find scrimmages that:
    // 1. Have reminder settings
    // 2. Are in the future
    // 3. Are not cancelled
    const upcomingScrimmages = await db
      .select()
      .from(scrimmages)
      .where(
        and(
          sql`${scrimmages.dateTime} > ${nowStr}`,
          eq(scrimmages.status, 'open'),
          sql`${scrimmages.reminderHoursBefore} IS NOT NULL AND array_length(${scrimmages.reminderHoursBefore}, 1) > 0`
        )
      );
    
    for (const scrimmage of upcomingScrimmages) {
      if (!scrimmage.reminderHoursBefore || scrimmage.reminderHoursBefore.length === 0) {
        continue;
      }
      
      // Get league timezone for proper date conversion
      const league = await storage.getLeague(scrimmage.leagueId);
      const timezone = league?.timezone || 'America/New_York';
      const scrimmageTime = parseLeagueLocalDateTime(scrimmage.dateTime, timezone);
      const hoursUntil = (scrimmageTime.getTime() - now.getTime()) / (1000 * 60 * 60);
      
      // Find which reminders should be sent now
      for (const reminderHours of scrimmage.reminderHoursBefore) {
        // Check if we should send this reminder:
        // - We're within the reminder window (hoursUntil <= reminderHours)
        // - But not too early (hoursUntil > reminderHours - 1, with some buffer for cron interval)
        const shouldSend = hoursUntil <= reminderHours && hoursUntil > Math.max(0, reminderHours - 1);
        
        if (!shouldSend) {
          continue;
        }
        
        // Get all approved players for this scrimmage
        const approvedRequests = await db
          .select({
            request: scrimmageRequests,
            player: users,
          })
          .from(scrimmageRequests)
          .innerJoin(users, eq(scrimmageRequests.playerId, users.id))
          .where(
            and(
              eq(scrimmageRequests.scrimmageId, scrimmage.id),
              eq(scrimmageRequests.status, 'approved')
            )
          );
        
        // Get the creator for organizer name
        const [creator] = await db
          .select()
          .from(users)
          .where(eq(users.id, scrimmage.creatorId));
        
        const organizerName = creator 
          ? `${creator.firstName || ''} ${creator.lastName || ''}`.trim() || 'Organizer'
          : 'Organizer';
        
        // Check which reminders have already been sent
        const alreadySent = await db
          .select()
          .from(scrimmageRemindersSent)
          .where(
            and(
              eq(scrimmageRemindersSent.scrimmageId, scrimmage.id),
              eq(scrimmageRemindersSent.hoursBefore, reminderHours)
            )
          );
        
        const sentPlayerIds = new Set(alreadySent.map(s => s.playerId));
        
        // Send push notification reminders to players who haven't received this reminder yet
        for (const { request, player } of approvedRequests) {
          if (sentPlayerIds.has(player.id)) {
            continue; // Already sent this reminder
          }
          
          try {
            // Create in-app push notification
            const timeLabel = reminderHours < 24 
              ? `${reminderHours} hour${reminderHours === 1 ? '' : 's'}`
              : reminderHours === 24 
                ? '1 day' 
                : reminderHours === 48 
                  ? '2 days'
                  : `${Math.round(reminderHours / 24)} days`;
            
            await storage.createNotification({
              userId: player.id,
              type: 'scrimmage_reminder',
              title: `Reminder: ${scrimmage.title}`,
              message: `Starting in ${timeLabel} at ${scrimmage.location} on ${format(scrimmageTime, 'EEEE, MMMM d')} at ${format(scrimmageTime, 'h:mm a')}`,
              actionUrl: `/scrimmage/${scrimmage.id}`,
              actionText: 'View Details',
              scrimmageId: scrimmage.id,
            });
            
            // Send push notification to device
            await sendScheduleReminderPushNotification(
              player.id,
              scrimmage.title,
              timeLabel,
              scrimmage.location || 'TBD',
              scrimmage.id,
              'scrimmage'
            );
            
            // Record that we sent this reminder
            await db.insert(scrimmageRemindersSent).values({
              scrimmageId: scrimmage.id,
              playerId: player.id,
              hoursBefore: reminderHours,
            }).onConflictDoNothing();
            
            console.log(`✅ Sent ${reminderHours}h notification for scrimmage ${scrimmage.id} to ${player.firstName || player.id}`);
          } catch (error) {
            console.error(`❌ Failed to send push notification to ${player.id}:`, error);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error in scrimmage reminder job:', error);
  }

}

/**
 * Expire backups whose 15-minute response window has closed and cascade to the
 * next player in the queue. Runs on its own 1-minute interval so no backup is
 * left waiting longer than ~1 minute past their deadline.
 *
 * Scrimmages that start within BACKUP_CASCADE_CUTOFF_MINUTES are skipped:
 * the cascade guard inside notifyNextBackup would reject the notification anyway,
 * and we avoid the redundant DB work + log noise.
 */
export async function checkAndExpireTimedOutBackups(): Promise<void> {
  try {
    const { notifyNextBackup, BACKUP_CASCADE_CUTOFF_MINUTES } = await import('./scrimmageBackupUtils');
    const timedOutScrimmageIds = await storage.getScrimmagesWithTimedOutBackups(15);
    for (const scrimmageId of timedOutScrimmageIds) {
      try {
        // Skip scrimmages that are too close to start — no point cascading
        const scrimmage = await storage.getScrimmage(scrimmageId);
        if (!scrimmage) continue;
        const cutoffMs = BACKUP_CASCADE_CUTOFF_MINUTES * 60 * 1000;
        if (new Date(scrimmage.dateTime).getTime() <= Date.now() + cutoffMs) {
          console.log(
            `[BackupQueue] Skipping timeout cascade — scrimmage ${scrimmageId} starts within ${BACKUP_CASCADE_CUTOFF_MINUTES} min`
          );
          continue;
        }

        await storage.expireTimedOutBackups(scrimmageId, 15);
        await notifyNextBackup(scrimmageId);
        console.log(`[BackupQueue] Cascaded after timeout for scrimmage ${scrimmageId}`);
      } catch (err) {
        console.error(`[BackupQueue] Timeout cascade error for scrimmage ${scrimmageId}:`, err);
      }
    }
  } catch (err) {
    console.error('[BackupQueue] Error checking backup timeouts:', err);
  }
}

let reminderInterval: ReturnType<typeof setInterval> | null = null;
let backupTimeoutInterval: ReturnType<typeof setInterval> | null = null;

export function startScrimmageReminderJob(): void {
  if (reminderInterval) {
    console.log('Scrimmage reminder job already running');
    return;
  }
  
  console.log('🔔 Starting scrimmage reminder job (checking every 5 minutes)');
  
  // Run immediately on startup
  checkAndSendScrimmageReminders();
  
  // Then run periodically
  reminderInterval = setInterval(checkAndSendScrimmageReminders, REMINDER_CHECK_INTERVAL_MS);

  // Backup timeout cascade: separate 1-minute interval so expired slots are
  // cleared promptly rather than waiting up to 5 minutes.
  console.log('⏱️  Starting backup timeout job (checking every 1 minute)');
  checkAndExpireTimedOutBackups();
  backupTimeoutInterval = setInterval(checkAndExpireTimedOutBackups, BACKUP_TIMEOUT_INTERVAL_MS);
}

export function stopScrimmageReminderJob(): void {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
    console.log('🔕 Stopped scrimmage reminder job');
  }
  if (backupTimeoutInterval) {
    clearInterval(backupTimeoutInterval);
    backupTimeoutInterval = null;
    console.log('🔕 Stopped backup timeout job');
  }
}

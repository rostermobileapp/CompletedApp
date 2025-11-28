import { db } from "./db";
import { scrimmages, scrimmageRequests, scrimmageRemindersSent, users } from "@shared/schema";
import { and, eq, gt, lt, inArray, sql } from "drizzle-orm";
import { sendScrimmageReminderEmail } from "./emails";

const REMINDER_CHECK_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes

export async function checkAndSendScrimmageReminders(): Promise<void> {
  try {
    const now = new Date();
    
    // Find scrimmages that:
    // 1. Have reminder settings
    // 2. Are in the future
    // 3. Are not cancelled
    const upcomingScrimmages = await db
      .select()
      .from(scrimmages)
      .where(
        and(
          gt(scrimmages.dateTime, now),
          eq(scrimmages.status, 'open'),
          sql`${scrimmages.reminderHoursBefore} IS NOT NULL AND array_length(${scrimmages.reminderHoursBefore}, 1) > 0`
        )
      );
    
    for (const scrimmage of upcomingScrimmages) {
      if (!scrimmage.reminderHoursBefore || scrimmage.reminderHoursBefore.length === 0) {
        continue;
      }
      
      const scrimmageTime = new Date(scrimmage.dateTime);
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
        
        // Send reminders to players who haven't received this reminder yet
        for (const { request, player } of approvedRequests) {
          if (sentPlayerIds.has(player.id)) {
            continue; // Already sent this reminder
          }
          
          if (!player.email) {
            continue; // No email address
          }
          
          try {
            await sendScrimmageReminderEmail(player.email, {
              scrimmageId: scrimmage.id,
              title: scrimmage.title,
              dateTime: scrimmageTime,
              location: scrimmage.location,
              organizerName,
              playerName: player.firstName || 'Player',
              currentPlayers: approvedRequests.length,
              maxPlayers: scrimmage.maxPlayers,
              hoursUntil: Math.round(hoursUntil),
            });
            
            // Record that we sent this reminder
            await db.insert(scrimmageRemindersSent).values({
              scrimmageId: scrimmage.id,
              playerId: player.id,
              hoursBefore: reminderHours,
            }).onConflictDoNothing();
            
            console.log(`✅ Sent ${reminderHours}h reminder for scrimmage ${scrimmage.id} to ${player.email}`);
          } catch (error) {
            console.error(`❌ Failed to send reminder to ${player.email}:`, error);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error in scrimmage reminder job:', error);
  }
}

let reminderInterval: ReturnType<typeof setInterval> | null = null;

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
}

export function stopScrimmageReminderJob(): void {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
    console.log('🔕 Stopped scrimmage reminder job');
  }
}

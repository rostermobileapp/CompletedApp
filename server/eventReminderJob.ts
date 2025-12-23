import { db } from "./db";
import { 
  games, 
  scrimmages, 
  scrimmageRequests, 
  teamMemberships, 
  users, 
  eventRemindersSent,
  leagues
} from "@shared/schema";
import { and, eq, gt, lt, gte, lte, inArray, sql, or, not } from "drizzle-orm";
import { storage } from "./storage";
import { format, subDays, setHours, setMinutes, subHours, addDays } from "date-fns";
import { sendScheduleReminderPushNotification } from "./oneSignalNotifications";

const REMINDER_CHECK_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes

type ReminderTrigger = "2_days_6pm" | "2_hours";

interface EventInfo {
  id: string;
  title: string;
  location: string;
  eventTime: Date;
  eventType: "game" | "scrimmage";
}

function calculateTriggerTime(eventTime: Date, trigger: ReminderTrigger): Date {
  if (trigger === "2_hours") {
    return subHours(eventTime, 2);
  }
  
  // 2 days before at 6PM
  const twoDaysBefore = subDays(eventTime, 2);
  return setMinutes(setHours(twoDaysBefore, 18), 0); // 6:00 PM
}

function shouldSendReminder(now: Date, triggerTime: Date): boolean {
  const nowTime = now.getTime();
  const triggerTimeMs = triggerTime.getTime();
  
  // Send if we're within 10 minutes after the trigger time (buffer for job interval)
  // and the trigger time has passed
  return nowTime >= triggerTimeMs && nowTime <= triggerTimeMs + (10 * 60 * 1000);
}

async function getGameParticipants(gameId: string): Promise<{ id: string; firstName: string | null; lastName: string | null }[]> {
  const game = await db.select().from(games).where(eq(games.id, gameId)).limit(1);
  if (!game.length) return [];
  
  const teamIds = [game[0].homeTeamId, game[0].awayTeamId].filter(Boolean) as string[];
  if (teamIds.length === 0) return [];
  
  const members = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(teamMemberships)
    .innerJoin(users, eq(teamMemberships.userId, users.id))
    .where(
      and(
        inArray(teamMemberships.teamId, teamIds),
        eq(teamMemberships.status, 'approved')
      )
    );
  
  // Deduplicate in case a user is on both teams
  const uniqueMembers = new Map(members.map(m => [m.id, m]));
  return Array.from(uniqueMembers.values());
}

async function getScrimmageParticipants(scrimmageId: string): Promise<{ id: string; firstName: string | null; lastName: string | null }[]> {
  const approvedRequests = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(scrimmageRequests)
    .innerJoin(users, eq(scrimmageRequests.playerId, users.id))
    .where(
      and(
        eq(scrimmageRequests.scrimmageId, scrimmageId),
        eq(scrimmageRequests.status, 'approved')
      )
    );
  
  return approvedRequests;
}

async function hasReminderBeenSent(
  eventType: "game" | "scrimmage",
  eventId: string,
  playerId: string,
  triggerKey: ReminderTrigger
): Promise<boolean> {
  const existing = await db
    .select({ id: eventRemindersSent.id })
    .from(eventRemindersSent)
    .where(
      and(
        eq(eventRemindersSent.eventType, eventType),
        eq(eventRemindersSent.eventId, eventId),
        eq(eventRemindersSent.playerId, playerId),
        eq(eventRemindersSent.triggerKey, triggerKey)
      )
    )
    .limit(1);
  
  return existing.length > 0;
}

async function markReminderSent(
  eventType: "game" | "scrimmage",
  eventId: string,
  playerId: string,
  triggerKey: ReminderTrigger
): Promise<void> {
  await db.insert(eventRemindersSent).values({
    eventType,
    eventId,
    playerId,
    triggerKey,
  }).onConflictDoNothing();
}

async function sendEventReminder(
  event: EventInfo,
  player: { id: string; firstName: string | null; lastName: string | null },
  trigger: ReminderTrigger
): Promise<void> {
  const triggerAlreadySent = await hasReminderBeenSent(event.eventType, event.id, player.id, trigger);
  if (triggerAlreadySent) {
    return; // Already sent
  }
  
  try {
    const timeLabel = trigger === "2_hours" 
      ? "2 hours" 
      : "2 days";
    
    // Send push notification only (no in-app alert)
    await sendScheduleReminderPushNotification(
      player.id,
      event.title,
      timeLabel,
      event.location || 'TBD',
      event.id,
      event.eventType
    );
    
    // Record that we sent this reminder
    await markReminderSent(event.eventType, event.id, player.id, trigger);
    
    console.log(`✅ Sent ${trigger} reminder for ${event.eventType} ${event.id} to ${player.firstName || player.id}`);
  } catch (error) {
    console.error(`❌ Failed to send ${trigger} reminder for ${event.eventType} ${event.id} to ${player.id}:`, error);
  }
}

export async function checkAndSendEventReminders(): Promise<void> {
  try {
    const now = new Date();
    const maxLookAhead = addDays(now, 3); // Look 3 days ahead for upcoming events
    
    console.log(`🔍 Checking for event reminders at ${now.toISOString()}`);
    
    // Get upcoming games (within next 3 days, not completed)
    const upcomingGames = await db
      .select({
        id: games.id,
        scheduledAt: games.scheduledAt,
        venue: games.venue,
        homeTeamId: games.homeTeamId,
        awayTeamId: games.awayTeamId,
        leagueId: games.leagueId,
      })
      .from(games)
      .where(
        and(
          gt(games.scheduledAt, now),
          lte(games.scheduledAt, maxLookAhead),
          eq(games.isCompleted, false)
        )
      );
    
    // Get upcoming scrimmages (within next 3 days, open status)
    const upcomingScrimmages = await db
      .select({
        id: scrimmages.id,
        title: scrimmages.title,
        dateTime: scrimmages.dateTime,
        location: scrimmages.location,
      })
      .from(scrimmages)
      .where(
        and(
          gt(scrimmages.dateTime, now),
          lte(scrimmages.dateTime, maxLookAhead),
          eq(scrimmages.status, 'open')
        )
      );
    
    const triggers: ReminderTrigger[] = ["2_days_6pm", "2_hours"];
    
    // Process games
    for (const game of upcomingGames) {
      const eventTime = new Date(game.scheduledAt);
      
      // Build event title from teams
      let title = "Game";
      try {
        const homeTeam = await storage.getTeam(game.homeTeamId);
        const awayTeam = game.awayTeamId ? await storage.getTeam(game.awayTeamId) : null;
        if (homeTeam && awayTeam) {
          title = `${awayTeam.name} @ ${homeTeam.name}`;
        } else if (homeTeam) {
          title = `${homeTeam.name} Game`;
        }
      } catch (e) {
        // Keep default title
      }
      
      const eventInfo: EventInfo = {
        id: game.id,
        title,
        location: game.venue || 'TBD',
        eventTime,
        eventType: "game",
      };
      
      for (const trigger of triggers) {
        const triggerTime = calculateTriggerTime(eventTime, trigger);
        
        if (shouldSendReminder(now, triggerTime)) {
          const participants = await getGameParticipants(game.id);
          console.log(`📧 Sending ${trigger} reminders for game ${game.id} to ${participants.length} players`);
          
          for (const player of participants) {
            await sendEventReminder(eventInfo, player, trigger);
          }
        }
      }
    }
    
    // Process scrimmages
    for (const scrimmage of upcomingScrimmages) {
      const eventTime = new Date(scrimmage.dateTime);
      
      const eventInfo: EventInfo = {
        id: scrimmage.id,
        title: scrimmage.title || 'Scrimmage',
        location: scrimmage.location || 'TBD',
        eventTime,
        eventType: "scrimmage",
      };
      
      for (const trigger of triggers) {
        const triggerTime = calculateTriggerTime(eventTime, trigger);
        
        if (shouldSendReminder(now, triggerTime)) {
          const participants = await getScrimmageParticipants(scrimmage.id);
          console.log(`📧 Sending ${trigger} reminders for scrimmage ${scrimmage.id} to ${participants.length} players`);
          
          for (const player of participants) {
            await sendEventReminder(eventInfo, player, trigger);
          }
        }
      }
    }
    
  } catch (error) {
    console.error('Error in event reminder job:', error);
  }
}

let reminderInterval: ReturnType<typeof setInterval> | null = null;

export function startEventReminderJob(): void {
  if (reminderInterval) {
    console.log('Event reminder job already running');
    return;
  }
  
  console.log('🔔 Starting unified event reminder job (checking every 5 minutes)');
  console.log('   - Reminders: 2 days before at 6PM, 2 hours before');
  console.log('   - Covers: Games and Scrimmages');
  
  // Run immediately on startup
  checkAndSendEventReminders();
  
  // Then run periodically
  reminderInterval = setInterval(checkAndSendEventReminders, REMINDER_CHECK_INTERVAL_MS);
}

export function stopEventReminderJob(): void {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
    console.log('🔕 Stopped event reminder job');
  }
}

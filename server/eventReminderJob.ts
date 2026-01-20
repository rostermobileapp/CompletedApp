import { db } from "./db";
import { 
  games, 
  scrimmages, 
  scrimmageRequests, 
  teamMemberships, 
  users, 
  eventRemindersSent,
  leagues,
  gameRsvps,
  leagueMemberships
} from "@shared/schema";
import { and, eq, gt, lt, gte, lte, inArray, sql, or, not, isNull } from "drizzle-orm";
import { storage } from "./storage";
import { format, subDays, setHours, setMinutes, subHours, addDays } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { sendScheduleReminderPushNotification, sendPersonalReminderPushNotification } from "./oneSignalNotifications";
import { parseLeagueLocalDateTime } from "./dateUtils";

const REMINDER_CHECK_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes

type ReminderTrigger = "2_days_6pm" | "2_hours";

interface EventInfo {
  id: string;
  title: string;
  location: string;
  eventTime: Date;
  eventType: "game" | "scrimmage";
}

function calculateTriggerTime(eventTime: Date, trigger: ReminderTrigger, timezone: string = "America/New_York"): Date {
  if (trigger === "2_hours") {
    return subHours(eventTime, 2);
  }
  
  // 2 days before at 3:30PM in the league's local timezone
  const twoDaysBefore = subDays(eventTime, 2);
  
  // Convert to local timezone, set to 3:30PM, then convert back to UTC
  const localTime = toZonedTime(twoDaysBefore, timezone);
  const localAt330PM = setMinutes(setHours(localTime, 15), 30); // 3:30 PM local
  return fromZonedTime(localAt330PM, timezone);
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
  
  // 1. Get users from direct team_memberships (approved team members)
  const directMembers = await db
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
  
  // 2. Get users from league_memberships who are assigned to these teams
  const leagueMembers = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(leagueMemberships)
    .innerJoin(users, eq(leagueMemberships.userId, users.id))
    .where(
      and(
        inArray(leagueMemberships.assignedTeamId, teamIds),
        eq(leagueMemberships.status, 'approved'),
        not(isNull(leagueMemberships.assignedTeamId))
      )
    );
  
  // 3. Get users from game_rsvps (in case someone RSVPed but isn't on team roster)
  const rsvpMembers = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(gameRsvps)
    .innerJoin(users, eq(gameRsvps.userId, users.id))
    .where(eq(gameRsvps.gameId, gameId));
  
  // Combine and deduplicate all sources
  const uniqueMembers = new Map<string, { id: string; firstName: string | null; lastName: string | null }>();
  
  for (const member of directMembers) {
    uniqueMembers.set(member.id, member);
  }
  
  for (const member of leagueMembers) {
    uniqueMembers.set(member.id, member);
  }
  
  for (const member of rsvpMembers) {
    uniqueMembers.set(member.id, member);
  }
  
  console.log(`📋 Game ${gameId} participants: ${directMembers.length} direct team members, ${leagueMembers.length} league-assigned members, ${rsvpMembers.length} from RSVPs, ${uniqueMembers.size} total unique`);
  
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
  trigger: ReminderTrigger,
  dutyMessage?: string
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
      event.eventType,
      dutyMessage
    );
    
    // Record that we sent this reminder
    await markReminderSent(event.eventType, event.id, player.id, trigger);
    
    const dutyLog = dutyMessage ? ` (with duty: ${dutyMessage})` : '';
    console.log(`✅ Sent ${trigger} reminder for ${event.eventType} ${event.id} to ${player.firstName || player.id}${dutyLog}`);
  } catch (error) {
    console.error(`❌ Failed to send ${trigger} reminder for ${event.eventType} ${event.id} to ${player.id}:`, error);
  }
}

export async function checkAndSendEventReminders(): Promise<void> {
  try {
    const now = new Date();
    const maxLookAhead = addDays(now, 3); // Look 3 days ahead for upcoming events
    
    // Convert to ISO strings for comparison with string timestamp columns
    const nowStr = now.toISOString();
    const maxLookAheadStr = maxLookAhead.toISOString();
    
    console.log(`🔍 Checking for event reminders at ${nowStr}`);
    
    // Get upcoming games (within next 3 days, not completed)
    // Use SQL template for string-based timestamp comparison
    const upcomingGames = await db
      .select({
        id: games.id,
        scheduledAt: games.scheduledAt,
        venue: games.venue,
        homeTeamId: games.homeTeamId,
        awayTeamId: games.awayTeamId,
        leagueId: games.leagueId,
        homeBeverageDutyUserId: games.homeBeverageDutyUserId,
        awayBeverageDutyUserId: games.awayBeverageDutyUserId,
      })
      .from(games)
      .where(
        and(
          sql`${games.scheduledAt} > ${nowStr}`,
          sql`${games.scheduledAt} <= ${maxLookAheadStr}`,
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
        leagueId: scrimmages.leagueId,
      })
      .from(scrimmages)
      .where(
        and(
          sql`${scrimmages.dateTime} > ${nowStr}`,
          sql`${scrimmages.dateTime} <= ${maxLookAheadStr}`,
          eq(scrimmages.status, 'open')
        )
      );
    
    const triggers: ReminderTrigger[] = ["2_days_6pm", "2_hours"];
    
    // Process games
    for (const game of upcomingGames) {
      // Get league timezone first for proper date conversion
      let timezone = "America/New_York"; // Default fallback
      try {
        if (game.leagueId) {
          const league = await storage.getLeague(game.leagueId);
          if (league?.timezone) {
            timezone = league.timezone;
          }
        }
      } catch (e) {
        // Keep default timezone
      }
      
      // Parse the league-local datetime string with proper timezone context
      const eventTime = parseLeagueLocalDateTime(game.scheduledAt, timezone);
      
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
        const triggerTime = calculateTriggerTime(eventTime, trigger, timezone);
        
        if (shouldSendReminder(now, triggerTime)) {
          const participants = await getGameParticipants(game.id);
          console.log(`📧 Sending ${trigger} reminders for game ${game.id} to ${participants.length} players`);
          
          for (const player of participants) {
            // Check if player has a duty for this game
            let dutyMessage: string | undefined;
            if (player.id === game.homeBeverageDutyUserId || player.id === game.awayBeverageDutyUserId) {
              dutyMessage = "🍺 You have beverage duty!";
            }
            
            await sendEventReminder(eventInfo, player, trigger, dutyMessage);
          }
        }
      }
    }
    
    // Process scrimmages
    for (const scrimmage of upcomingScrimmages) {
      // Get league timezone for proper date conversion
      let scrimmageTimezone = "America/New_York";
      try {
        const scrimmageLeague = await storage.getLeague(scrimmage.leagueId);
        if (scrimmageLeague?.timezone) {
          scrimmageTimezone = scrimmageLeague.timezone;
        }
      } catch (e) {
        // Keep default timezone
      }
      
      // Parse the league-local datetime string with proper timezone context
      const eventTime = parseLeagueLocalDateTime(scrimmage.dateTime, scrimmageTimezone);
      
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
    
    // Process personal reminders
    try {
      const pendingReminders = await storage.getPendingPersonalReminders();
      
      if (pendingReminders.length > 0) {
        console.log(`📧 Found ${pendingReminders.length} personal reminders due for notification`);
      }
      
      for (const reminder of pendingReminders) {
        try {
          await sendPersonalReminderPushNotification(
            reminder.userId,
            reminder.id,
            reminder.title,
            reminder.description
          );
          
          await storage.markPersonalReminderNotificationSent(reminder.id);
          console.log(`✅ Sent personal reminder notification: ${reminder.title} to user ${reminder.userId}`);
        } catch (error) {
          console.error(`❌ Failed to send personal reminder ${reminder.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error processing personal reminders:', error);
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
  console.log('   - Reminders: 2 days before at 3PM (league timezone), 2 hours before');
  console.log('   - Covers: Games, Scrimmages, and Personal Reminders');
  
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

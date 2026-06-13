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
  leagueMemberships,
  teamEvents,
  teamEventRsvps,
  tournamentMatches,
  tournamentMatchRsvps,
  tournamentTeams,
  tournaments,
  rsvpRemindersSent,
  teams
} from "@shared/schema";
import { and, eq, gt, lt, gte, lte, inArray, sql, or, not, isNull, notInArray } from "drizzle-orm";
import { storage } from "./storage";
import { format, subDays, setHours, setMinutes, subHours, addDays } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { sendScheduleReminderPushNotification, sendPersonalReminderPushNotification, sendRsvpReminderPushNotification, resolveTeamLogoUrl } from "./oneSignalNotifications";
import { parseLeagueLocalDateTime } from "./dateUtils";

const REMINDER_CHECK_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes

type ReminderTrigger = "2_days_6pm" | "2_hours";

interface EventInfo {
  id: string;
  title: string;
  location: string;
  eventTime: Date;
  eventType: "game" | "scrimmage";
  /** Resolved public URL for the team logo to show in the push notification. */
  teamLogoUrl?: string;
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
      dutyMessage,
      event.teamLogoUrl
    );
    
    // Record that we sent this reminder
    await markReminderSent(event.eventType, event.id, player.id, trigger);
    
    const dutyLog = dutyMessage ? ` (with duty: ${dutyMessage})` : '';
    console.log(`✅ Sent ${trigger} reminder for ${event.eventType} ${event.id} to ${player.firstName || player.id}${dutyLog}`);
  } catch (error) {
    console.error(`❌ Failed to send ${trigger} reminder for ${event.eventType} ${event.id} to ${player.id}:`, error);
  }
}

// RSVP Reminder Helper Functions
async function hasRsvpReminderBeenSent(
  eventType: "game" | "tournament_match" | "team_event",
  eventId: string,
  userId: string
): Promise<boolean> {
  const existing = await db
    .select({ id: rsvpRemindersSent.id })
    .from(rsvpRemindersSent)
    .where(
      and(
        eq(rsvpRemindersSent.eventType, eventType),
        eq(rsvpRemindersSent.eventId, eventId),
        eq(rsvpRemindersSent.userId, userId)
      )
    )
    .limit(1);
  
  return existing.length > 0;
}

async function markRsvpReminderSent(
  eventType: "game" | "tournament_match" | "team_event",
  eventId: string,
  userId: string
): Promise<void> {
  await db.insert(rsvpRemindersSent).values({
    eventType,
    eventId,
    userId,
  }).onConflictDoNothing();
}

async function checkAndSendRsvpReminders(now: Date): Promise<void> {
  // 5 days from now window (check events happening in ~5 days)
  const fiveDaysFromNow = addDays(now, 5);
  const fiveDaysWindowStart = addDays(now, 4); // Events between 4-6 days from now
  const fiveDaysWindowEnd = addDays(now, 6);
  
  const windowStartStr = fiveDaysWindowStart.toISOString();
  const windowEndStr = fiveDaysWindowEnd.toISOString();
  
  console.log(`🔔 Checking RSVP reminders for events between ${windowStartStr} and ${windowEndStr}`);
  
  // 1. Check Games - find games where team members haven't RSVPd
  try {
    const upcomingGames = await db
      .select({
        id: games.id,
        scheduledAt: games.scheduledAt,
        homeTeamId: games.homeTeamId,
        awayTeamId: games.awayTeamId,
        venue: games.venue,
        leagueId: games.leagueId,
      })
      .from(games)
      .where(
        and(
          sql`${games.scheduledAt} >= ${windowStartStr}`,
          sql`${games.scheduledAt} < ${windowEndStr}`,
          eq(games.isCompleted, false)
        )
      );
    
    for (const game of upcomingGames) {
      // Build event name
      let eventName = "Game";
      try {
        const homeTeam = await storage.getTeam(game.homeTeamId);
        const awayTeam = game.awayTeamId ? await storage.getTeam(game.awayTeamId) : null;
        if (homeTeam && awayTeam) {
          eventName = `${awayTeam.name} @ ${homeTeam.name}`;
        } else if (homeTeam) {
          eventName = `${homeTeam.name} Game`;
        }
      } catch (e) {
        // Keep default name
      }
      
      // Get all team members who should RSVP
      const teamIds = [game.homeTeamId, game.awayTeamId].filter(Boolean) as string[];
      
      // Get team members from direct memberships
      const directMembers = await db
        .select({ userId: teamMemberships.userId, teamId: teamMemberships.teamId })
        .from(teamMemberships)
        .where(
          and(
            inArray(teamMemberships.teamId, teamIds),
            eq(teamMemberships.status, 'approved')
          )
        );
      
      // Get team members from league memberships
      const leagueMembers = await db
        .select({ userId: leagueMemberships.userId, teamId: leagueMemberships.assignedTeamId })
        .from(leagueMemberships)
        .where(
          and(
            inArray(leagueMemberships.assignedTeamId, teamIds),
            eq(leagueMemberships.status, 'approved'),
            not(isNull(leagueMemberships.assignedTeamId))
          )
        );
      
      // Combine and deduplicate
      const allMembers = new Map<string, { userId: string; teamId: string }>();
      for (const m of directMembers) {
        allMembers.set(m.userId, { userId: m.userId, teamId: m.teamId });
      }
      for (const m of leagueMembers) {
        if (m.teamId) {
          allMembers.set(m.userId, { userId: m.userId, teamId: m.teamId });
        }
      }
      
      // Get existing RSVPs for this game
      const existingRsvps = await db
        .select({ userId: gameRsvps.userId })
        .from(gameRsvps)
        .where(
          and(
            eq(gameRsvps.gameId, game.id),
            or(
              eq(gameRsvps.status, 'attending'),
              eq(gameRsvps.status, 'not_attending')
            )
          )
        );
      
      const rsvpdUserIds = new Set(existingRsvps.map(r => r.userId));
      
      // Find members who haven't RSVPd
      for (const [userId, member] of Array.from(allMembers.entries())) {
        if (!rsvpdUserIds.has(userId)) {
          // Check if we already sent this reminder
          const alreadySent = await hasRsvpReminderBeenSent('game', game.id, userId);
          if (!alreadySent) {
            const success = await sendRsvpReminderPushNotification(userId, eventName, game.id, 'game');
            if (success) {
              await markRsvpReminderSent('game', game.id, userId);
              console.log(`✅ Sent RSVP reminder for game ${game.id} to user ${userId}`);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error processing game RSVP reminders:', error);
  }
  
  // 2. Check Team Events - find team events where members haven't RSVPd
  try {
    const upcomingTeamEvents = await db
      .select({
        id: teamEvents.id,
        title: teamEvents.title,
        scheduledAt: teamEvents.scheduledAt,
        teamId: teamEvents.teamId,
      })
      .from(teamEvents)
      .where(
        and(
          sql`${teamEvents.scheduledAt} >= ${windowStartStr}`,
          sql`${teamEvents.scheduledAt} < ${windowEndStr}`
        )
      );
    
    for (const event of upcomingTeamEvents) {
      // Get team members
      const teamMembers = await db
        .select({ userId: teamMemberships.userId })
        .from(teamMemberships)
        .where(
          and(
            eq(teamMemberships.teamId, event.teamId),
            eq(teamMemberships.status, 'approved')
          )
        );
      
      // Get existing RSVPs
      const existingRsvps = await db
        .select({ userId: teamEventRsvps.userId })
        .from(teamEventRsvps)
        .where(
          and(
            eq(teamEventRsvps.teamEventId, event.id),
            or(
              eq(teamEventRsvps.status, 'attending'),
              eq(teamEventRsvps.status, 'not_attending')
            )
          )
        );
      
      const rsvpdUserIds = new Set(existingRsvps.map(r => r.userId));
      
      // Find members who haven't RSVPd
      for (const member of teamMembers) {
        if (!rsvpdUserIds.has(member.userId)) {
          const alreadySent = await hasRsvpReminderBeenSent('team_event', event.id, member.userId);
          if (!alreadySent) {
            const success = await sendRsvpReminderPushNotification(member.userId, event.title, event.id, 'team_event');
            if (success) {
              await markRsvpReminderSent('team_event', event.id, member.userId);
              console.log(`✅ Sent RSVP reminder for team event "${event.title}" to user ${member.userId}`);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error processing team event RSVP reminders:', error);
  }
  
  // 3. Check Tournament Matches - find matches where participants haven't RSVPd
  try {
    const upcomingMatches = await db
      .select({
        id: tournamentMatches.id,
        scheduledTime: tournamentMatches.scheduledTime,
        tournamentId: tournamentMatches.tournamentId,
        team1Id: tournamentMatches.team1Id,
        team2Id: tournamentMatches.team2Id,
        round: tournamentMatches.round,
      })
      .from(tournamentMatches)
      .where(
        and(
          sql`${tournamentMatches.scheduledTime} >= ${windowStartStr}`,
          sql`${tournamentMatches.scheduledTime} < ${windowEndStr}`,
          not(isNull(tournamentMatches.scheduledTime))
        )
      );
    
    for (const match of upcomingMatches) {
      // Get tournament name for event title
      let eventName = `Tournament Match - ${match.round}`;
      try {
        const tournament = await db
          .select({ name: tournaments.name })
          .from(tournaments)
          .where(eq(tournaments.id, match.tournamentId))
          .limit(1);
        if (tournament.length > 0) {
          eventName = `${tournament[0].name} - ${match.round}`;
        }
      } catch (e) {
        // Keep default name
      }
      
      // Get team IDs
      const tournamentTeamIds = [match.team1Id, match.team2Id].filter(Boolean) as string[];
      if (tournamentTeamIds.length === 0) continue;
      
      // Get tournament team info to find actual team IDs
      const tTeams = await db
        .select({ id: tournamentTeams.id, teamId: tournamentTeams.teamId })
        .from(tournamentTeams)
        .where(inArray(tournamentTeams.id, tournamentTeamIds));
      
      // Get members from linked teams
      const actualTeamIds = tTeams.map(t => t.teamId).filter(Boolean) as string[];
      if (actualTeamIds.length === 0) continue;
      
      const teamMembers = await db
        .select({ userId: teamMemberships.userId, teamId: teamMemberships.teamId })
        .from(teamMemberships)
        .where(
          and(
            inArray(teamMemberships.teamId, actualTeamIds),
            eq(teamMemberships.status, 'approved')
          )
        );
      
      // Get existing RSVPs
      const existingRsvps = await db
        .select({ userId: tournamentMatchRsvps.userId })
        .from(tournamentMatchRsvps)
        .where(
          and(
            eq(tournamentMatchRsvps.matchId, match.id),
            or(
              eq(tournamentMatchRsvps.status, 'attending'),
              eq(tournamentMatchRsvps.status, 'not_attending')
            )
          )
        );
      
      const rsvpdUserIds = new Set(existingRsvps.map(r => r.userId));
      
      // Find members who haven't RSVPd
      for (const member of teamMembers) {
        if (!rsvpdUserIds.has(member.userId)) {
          const alreadySent = await hasRsvpReminderBeenSent('tournament_match', match.id, member.userId);
          if (!alreadySent) {
            const success = await sendRsvpReminderPushNotification(member.userId, eventName, match.id, 'tournament_match');
            if (success) {
              await markRsvpReminderSent('tournament_match', match.id, member.userId);
              console.log(`✅ Sent RSVP reminder for tournament match ${match.id} to user ${member.userId}`);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error processing tournament match RSVP reminders:', error);
  }
  
  console.log('📋 RSVP reminder check completed');
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
      
      // Build event title from teams and resolve the home team logo for the notification
      let title = "Game";
      let gameTeamLogoUrl: string | undefined;
      try {
        const homeTeam = await storage.getTeam(game.homeTeamId);
        const awayTeam = game.awayTeamId ? await storage.getTeam(game.awayTeamId) : null;
        if (homeTeam && awayTeam) {
          title = `${awayTeam.name} @ ${homeTeam.name}`;
        } else if (homeTeam) {
          title = `${homeTeam.name} Game`;
        }
        // Use the home team's logo as the notification icon (it's the host team)
        if (homeTeam?.logoUrl) {
          gameTeamLogoUrl = resolveTeamLogoUrl(homeTeam.logoUrl) ?? undefined;
        }
      } catch (e) {
        // Keep default title and no logo
      }
      
      const eventInfo: EventInfo = {
        id: game.id,
        title,
        location: game.venue || 'TBD',
        eventTime,
        eventType: "game",
        teamLogoUrl: gameTeamLogoUrl,
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
    
    // Process personal reminders (2 hours before, like games/scrimmages)
    try {
      const pendingReminders = await storage.getPendingPersonalRemindersWithTimezone();
      
      if (pendingReminders.length > 0) {
        console.log(`🔔 Found ${pendingReminders.length} pending personal reminders to check`);
      }
      
      for (const reminder of pendingReminders) {
        try {
          // Parse the scheduled time using the user's timezone
          // The scheduledAt is stored as a LOCAL time string like "2026-01-20 15:00:00"
          const userTimezone = reminder.userTimezone || 'America/New_York'; // Default to EST if no league
          
          // Use parseLeagueLocalDateTime to properly convert local time to UTC
          const scheduledTimeUTC = parseLeagueLocalDateTime(reminder.scheduledAt, userTimezone);
          
          if (isNaN(scheduledTimeUTC.getTime())) {
            console.error(`❌ Invalid scheduledAt format for reminder ${reminder.id}: ${reminder.scheduledAt}`);
            continue;
          }
          
          // Calculate 2-hour-before trigger time
          const twoHoursBefore = subHours(scheduledTimeUTC, 2);
          
          console.log(`📋 Personal reminder "${reminder.title}": scheduledAt=${reminder.scheduledAt}, timezone=${userTimezone}, scheduledUTC=${scheduledTimeUTC.toISOString()}, trigger=${twoHoursBefore.toISOString()}, now=${now.toISOString()}`);
          
          // Use a 30-minute window to be forgiving (job runs every 5 minutes)
          const nowTime = now.getTime();
          const triggerTimeMs = twoHoursBefore.getTime();
          const withinWindow = nowTime >= triggerTimeMs && nowTime <= triggerTimeMs + (30 * 60 * 1000);
          
          if (withinWindow) {
            console.log(`📧 Sending 2-hour reminder for personal reminder: ${reminder.title}`);
            
            const success = await sendPersonalReminderPushNotification(
              reminder.userId,
              reminder.id,
              reminder.title,
              reminder.description
            );
            
            // Only mark as sent if push notification was actually delivered
            if (success) {
              await storage.markPersonalReminderNotificationSent(reminder.id);
              console.log(`✅ Sent personal reminder notification: ${reminder.title} to user ${reminder.userId}`);
            } else {
              // Push failed but don't mark as sent - will retry on next job run
              console.log(`⚠️ Personal reminder push not delivered (user may not have push enabled): ${reminder.title}`);
            }
          } else {
            const timeDiff = (nowTime - triggerTimeMs) / 60000; // in minutes
            console.log(`⏰ Personal reminder "${reminder.title}": not in trigger window (diff: ${timeDiff.toFixed(1)} mins)`);
          }
        } catch (error) {
          console.error(`❌ Failed to process personal reminder ${reminder.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error processing personal reminders:', error);
    }
    
    // Process RSVP reminders - 5 days before events for users who haven't responded
    try {
      await checkAndSendRsvpReminders(now);
    } catch (error) {
      console.error('Error processing RSVP reminders:', error);
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
  console.log('   - RSVP Reminders: 5 days before for users who haven\'t responded');
  console.log('   - Covers: Games, Scrimmages, Team Events, Tournament Matches, and Personal Reminders');
  
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

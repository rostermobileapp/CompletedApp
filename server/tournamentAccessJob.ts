import { db } from "./db";
import { tournaments, tournamentParticipants, users } from "@shared/schema";
import { and, eq, isNotNull, isNull, lte, gte, ne } from "drizzle-orm";
import { addHours } from "date-fns";
import { sendTournamentAccessOpenEmail } from "./emails";
import { sendPushNotificationToUser } from "./oneSignalNotifications";

const JOB_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

async function checkAndSendAccessWindowNotifications(now: Date): Promise<void> {
  // ---- 1. Window-open email: paid, non-draft tournaments whose access window just opened and invites not yet sent ----
  try {
    const openWindowTournaments = await db
      .select()
      .from(tournaments)
      .where(
        and(
          eq(tournaments.paymentStatus, 'paid'),
          ne(tournaments.status, 'draft'),
          isNotNull(tournaments.accessStartDate),
          lte(tournaments.accessStartDate, now),
          isNull(tournaments.accessInvitesSentAt)
        )
      );

    for (const tournament of openWindowTournaments) {
      if (!tournament.uniqueTournamentId) continue;

      console.log(`[TournamentAccessJob] Sending window-open emails for tournament ${tournament.id} (${tournament.name})`);

      // Get all participants who have an email — any status
      const participants = await db
        .select({
          userId: tournamentParticipants.userId,
          email: users.email,
        })
        .from(tournamentParticipants)
        .innerJoin(users, eq(tournamentParticipants.userId, users.id))
        .where(eq(tournamentParticipants.tournamentId, tournament.id));

      let emailsSent = 0;
      for (const participant of participants) {
        if (!participant.email) continue;
        try {
          await sendTournamentAccessOpenEmail(participant.email, {
            tournamentId: tournament.id,
            tournamentName: tournament.name,
            accessStartDate: tournament.accessStartDate,
            accessEndDate: tournament.accessEndDate,
            uniqueTournamentId: tournament.uniqueTournamentId,
          });
          emailsSent++;
        } catch (err) {
          console.error(`[TournamentAccessJob] Failed to send open email to ${participant.email}:`, err);
        }
      }

      // Mark invites sent even if no participants (prevents re-running)
      await db
        .update(tournaments)
        .set({ accessInvitesSentAt: now })
        .where(eq(tournaments.id, tournament.id));

      console.log(`[TournamentAccessJob] Sent ${emailsSent} open-window emails for tournament ${tournament.id}`);
    }
  } catch (err) {
    console.error('[TournamentAccessJob] Error in window-open email check:', err);
  }

  // ---- 2. Closing reminder push: tournaments closing within 24 hours, reminder not yet sent ----
  try {
    const in24h = addHours(now, 24);

    const closingTournaments = await db
      .select()
      .from(tournaments)
      .where(
        and(
          eq(tournaments.paymentStatus, 'paid'),
          ne(tournaments.status, 'draft'),
          isNotNull(tournaments.accessEndDate),
          gte(tournaments.accessEndDate, now),
          lte(tournaments.accessEndDate, in24h),
          isNull(tournaments.accessClosingReminderSentAt)
        )
      );

    for (const tournament of closingTournaments) {
      console.log(`[TournamentAccessJob] Sending closing-reminder pushes for tournament ${tournament.id} (${tournament.name})`);

      // Push to all approved participants
      const participants = await db
        .select({ userId: tournamentParticipants.userId })
        .from(tournamentParticipants)
        .where(
          and(
            eq(tournamentParticipants.tournamentId, tournament.id),
            eq(tournamentParticipants.status, 'approved')
          )
        );

      let pushSent = 0;
      for (const participant of participants) {
        try {
          const sent = await sendPushNotificationToUser({
            userId: participant.userId,
            title: `⏰ Registration Closing Soon`,
            message: `${tournament.name} registration closes in less than 24 hours!`,
            data: {
              type: 'tournament_closing',
              tournamentId: tournament.id,
            },
          });
          if (sent) pushSent++;
        } catch (err) {
          console.error(`[TournamentAccessJob] Failed push for user ${participant.userId}:`, err);
        }
      }

      await db
        .update(tournaments)
        .set({ accessClosingReminderSentAt: now })
        .where(eq(tournaments.id, tournament.id));

      console.log(`[TournamentAccessJob] Sent ${pushSent} closing-reminder pushes for tournament ${tournament.id}`);
    }
  } catch (err) {
    console.error('[TournamentAccessJob] Error in closing-reminder push check:', err);
  }
}

export function startTournamentAccessJob(): void {
  console.log('[TournamentAccessJob] Starting tournament access window job (every 5 minutes)');

  const run = async () => {
    const now = new Date();
    try {
      await checkAndSendAccessWindowNotifications(now);
    } catch (err) {
      console.error('[TournamentAccessJob] Unhandled error in job run:', err);
    }
  };

  // Run immediately on startup, then on interval
  run();
  setInterval(run, JOB_INTERVAL_MS);
}

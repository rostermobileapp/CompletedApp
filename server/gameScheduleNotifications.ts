import { and, eq, inArray } from 'drizzle-orm';
import {
  gameRsvps,
  leagueMemberships,
  leagues,
  teams,
  teamMemberships,
  type Game,
} from '@shared/schema';
import { db } from './db';
import { formatFullDateTime } from './dateUtils';
import { sendGameScheduleChangedPushNotification } from './oneSignalNotifications';
import { hasGameScheduleTimeChanged } from './gameScheduleTime';

type GameScheduleSnapshot = Pick<
  Game,
  'id' | 'leagueId' | 'homeTeamId' | 'awayTeamId' | 'opponentName' | 'scheduledAt'
>;

/**
 * Notifies the approved roster members, league-assigned members, game RSVPs,
 * and team leads associated with either the old or new teams. The caller should
 * invoke this only after the game update has been committed.
 */
export async function notifyAffectedMembersOfGameScheduleChange(
  before: GameScheduleSnapshot,
  after: GameScheduleSnapshot,
): Promise<void> {
  if (!hasGameScheduleTimeChanged(before, after)) return;

  const teamIds = Array.from(new Set(
    [before.homeTeamId, before.awayTeamId, after.homeTeamId, after.awayTeamId]
      .filter((teamId): teamId is string => !!teamId),
  ));
  if (teamIds.length === 0) return;

  const [rosterMembers, assignedMembers, rsvps, affectedTeams, leagueRows] = await Promise.all([
    db
      .select({ userId: teamMemberships.userId })
      .from(teamMemberships)
      .where(and(
        inArray(teamMemberships.teamId, teamIds),
        eq(teamMemberships.status, 'approved'),
      )),
    db
      .select({ userId: leagueMemberships.userId })
      .from(leagueMemberships)
      .where(and(
        inArray(leagueMemberships.assignedTeamId, teamIds),
        eq(leagueMemberships.status, 'approved'),
      )),
    db
      .select({ userId: gameRsvps.userId })
      .from(gameRsvps)
      .where(eq(gameRsvps.gameId, after.id)),
    db
      .select({
        id: teams.id,
        name: teams.name,
        captainId: teams.captainId,
        creatorId: teams.creatorId,
      })
      .from(teams)
      .where(inArray(teams.id, teamIds)),
    after.leagueId
      ? db
          .select({ timezone: leagues.timezone })
          .from(leagues)
          .where(eq(leagues.id, after.leagueId))
          .limit(1)
      : Promise.resolve([]),
  ]);

  const recipients = new Set<string>();
  for (const { userId } of [...rosterMembers, ...assignedMembers, ...rsvps]) {
    if (userId) recipients.add(userId);
  }
  for (const team of affectedTeams) {
    if (team.captainId) recipients.add(team.captainId);
    if (team.creatorId) recipients.add(team.creatorId);
  }
  if (recipients.size === 0) return;

  const teamById = new Map(affectedTeams.map(team => [team.id, team]));
  const homeName = teamById.get(after.homeTeamId)?.name || 'Home team';
  const awayName = after.awayTeamId
    ? teamById.get(after.awayTeamId)?.name || 'Away team'
    : after.opponentName;
  const matchup = awayName ? `${awayName} at ${homeName}` : `${homeName} game`;
  const newScheduledTime = formatFullDateTime(
    after.scheduledAt,
    leagueRows[0]?.timezone,
  );

  const recipientIds = Array.from(recipients);
  const deliveryResults: boolean[] = [];
  let nextRecipient = 0;
  const sendNextBatch = async () => {
    while (nextRecipient < recipientIds.length) {
      const userId = recipientIds[nextRecipient++];
      try {
        deliveryResults.push(await sendGameScheduleChangedPushNotification(
          userId,
          after.id,
          matchup,
          newScheduledTime,
        ));
      } catch (error) {
        deliveryResults.push(false);
        console.error(
          `[GameScheduleChange] Push request failed for game ${after.id}:`,
          error,
        );
      }
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(10, recipientIds.length) },
      () => sendNextBatch(),
    ),
  );
  const failedCount = deliveryResults.filter(sent => !sent).length;

  if (failedCount > 0) {
    console.warn(
      `[GameScheduleChange] Push was not accepted for ${failedCount}/${recipients.size} recipients of game ${after.id}`,
    );
  } else {
    console.info(
      `[GameScheduleChange] Push accepted for ${recipients.size} recipients of game ${after.id}`,
    );
  }
}

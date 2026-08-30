import type { Express, Request, RequestHandler } from "express";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "./db";
import {
  demoEntityMappings, demoEnvironments, gameRsvps, games, leagueMemberships,
  leagues, seasons, teamMemberships, teams, users, playerStats, gameGoalies,
  gameStars, gameGoals, teamEvents, teamEventRsvps, substituteRequests, substitutionApprovals,
  conversations, conversationParticipants, messages, messageReadReceipts, messageReactions,
  chatPolls, chatPollVotes, scrimmages,
  announcements, announcementReactions, announcementReadStatus, announcementVisibility, announcementComments,
  scrimmageRequests, scrimmageCoHosts, inviteGroups, inviteGroupMembers,
} from "@shared/schema";

export const DEMO_OWNER_DISPLAY_ID = "U00001";
declare global {
  namespace Express {
    interface Request {
      realActor?: { id: string; displayId: string | null };
      demoContext?: { environmentId: string; demoLeagueId: string; povUserId: string; realActorId: string };
    }
  }
}

export async function ensureDemoTables() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS demo_environments (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      source_league_id varchar NOT NULL UNIQUE REFERENCES leagues(id) ON DELETE CASCADE,
      demo_league_id varchar REFERENCES leagues(id) ON DELETE SET NULL,
      synced_at timestamp,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS demo_entity_mappings (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      environment_id varchar NOT NULL REFERENCES demo_environments(id) ON DELETE CASCADE,
      entity_type varchar(32) NOT NULL,
      source_id varchar NOT NULL,
      demo_id varchar NOT NULL,
      created_at timestamp NOT NULL DEFAULT now(),
      CONSTRAINT demo_entity_mapping_source_unique UNIQUE(environment_id, entity_type, source_id),
      CONSTRAINT demo_entity_mapping_demo_unique UNIQUE(environment_id, entity_type, demo_id)
    )`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_demo_entity_mappings_demo ON demo_entity_mappings(entity_type, demo_id)`);
}

function demoDisplayId() {
  return `D${crypto.randomUUID().replace(/-/g, "").slice(0, 5).toUpperCase()}`;
}
function demoLeagueDisplayId() {
  return `D${crypto.randomUUID().replace(/-/g, "").slice(0, 5).toUpperCase()}`;
}

async function putMap(tx: any, environmentId: string, entityType: string, sourceId: string, demoId: string) {
  await tx.insert(demoEntityMappings).values({ environmentId, entityType, sourceId, demoId });
}

/** Rebuilds only the demo copy.  Production rows are never updated or deleted. */
export async function syncDemo() {
  const [source] = await db.select().from(leagues).where(eq(leagues.name, "Mentor 35+"));
  if (!source) throw new Error('Source league "Mentor 35+" was not found');
  return db.transaction(async (tx) => {
    let [environment] = await tx.select().from(demoEnvironments)
      .where(eq(demoEnvironments.sourceLeagueId, source.id));
    if (!environment) {
      [environment] = await tx.insert(demoEnvironments).values({ sourceLeagueId: source.id }).returning();
    }
    // Delete the old isolated graph in dependency order.  Most legacy foreign
    // keys intentionally have no cascade, so deleting the league first is not
    // safe. Every predicate starts from the previous demo league/user IDs.
    const oldMaps = await tx.select().from(demoEntityMappings)
      .where(eq(demoEntityMappings.environmentId, environment.id));
    const oldUserIds = oldMaps.filter(m => m.entityType === "user").map(m => m.demoId);
    if (environment.demoLeagueId) {
      const l = environment.demoLeagueId;
      // Messages and all mutable chat adjuncts (including new demo actions).
      await tx.execute(sql`DELETE FROM message_reactions WHERE message_id IN (SELECT m.id FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.league_id=${l})`);
      await tx.execute(sql`DELETE FROM message_read_receipts WHERE message_id IN (SELECT m.id FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.league_id=${l})`);
      await tx.execute(sql`DELETE FROM chat_poll_votes WHERE poll_id IN (SELECT p.id FROM chat_polls p JOIN messages m ON m.id=p.message_id JOIN conversations c ON c.id=m.conversation_id WHERE c.league_id=${l})`);
      await tx.execute(sql`DELETE FROM chat_polls WHERE message_id IN (SELECT m.id FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.league_id=${l})`);
      await tx.execute(sql`DELETE FROM message_attachments WHERE message_id IN (SELECT m.id FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.league_id=${l})`);
      await tx.execute(sql`DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE league_id=${l})`);
      await tx.execute(sql`DELETE FROM conversation_participants WHERE conversation_id IN (SELECT id FROM conversations WHERE league_id=${l})`);
      await tx.execute(sql`DELETE FROM typing_indicators WHERE conversation_id IN (SELECT id FROM conversations WHERE league_id=${l})`);
      await tx.execute(sql`DELETE FROM conversations WHERE league_id=${l}`);
      // Announcement graph.
      await tx.execute(sql`DELETE FROM announcement_poll_votes WHERE poll_id IN (SELECT p.id FROM announcement_polls p JOIN announcements a ON a.id=p.announcement_id WHERE a.league_id=${l})`);
      await tx.execute(sql`DELETE FROM announcement_polls WHERE announcement_id IN (SELECT id FROM announcements WHERE league_id=${l})`);
      for (const table of ["announcement_reactions", "announcement_read_status", "announcement_visibility", "announcement_comments", "announcement_attachments"]) {
        await tx.execute(sql.raw(`DELETE FROM ${table} WHERE announcement_id IN (SELECT id FROM announcements WHERE league_id = '${l.replace(/'/g, "''")}')`));
      }
      await tx.execute(sql`DELETE FROM announcements WHERE league_id=${l}`);
      // Scrimmage and event action graph.
      await tx.execute(sql`DELETE FROM scrimmage_invites WHERE scrimmage_id IN (SELECT id FROM scrimmages WHERE league_id=${l})`);
      await tx.execute(sql`DELETE FROM scrimmage_requests WHERE scrimmage_id IN (SELECT id FROM scrimmages WHERE league_id=${l})`);
      await tx.execute(sql`DELETE FROM scrimmage_co_hosts WHERE scrimmage_id IN (SELECT id FROM scrimmages WHERE league_id=${l})`);
      await tx.execute(sql`DELETE FROM scrimmages WHERE league_id=${l}`);
      await tx.execute(sql`DELETE FROM invite_group_members WHERE group_id IN (SELECT id FROM invite_groups WHERE league_id=${l})`);
      await tx.execute(sql`DELETE FROM invite_groups WHERE league_id=${l}`);
      await tx.execute(sql`DELETE FROM substitution_approvals WHERE substitution_request_id IN (SELECT id FROM substitute_requests WHERE game_id IN (SELECT id FROM games WHERE league_id=${l}) OR team_event_id IN (SELECT id FROM team_events WHERE team_id IN (SELECT id FROM teams WHERE league_id=${l})))`);
      await tx.execute(sql`DELETE FROM substitute_requests WHERE game_id IN (SELECT id FROM games WHERE league_id=${l}) OR team_event_id IN (SELECT id FROM team_events WHERE team_id IN (SELECT id FROM teams WHERE league_id=${l}))`);
      await tx.execute(sql`DELETE FROM team_event_rsvps WHERE team_event_id IN (SELECT id FROM team_events WHERE team_id IN (SELECT id FROM teams WHERE league_id=${l}))`);
      await tx.execute(sql`DELETE FROM team_events WHERE team_id IN (SELECT id FROM teams WHERE league_id=${l})`);
      await tx.execute(sql`DELETE FROM game_rsvps WHERE game_id IN (SELECT id FROM games WHERE league_id=${l})`);
      await tx.execute(sql`DELETE FROM game_score_submissions WHERE game_id IN (SELECT id FROM games WHERE league_id=${l})`);
      await tx.execute(sql`DELETE FROM game_goals WHERE game_id IN (SELECT id FROM games WHERE league_id=${l})`);
      await tx.execute(sql`DELETE FROM game_penalties WHERE game_id IN (SELECT id FROM games WHERE league_id=${l})`);
      await tx.execute(sql`DELETE FROM game_goalies WHERE game_id IN (SELECT id FROM games WHERE league_id=${l})`);
      await tx.execute(sql`DELETE FROM game_stars WHERE game_id IN (SELECT id FROM games WHERE league_id=${l})`);
      await tx.execute(sql`DELETE FROM player_stats WHERE league_id=${l}`);
      await tx.execute(sql`DELETE FROM games WHERE league_id=${l}`);
      await tx.execute(sql`DELETE FROM duty_assignments WHERE team_id IN (SELECT id FROM teams WHERE league_id=${l})`);
      await tx.execute(sql`DELETE FROM duty_exclusions WHERE team_id IN (SELECT id FROM teams WHERE league_id=${l})`);
      await tx.execute(sql`DELETE FROM duty_templates WHERE team_id IN (SELECT id FROM teams WHERE league_id=${l})`);
      await tx.execute(sql`DELETE FROM team_memberships WHERE team_id IN (SELECT id FROM teams WHERE league_id=${l})`);
      await tx.execute(sql`DELETE FROM league_memberships WHERE league_id=${l}`);
      await tx.execute(sql`DELETE FROM teams WHERE league_id=${l}`);
      await tx.execute(sql`DELETE FROM seasons WHERE league_id=${l}`);
      await tx.execute(sql`DELETE FROM leagues WHERE id=${l}`);
    }
    if (oldUserIds.length) {
      await tx.execute(sql`DELETE FROM user_notifications WHERE user_id IN (${sql.join(oldUserIds.map(id => sql`${id}`), sql`, `)})`);
    }
    if (oldUserIds.length) await tx.delete(users).where(inArray(users.id, oldUserIds));
    await tx.delete(demoEntityMappings).where(eq(demoEntityMappings.environmentId, environment.id));

    const approvedMemberships = await tx.select().from(leagueMemberships)
      .where(and(eq(leagueMemberships.leagueId, source.id), eq(leagueMemberships.status, "approved")));
    // Always include the real U00001 identity as a copied POV, even if a
    // source data inconsistency has temporarily removed its membership.
    const [owner] = await tx.select().from(users).where(eq(users.displayId, DEMO_OWNER_DISPLAY_ID));
    if (!owner) throw new Error(`Real demo owner ${DEMO_OWNER_DISPLAY_ID} was not found`);
    const sourceUserIds = Array.from(new Set([...approvedMemberships.map(m => m.userId), owner.id, source.commissionerId]));
    const sourceUsers = await tx.select().from(users).where(inArray(users.id, sourceUserIds));
    const userMap = new Map<string, string>();
    for (const user of sourceUsers) {
      const id = crypto.randomUUID();
      userMap.set(user.id, id);
      await tx.insert(users).values({
        id, displayId: demoDisplayId(), firstName: user.firstName, lastName: user.lastName,
        profileImageUrl: user.profileImageUrl, city: user.city, primarySport: user.primarySport,
        playerType: user.playerType, shoots: user.shoots, timezone: user.timezone,
        role: user.role, onboardingCompleted: true, feeExempt: true,
        // No real contact, payment, identity, or device values are copied.
        email: null, phoneNumber: null, stripeCustomerId: null, stripeSubscriptionId: null,
        iapOriginalTransactionId: null, venmoUsername: null, cashappUsername: null,
      });
      await putMap(tx, environment.id, "user", user.id, id);
    }
    const commissionerId = userMap.get(source.commissionerId);
    if (!commissionerId) throw new Error("Source commissioner could not be copied");
    const demoLeagueId = crypto.randomUUID();
    await tx.insert(leagues).values({
      id: demoLeagueId, name: `Demo - ${source.name}`, uniqueLeagueId: demoLeagueDisplayId(),
      sport: source.sport, description: source.description, location: source.location,
      timezone: source.timezone, rinkName: source.rinkName, rinkAddress: source.rinkAddress,
      season: source.season, commissionerId, maxTeams: source.maxTeams, isActive: true,
      playoffStarted: source.playoffStarted, playoffBracket: source.playoffBracket,
      subApprovalWorkflow: source.subApprovalWorkflow,
    });
    await putMap(tx, environment.id, "league", source.id, demoLeagueId);
    const seasonMap = new Map<string, string>();
    for (const s of await tx.select().from(seasons).where(and(eq(seasons.leagueId, source.id), eq(seasons.isActive, true)))) {
      const id = crypto.randomUUID(); seasonMap.set(s.id, id);
      await tx.insert(seasons).values({ ...s, id, leagueId: demoLeagueId });
      await putMap(tx, environment.id, "season", s.id, id);
    }
    const sourceTeams = await tx.select().from(teams).where(eq(teams.leagueId, source.id));
    const teamMap = new Map<string, string>();
    for (const team of sourceTeams.filter(t => !t.seasonId || seasonMap.has(t.seasonId))) {
      const id = crypto.randomUUID(); teamMap.set(team.id, id);
      await tx.insert(teams).values({ ...team, id, uniqueTeamId: demoDisplayId(), leagueId: demoLeagueId,
        seasonId: team.seasonId ? seasonMap.get(team.seasonId)! : null,
        captainId: team.captainId ? userMap.get(team.captainId) ?? null : null,
        creatorId: team.creatorId ? userMap.get(team.creatorId) ?? commissionerId : commissionerId });
      await putMap(tx, environment.id, "team", team.id, id);
    }
    for (const m of approvedMemberships) {
      const userId = userMap.get(m.userId)!;
      await tx.insert(leagueMemberships).values({ ...m, id: crypto.randomUUID(), userId, leagueId: demoLeagueId,
        assignedTeamId: m.assignedTeamId ? teamMap.get(m.assignedTeamId) ?? null : null,
        approvedBy: m.approvedBy ? userMap.get(m.approvedBy) ?? commissionerId : commissionerId });
    }
    if (!approvedMemberships.some(m => m.userId === owner.id)) {
      await tx.insert(leagueMemberships).values({
        userId: userMap.get(owner.id)!, leagueId: demoLeagueId, status: "approved",
        approvedAt: new Date(), approvedBy: commissionerId,
        leagueRole: owner.id === source.commissionerId ? "commissioner" : "free_tier",
      });
    }
    const sourceTeamIds = Array.from(teamMap.keys());
    if (sourceTeamIds.length) for (const m of await tx.select().from(teamMemberships).where(and(inArray(teamMemberships.teamId, sourceTeamIds), eq(teamMemberships.status, "approved")))) {
      const userId = userMap.get(m.userId), teamId = teamMap.get(m.teamId);
      if (userId && teamId) await tx.insert(teamMemberships).values({ ...m, id: crypto.randomUUID(), userId, teamId,
        approvedBy: m.approvedBy ? userMap.get(m.approvedBy) ?? commissionerId : commissionerId });
    }
    // Copy only conversations that are explicitly scoped to the source league
    // and whose complete participant graph can be mapped into this snapshot.
    // Tournament/global chats are intentionally excluded because their
    // ownership cannot be proven from the league alone.
    const sourceConversations = await tx.select().from(conversations)
      .where(and(eq(conversations.leagueId, source.id), sql`${conversations.tournamentId} IS NULL`));
    const sourceConversationIds = sourceConversations.map(row => row.id);
    const sourceParticipants = sourceConversationIds.length
      ? await tx.select().from(conversationParticipants).where(inArray(conversationParticipants.conversationId, sourceConversationIds))
      : [];
    const participantsByConversation = new Map<string, typeof sourceParticipants>();
    for (const participant of sourceParticipants) {
      const rows = participantsByConversation.get(participant.conversationId) ?? [];
      rows.push(participant);
      participantsByConversation.set(participant.conversationId, rows);
    }
    const safeSourceConversations = sourceConversations.filter(conversation => {
      const participants = participantsByConversation.get(conversation.id) ?? [];
      return !!userMap.get(conversation.createdBy) &&
        participants.length > 0 &&
        participants.every(participant => userMap.has(participant.userId)) &&
        (!conversation.teamId || teamMap.has(conversation.teamId));
    });
    const conversationMap = new Map<string, string>();
    for (const conversation of safeSourceConversations) {
      const id = crypto.randomUUID();
      conversationMap.set(conversation.id, id);
      await tx.insert(conversations).values({
        ...conversation,
        id,
        leagueId: demoLeagueId,
        tournamentId: null,
        teamId: conversation.teamId ? teamMap.get(conversation.teamId)! : null,
        createdBy: userMap.get(conversation.createdBy)!,
      });
      for (const participant of participantsByConversation.get(conversation.id)!) {
        await tx.insert(conversationParticipants).values({
          ...participant,
          id: crypto.randomUUID(),
          conversationId: id,
          userId: userMap.get(participant.userId)!,
        });
      }
    }
    if (conversationMap.size) {
      const copiedSourceConversationIds = Array.from(conversationMap.keys());
      // Payment-request messages and attachment rows are deliberately omitted:
      // both can contain source account or private object-storage references.
      const sourceMessages = (await tx.select().from(messages)
        .where(inArray(messages.conversationId, copiedSourceConversationIds)))
        .filter(message => message.messageType !== "payment_request" && !message.paymentRequestId && userMap.has(message.senderId));
      const messageMap = new Map<string, string>();
      for (const message of sourceMessages) {
        const id = crypto.randomUUID();
        messageMap.set(message.id, id);
        await tx.insert(messages).values({
          ...message,
          id,
          conversationId: conversationMap.get(message.conversationId)!,
          senderId: userMap.get(message.senderId)!,
          replyToId: null,
          paymentRequestId: null,
        });
      }
      // Restore reply links only when the referenced message was also copied.
      for (const message of sourceMessages) {
        if (message.replyToId && messageMap.has(message.replyToId)) {
          await tx.update(messages)
            .set({ replyToId: messageMap.get(message.replyToId)! })
            .where(eq(messages.id, messageMap.get(message.id)!));
        }
      }
      if (messageMap.size) {
        const copiedSourceMessageIds = Array.from(messageMap.keys());
        for (const receipt of await tx.select().from(messageReadReceipts).where(inArray(messageReadReceipts.messageId, copiedSourceMessageIds))) {
          const userId = userMap.get(receipt.userId);
          if (userId) await tx.insert(messageReadReceipts).values({
            ...receipt, id: crypto.randomUUID(), messageId: messageMap.get(receipt.messageId)!, userId,
          });
        }
        for (const reaction of await tx.select().from(messageReactions).where(inArray(messageReactions.messageId, copiedSourceMessageIds))) {
          const userId = userMap.get(reaction.userId);
          if (userId) await tx.insert(messageReactions).values({
            ...reaction, id: crypto.randomUUID(), messageId: messageMap.get(reaction.messageId)!, userId,
          });
        }
        const sourcePolls = await tx.select().from(chatPolls).where(inArray(chatPolls.messageId, copiedSourceMessageIds));
        const pollMap = new Map<string, string>();
        for (const poll of sourcePolls) {
          const id = crypto.randomUUID();
          pollMap.set(poll.id, id);
          await tx.insert(chatPolls).values({ ...poll, id, messageId: messageMap.get(poll.messageId)! });
        }
        if (pollMap.size) {
          for (const vote of await tx.select().from(chatPollVotes).where(inArray(chatPollVotes.pollId, Array.from(pollMap.keys())))) {
            const userId = userMap.get(vote.userId);
            if (userId) await tx.insert(chatPollVotes).values({
              ...vote, id: crypto.randomUUID(), pollId: pollMap.get(vote.pollId)!, userId,
            });
          }
        }
      }
    }
    const gameMap = new Map<string, string>();
    for (const game of await tx.select().from(games).where(eq(games.leagueId, source.id))) {
      const homeTeamId = teamMap.get(game.homeTeamId), awayTeamId = game.awayTeamId ? teamMap.get(game.awayTeamId) : null;
      if (!homeTeamId || (game.awayTeamId && !awayTeamId)) continue;
      const id = crypto.randomUUID(); gameMap.set(game.id, id);
      await tx.insert(games).values({ ...game, id, leagueId: demoLeagueId, seasonId: game.seasonId ? seasonMap.get(game.seasonId) ?? null : null,
        homeTeamId, awayTeamId, homeBeverageDutyUserId: game.homeBeverageDutyUserId ? userMap.get(game.homeBeverageDutyUserId) ?? null : null,
        awayBeverageDutyUserId: game.awayBeverageDutyUserId ? userMap.get(game.awayBeverageDutyUserId) ?? null : null });
      await putMap(tx, environment.id, "game", game.id, id);
    }
    if (gameMap.size) for (const r of await tx.select().from(gameRsvps).where(inArray(gameRsvps.gameId, Array.from(gameMap.keys())))) {
      const userId = userMap.get(r.userId), teamId = teamMap.get(r.teamId);
      if (userId && teamId) await tx.insert(gameRsvps).values({ ...r, id: crypto.randomUUID(), gameId: gameMap.get(r.gameId)!, userId, teamId });
    }
    // Core stat rows are copied only when every referenced entity belongs to
    // this snapshot; imported-player rows are intentionally excluded.
    for (const stat of await tx.select().from(playerStats).where(eq(playerStats.leagueId, source.id))) {
      const userId = stat.userId ? userMap.get(stat.userId) : undefined;
      if (userId) await tx.insert(playerStats).values({ ...stat, id: crypto.randomUUID(), userId, importedPlayerId: null,
        leagueId: demoLeagueId, seasonId: stat.seasonId ? seasonMap.get(stat.seasonId) ?? null : null });
    }
    if (gameMap.size) {
      const sourceGameIds = Array.from(gameMap.keys());
      for (const row of await tx.select().from(gameGoalies).where(inArray(gameGoalies.gameId, sourceGameIds))) {
        const teamId = teamMap.get(row.teamId), userId = userMap.get(row.goalieUserId);
        if (teamId && userId) await tx.insert(gameGoalies).values({ ...row, id: crypto.randomUUID(), gameId: gameMap.get(row.gameId)!, teamId, goalieUserId: userId });
      }
      for (const row of await tx.select().from(gameStars).where(inArray(gameStars.gameId, sourceGameIds))) {
        const firstStarUserId = userMap.get(row.firstStarUserId), secondStarUserId = userMap.get(row.secondStarUserId), thirdStarUserId = userMap.get(row.thirdStarUserId), awardedBy = userMap.get(row.awardedBy);
        if (firstStarUserId && secondStarUserId && thirdStarUserId && awardedBy) await tx.insert(gameStars).values({ ...row, id: crypto.randomUUID(), gameId: gameMap.get(row.gameId)!, firstStarUserId, secondStarUserId, thirdStarUserId, awardedBy });
      }
      for (const row of await tx.select().from(gameGoals).where(inArray(gameGoals.gameId, sourceGameIds))) {
        const teamId = teamMap.get(row.teamId), scorerId = userMap.get(row.scorerId);
        const primaryAssistId = row.primaryAssistId ? userMap.get(row.primaryAssistId) : null, secondaryAssistId = row.secondaryAssistId ? userMap.get(row.secondaryAssistId) : null;
        if (teamId && scorerId && (!row.primaryAssistId || primaryAssistId) && (!row.secondaryAssistId || secondaryAssistId)) await tx.insert(gameGoals).values({ ...row, id: crypto.randomUUID(), gameId: gameMap.get(row.gameId)!, teamId, scorerId, primaryAssistId, secondaryAssistId });
      }
    }
    const eventMap = new Map<string, string>();
    if (sourceTeamIds.length) for (const event of await tx.select().from(teamEvents).where(inArray(teamEvents.teamId, sourceTeamIds))) {
      const teamId = teamMap.get(event.teamId), creatorId = userMap.get(event.creatorId);
      const opponentTeamId = event.opponentTeamId ? teamMap.get(event.opponentTeamId) : null;
      if (!teamId || !creatorId || (event.opponentTeamId && !opponentTeamId)) continue;
      const id = crypto.randomUUID(); eventMap.set(event.id, id);
      await tx.insert(teamEvents).values({ ...event, id, teamId, creatorId, opponentTeamId });
    }
    if (eventMap.size) for (const row of await tx.select().from(teamEventRsvps).where(inArray(teamEventRsvps.teamEventId, Array.from(eventMap.keys())))) {
      const userId = userMap.get(row.userId);
      if (userId) await tx.insert(teamEventRsvps).values({ ...row, id: crypto.randomUUID(), teamEventId: eventMap.get(row.teamEventId)!, userId });
    }
    const sourceRequestGames = Array.from(gameMap.keys()), sourceRequestEvents = Array.from(eventMap.keys());
    const requestMap = new Map<string, string>();
    if (sourceRequestGames.length || sourceRequestEvents.length) for (const row of await tx.select().from(substituteRequests).where(
      sourceRequestGames.length && sourceRequestEvents.length ? or(inArray(substituteRequests.gameId, sourceRequestGames), inArray(substituteRequests.teamEventId, sourceRequestEvents)) :
      sourceRequestGames.length ? inArray(substituteRequests.gameId, sourceRequestGames) : inArray(substituteRequests.teamEventId, sourceRequestEvents))) {
      const originalPlayerId = userMap.get(row.originalPlayerId), requestedBy = userMap.get(row.requestedBy), requestingTeamId = teamMap.get(row.requestingTeamId);
      const substitutePlayerId = row.substitutePlayerId ? userMap.get(row.substitutePlayerId) : null;
      if (!originalPlayerId || !requestedBy || !requestingTeamId || (row.substitutePlayerId && !substitutePlayerId)) continue;
      const id = crypto.randomUUID(); requestMap.set(row.id, id);
      await tx.insert(substituteRequests).values({ ...row, id, gameId: row.gameId ? gameMap.get(row.gameId) ?? null : null, teamEventId: row.teamEventId ? eventMap.get(row.teamEventId) ?? null : null, originalPlayerId, requestedBy, requestingTeamId, substitutePlayerId });
    }
    if (requestMap.size) for (const row of await tx.select().from(substitutionApprovals).where(inArray(substitutionApprovals.substitutionRequestId, Array.from(requestMap.keys())))) {
      const approverId = userMap.get(row.approverId);
      if (approverId) await tx.insert(substitutionApprovals).values({ ...row, id: crypto.randomUUID(), substitutionRequestId: requestMap.get(row.substitutionRequestId)!, approverId });
    }
    // Announcements are presentation data only; deliberately omit attachments
    // because their URLs may point to private/source object storage.
    const announcementMap = new Map<string, string>();
    for (const row of await tx.select().from(announcements).where(eq(announcements.leagueId, source.id))) {
      const authorId = userMap.get(row.authorId), teamId = row.teamId ? teamMap.get(row.teamId) : null;
      if (!authorId || (row.teamId && !teamId)) continue;
      const id = crypto.randomUUID(); announcementMap.set(row.id, id);
      await tx.insert(announcements).values({ ...row, id, leagueId: demoLeagueId, authorId, teamId, tournamentId: null });
    }
    if (announcementMap.size) {
      const sourceAnnouncementIds = Array.from(announcementMap.keys());
      for (const row of await tx.select().from(announcementReactions).where(inArray(announcementReactions.announcementId, sourceAnnouncementIds))) {
        const userId = userMap.get(row.userId); if (userId) await tx.insert(announcementReactions).values({ ...row, id: crypto.randomUUID(), announcementId: announcementMap.get(row.announcementId)!, userId });
      }
      for (const row of await tx.select().from(announcementReadStatus).where(inArray(announcementReadStatus.announcementId, sourceAnnouncementIds))) {
        const userId = userMap.get(row.userId); if (userId) await tx.insert(announcementReadStatus).values({ ...row, id: crypto.randomUUID(), announcementId: announcementMap.get(row.announcementId)!, userId });
      }
      for (const row of await tx.select().from(announcementVisibility).where(inArray(announcementVisibility.announcementId, sourceAnnouncementIds))) {
        const userId = userMap.get(row.userId); if (userId) await tx.insert(announcementVisibility).values({ ...row, id: crypto.randomUUID(), announcementId: announcementMap.get(row.announcementId)!, userId });
      }
      for (const row of await tx.select().from(announcementComments).where(inArray(announcementComments.announcementId, sourceAnnouncementIds))) {
        const authorId = userMap.get(row.authorId); if (authorId) await tx.insert(announcementComments).values({ ...row, id: crypto.randomUUID(), announcementId: announcementMap.get(row.announcementId)!, authorId, parentId: null });
      }
    }
    // Copy live invite groups without email/placeholder members.
    const groupMap = new Map<string, string>();
    for (const row of await tx.select().from(inviteGroups).where(eq(inviteGroups.leagueId, source.id))) {
      const creatorId = userMap.get(row.creatorId); if (!creatorId) continue;
      const id = crypto.randomUUID(); groupMap.set(row.id, id);
      await tx.insert(inviteGroups).values({ ...row, id, leagueId: demoLeagueId, creatorId });
    }
    if (groupMap.size) for (const row of await tx.select().from(inviteGroupMembers).where(inArray(inviteGroupMembers.groupId, Array.from(groupMap.keys())))) {
      const userId = row.userId ? userMap.get(row.userId) : undefined;
      if (userId) await tx.insert(inviteGroupMembers).values({ ...row, id: crypto.randomUUID(), groupId: groupMap.get(row.groupId)!, userId, placeholderPlayerId: null, email: null });
    }
    const scrimmageMap = new Map<string, string>();
    for (const row of await tx.select().from(scrimmages).where(eq(scrimmages.leagueId, source.id))) {
      const creatorId = userMap.get(row.creatorId); if (!creatorId) continue;
      const inviteUserIds = (row.inviteUserIds || []).map(id => userMap.get(id)).filter((id): id is string => !!id);
      const groupIds = (row.inviteGroupIds || []).map(id => groupMap.get(id)).filter((id): id is string => !!id);
      const id = crypto.randomUUID(); scrimmageMap.set(row.id, id);
      await tx.insert(scrimmages).values({ ...row, id, leagueId: demoLeagueId, creatorId, parentScrimmageId: null,
        inviteGroupId: row.inviteGroupId ? groupMap.get(row.inviteGroupId) ?? null : null, inviteGroupIds: groupIds,
        inviteUserIds, inviteEmails: [], hasDeferredInvites: false, inviteSentAt: null,
        costPerPlayer: null, venmoLinkOverride: null, cashappLinkOverride: null });
    }
    if (scrimmageMap.size) {
      const sourceScrimmageIds = Array.from(scrimmageMap.keys());
      // Recurring parent links can be restored once all IDs have been allocated.
      for (const row of await tx.select().from(scrimmages).where(inArray(scrimmages.id, sourceScrimmageIds))) {
        if (row.parentScrimmageId && scrimmageMap.has(row.parentScrimmageId)) await tx.update(scrimmages).set({ parentScrimmageId: scrimmageMap.get(row.parentScrimmageId)! }).where(eq(scrimmages.id, scrimmageMap.get(row.id)!));
      }
      for (const row of await tx.select().from(scrimmageRequests).where(inArray(scrimmageRequests.scrimmageId, sourceScrimmageIds))) {
        const playerId = userMap.get(row.playerId); if (playerId) await tx.insert(scrimmageRequests).values({ ...row, id: crypto.randomUUID(), scrimmageId: scrimmageMap.get(row.scrimmageId)!, playerId });
      }
      for (const row of await tx.select().from(scrimmageCoHosts).where(inArray(scrimmageCoHosts.scrimmageId, sourceScrimmageIds))) {
        const userId = userMap.get(row.userId), addedBy = userMap.get(row.addedBy); if (userId && addedBy) await tx.insert(scrimmageCoHosts).values({ ...row, id: crypto.randomUUID(), scrimmageId: scrimmageMap.get(row.scrimmageId)!, userId, addedBy });
      }
    }
    const syncedAt = new Date();
    await tx.update(demoEnvironments).set({ demoLeagueId, syncedAt, updatedAt: syncedAt }).where(eq(demoEnvironments.id, environment.id));
    return { demoLeagueId, syncedAt, povUsers: sourceUsers.map(u => ({ sourceUserId: u.id, demoUserId: userMap.get(u.id)!, displayId: u.displayId, firstName: u.firstName, lastName: u.lastName })) };
  });
}

export async function getDemoContext(povUserId: string) {
  const [mapping] = await db.select({ environmentId: demoEntityMappings.environmentId, demoId: demoEntityMappings.demoId, demoLeagueId: demoEnvironments.demoLeagueId })
    .from(demoEntityMappings).innerJoin(demoEnvironments, eq(demoEntityMappings.environmentId, demoEnvironments.id))
    .where(and(eq(demoEntityMappings.entityType, "user"), eq(demoEntityMappings.demoId, povUserId)));
  return mapping?.demoLeagueId ? mapping : undefined;
}
/** Durable lookup for jobs/services which do not have an Express request. */
export async function isDemoLeague(leagueId: string | null | undefined): Promise<boolean> {
  if (!leagueId) return false;
  const found = await db.select({ id: demoEnvironments.id }).from(demoEnvironments)
    .where(eq(demoEnvironments.demoLeagueId, leagueId)).limit(1);
  return found.length > 0;
}

const EXACT_DEMO_MUTATIONS: Record<string, RegExp[]> = {
  POST: [/^\/api\/games\/[^/]+\/rsvp$/, /^\/api\/substitute(?:-requests)?(?:\/[^/]+\/(?:approve|deny|respond))?$/, /^\/api\/conversations\/(?:direct|team-group|custom-group|captain-only)$/, /^\/api\/conversations\/[^/]+\/messages$/, /^\/api\/conversations\/[^/]+\/(?:read|reactions)$/, /^\/api\/scrimmages(?:\/[^/]+(?:\/(?:rsvp|requests|cohosts|finalize))?)?$/, /^\/api\/notifications\/[^/]+\/(?:read|dismiss)$/],
  PATCH: [/^\/api\/substitute(?:-requests)?\/[^/]+$/, /^\/api\/conversations\/[^/]+(?:\/(?:messages\/[^/]+|read))?$/, /^\/api\/scrimmages\/[^/]+(?:\/(?:rsvp|requests\/[^/]+|cohosts\/[^/]+))?$/, /^\/api\/notifications\/[^/]+\/(?:read|dismiss)$/],
  PUT: [/^\/api\/games\/[^/]+\/rsvp$/, /^\/api\/scrimmages\/[^/]+(?:\/(?:rsvp|requests\/[^/]+))?$/, /^\/api\/notifications\/[^/]+\/(?:read|dismiss)$/],
  DELETE: [/^\/api\/conversations\/[^/]+(?:\/messages\/[^/]+)?$/, /^\/api\/scrimmages\/[^/]+\/cohosts\/[^/]+$/, /^\/api\/notifications\/[^/]+\/(?:read|dismiss)$/],
};
export function demoMutationAllowed(method: string, path: string) {
  return !["POST", "PUT", "PATCH", "DELETE"].includes(method) || (EXACT_DEMO_MUTATIONS[method] ?? []).some(rule => rule.test(path));
}
export function containsForbiddenDemoBody(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    // Empty invitation fields are emitted by the normal scrimmage form and
    // are harmless; any actual external email target is not.
    if (/(invite|cohost|selected).*emails?$/i.test(key)) {
      if (Array.isArray(child) ? child.some(v => typeof v === "string" && v.trim()) : typeof child === "string" && child.trim()) return true;
      continue;
    }
    if (/^(payment|stripe|iap|email|phone)/i.test(key)) return true;
    if (containsForbiddenDemoBody(child)) return true;
  }
  return false;
}
export function hasDemoPaymentScrimmageFields(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  const cost = body.costPerPlayer;
  return (typeof cost === "number" && cost > 0) || (typeof cost === "string" && Number(cost) > 0) ||
    body.joinMode === "first_pay" || body.join_mode === "first_pay";
}
/** Ensures client supplied user references cannot point back into production. */
export async function demoBodyUserIdsAreMapped(environmentId: string, value: unknown): Promise<boolean> {
  const ids: string[] = [];
  const visit = (item: unknown, key = "") => {
    if (typeof item === "string" && /(user|member|recipient|participant|invitee|host|cohost|selected).*ids?$/i.test(key)) ids.push(item);
    else if (Array.isArray(item)) item.forEach(v => visit(v, key));
    else if (item && typeof item === "object") Object.entries(item as Record<string, unknown>).forEach(([k, v]) => visit(v, k));
  };
  visit(value);
  if (!ids.length) return true;
  const found = await db.select({ demoId: demoEntityMappings.demoId }).from(demoEntityMappings)
    .where(and(eq(demoEntityMappings.environmentId, environmentId), eq(demoEntityMappings.entityType, "user"), inArray(demoEntityMappings.demoId, ids)));
  return found.length === new Set(ids).size;
}
/**
 * Resource boundary used by auth before every Demo handler.  A copied mapping
 * is not sufficient for newly-created rows, so league-owned tables are also
 * checked directly against the active demo league.
 */
export async function demoResourcesAreIsolated(context: NonNullable<Request["demoContext"]>, input: Record<string, unknown>, path: string): Promise<boolean> {
  const ids: Record<"league" | "team" | "game" | "conversation" | "scrimmage" | "event" | "user", string[]> = {
    league: [], team: [], game: [], conversation: [], scrimmage: [], event: [], user: [],
  };
  const collect = (value: unknown, key = "") => {
    const type = /leagueids?$/i.test(key) ? "league" : /(?:team|requestingteam)ids?$/i.test(key) ? "team" :
      /gameids?$/i.test(key) ? "game" : /conversationids?$/i.test(key) ? "conversation" :
      /scrimmageids?$/i.test(key) ? "scrimmage" : /(?:event|teamevent)ids?$/i.test(key) ? "event" :
      /(user|member|recipient|participant|invitee|host|cohost|selected).*ids?$/i.test(key) ? "user" : null;
    if (type && typeof value === "string") ids[type].push(value);
    else if (Array.isArray(value)) value.forEach(v => collect(v, key));
    else if (value && typeof value === "object") Object.entries(value as Record<string, unknown>).forEach(([k, v]) => collect(v, k));
  };
  collect(input);
  // Route :id is a resource even where a legacy route does not name it.
  const conversationMatch = path.match(/\/conversations\/([^/]+)/);
  const gameMatch = path.match(/\/games\/([^/]+)/);
  const scrimmageMatch = path.match(/\/scrimmages\/([^/]+)/);
  if (conversationMatch) ids.conversation.push(conversationMatch[1]);
  if (gameMatch) ids.game.push(gameMatch[1]);
  if (scrimmageMatch) ids.scrimmage.push(scrimmageMatch[1]);
  const allInLeague = async (table: any, column: any, values: string[], predicate?: any) => {
    if (!values.length) return true;
    const rows = await db.select({ id: table.id }).from(table).where(predicate ?? and(inArray(column, Array.from(new Set(values))), eq(table.leagueId, context.demoLeagueId)));
    return rows.length === new Set(values).size;
  };
  if (ids.league.some(id => id !== context.demoLeagueId)) return false;
  if (!await allInLeague(teams, teams.id, ids.team)) return false;
  if (!await allInLeague(games, games.id, ids.game)) return false;
  if (!await allInLeague(conversations, conversations.id, ids.conversation)) return false;
  if (!await allInLeague(scrimmages, scrimmages.id, ids.scrimmage)) return false;
  if (ids.event.length) {
    const rows = await db.select({ id: teamEvents.id }).from(teamEvents).innerJoin(teams, eq(teamEvents.teamId, teams.id))
      .where(and(inArray(teamEvents.id, Array.from(new Set(ids.event))), eq(teams.leagueId, context.demoLeagueId)));
    if (rows.length !== new Set(ids.event).size) return false;
  }
  return demoBodyUserIdsAreMapped(context.environmentId, { userIds: ids.user });
}
export const enforceDemoMutation: RequestHandler = (req, res, next) => {
  if (!req.demoContext) return next();
  if (!demoMutationAllowed(req.method, req.path) || containsForbiddenDemoBody(req.body)) return res.status(403).json({ message: "This action is not available in Demo." });
  next();
};

export function registerDemoRoutes(app: Express, authenticated: RequestHandler) {
  const requireOwner = (req: Request, res: any) =>
    req.realActor?.displayId === DEMO_OWNER_DISPLAY_ID ||
    (res.status(403).json({ message: "Demo access denied" }), false);
  const getOwnerEnvironment = async () => {
    const [source] = await db.select({ id: leagues.id }).from(leagues).where(eq(leagues.name, "Mentor 35+"));
    if (!source) return undefined;
    const [env] = await db.select().from(demoEnvironments).where(eq(demoEnvironments.sourceLeagueId, source.id));
    return env;
  };
  const getPovUsers = async (env?: typeof demoEnvironments.$inferSelect) => {
    if (!env) return [];
    const mappings = await db.select().from(demoEntityMappings).where(and(eq(demoEntityMappings.environmentId, env.id), eq(demoEntityMappings.entityType, "user")));
    if (!mappings.length) return [];
    const demoUsers = await db.select().from(users).where(inArray(users.id, mappings.map(m => m.demoId)));
    const sourceUsers = await db.select().from(users).where(inArray(users.id, mappings.map(m => m.sourceId)));
    const sourceById = new Map(sourceUsers.map(u => [u.id, u]));
    return demoUsers.map(user => {
      const mapping = mappings.find(m => m.demoId === user.id)!;
      const source = sourceById.get(mapping.sourceId);
      return { id: user.id, sourceDisplayId: source?.displayId ?? null, displayId: user.displayId,
        firstName: user.firstName, lastName: user.lastName, profileImageUrl: user.profileImageUrl, role: user.role };
    });
  };
  app.get("/api/demo/status", authenticated, async (req, res) => {
    if (!requireOwner(req, res)) return;
    const env = await getOwnerEnvironment();
    res.json({ authorized: true, hasSnapshot: !!env?.demoLeagueId, demoLeagueId: env?.demoLeagueId ?? null, syncedAt: env?.syncedAt ?? null, povUsers: await getPovUsers(env) });
  });
  app.get("/api/demo/users", authenticated, async (req, res) => {
    if (!requireOwner(req, res)) return;
    res.json({ povUsers: await getPovUsers(await getOwnerEnvironment()) });
  });
  app.post("/api/demo/sync", authenticated, async (req, res) => {
    if (!requireOwner(req, res)) return;
    try { res.json(await syncDemo()); } catch (error: any) { res.status(400).json({ message: error.message }); }
  });
}
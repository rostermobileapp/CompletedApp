import { and, eq, isNotNull, isNull, or } from "drizzle-orm";
import { db } from "./db";
import { importedPlayers, leagueInvitesSent, leagueMemberships, placeholderPlayers, teamMemberships, teams, users } from "@shared/schema";

export type LeagueInviteCandidate = {
  id: string;
  name: string;
  email: string;
  teamName: string | null;
  userId: string | null;
  invited: boolean;
};

export function selectInviteRecipients(candidates: LeagueInviteCandidate[], recipientIds: unknown): LeagueInviteCandidate[] {
  if (!Array.isArray(recipientIds) || recipientIds.length === 0 || recipientIds.length > 100 ||
      recipientIds.some((id) => typeof id !== "string" || id.length > 320)) {
    throw new Error("Select between 1 and 100 players to invite");
  }
  const ids = new Set(recipientIds);
  if (ids.size !== recipientIds.length) throw new Error("Duplicate recipients are not allowed");
  const selected = candidates.filter((candidate) => ids.has(candidate.id));
  if (selected.length !== ids.size) throw new Error("A selected player is not in this league");
  return selected;
}

export async function getLeagueInviteCandidates(leagueId: string): Promise<LeagueInviteCandidate[]> {
  const [members, teamRows, placeholders, imports, sentRows] = await Promise.all([
    db.select({
      userId: leagueMemberships.userId,
      firstName: users.firstName,
      lastName: users.lastName,
      displayFirstName: leagueMemberships.displayFirstName,
      displayLastName: leagueMemberships.displayLastName,
      email: users.email,
      assignedTeamId: leagueMemberships.assignedTeamId,
    }).from(leagueMemberships).innerJoin(users, eq(users.id, leagueMemberships.userId))
      .where(eq(leagueMemberships.leagueId, leagueId)),
    db.select({ userId: teamMemberships.userId, teamId: teams.id, teamName: teams.name })
      .from(teamMemberships).innerJoin(teams, eq(teamMemberships.teamId, teams.id))
      .where(eq(teams.leagueId, leagueId)),
    db.select({
      firstName: placeholderPlayers.firstName, lastName: placeholderPlayers.lastName,
      email: placeholderPlayers.email, teamId: placeholderPlayers.teamId,
    }).from(placeholderPlayers).leftJoin(teams, eq(placeholderPlayers.teamId, teams.id))
      .where(or(eq(placeholderPlayers.leagueId, leagueId), eq(teams.leagueId, leagueId))),
    db.select({
      firstName: importedPlayers.firstName, lastName: importedPlayers.lastName,
      email: importedPlayers.email, teamId: importedPlayers.teamId,
    }).from(importedPlayers).where(and(
      eq(importedPlayers.leagueId, leagueId),
      isNotNull(importedPlayers.email), isNull(importedPlayers.mergedWithUserId),
    )),
    db.select({ userId: leagueInvitesSent.userId }).from(leagueInvitesSent).where(eq(leagueInvitesSent.leagueId, leagueId)),
  ]);
  const sent = new Set(sentRows.map((row) => row.userId.toLowerCase()));
  const teamsById = new Map<string, string>();
  const teamsByUser = new Map<string, string>();
  // Include teams not occupied by registered members, for placeholders/imports.
  const leagueTeams = await db.select({ id: teams.id, name: teams.name }).from(teams).where(eq(teams.leagueId, leagueId));
  for (const team of leagueTeams) teamsById.set(team.id, team.name);
  for (const row of teamRows) teamsByUser.set(row.userId, row.teamName);

  const byEmail = new Map<string, LeagueInviteCandidate>();
  for (const member of members) {
    const email = member.email?.trim().toLowerCase();
    if (!email || email.endsWith("@placeholder.roster")) continue;
    if (byEmail.has(email)) continue; // Duplicate membership rows are not multiple recipients.
    byEmail.set(email, {
      id: `user:${member.userId}`, userId: member.userId, email,
      name: `${member.displayFirstName || member.firstName || ""} ${member.displayLastName || member.lastName || ""}`.trim() || email,
      teamName: (member.assignedTeamId && teamsById.get(member.assignedTeamId)) || teamsByUser.get(member.userId) || null,
      invited: sent.has(member.userId.toLowerCase()) || sent.has(email),
    });
  }
  for (const person of [...placeholders, ...imports]) {
    const email = person.email?.trim().toLowerCase();
    if (!email || email.endsWith("@placeholder.roster") || byEmail.has(email)) continue;
    byEmail.set(email, {
      id: `email:${email}`, userId: null, email,
      name: `${person.firstName ?? ""} ${person.lastName ?? ""}`.trim() || email,
      teamName: person.teamId ? teamsById.get(person.teamId) ?? null : null,
      invited: sent.has(email),
    });
  }
  return Array.from(byEmail.values()).sort((a, b) => a.name.localeCompare(b.name));
}
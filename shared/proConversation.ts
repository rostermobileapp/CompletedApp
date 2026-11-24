import type { ProContext } from "./proCoverage";

/** A display tag on a personal DM/custom group is not an entitlement owner. */
export function proConversationContext(conversation?: {
  type: string; teamId?: string | null; leagueId?: string | null;
} | null): ProContext {
  if (conversation?.type === "team_group" && conversation.teamId) return { teamId: conversation.teamId };
  if (conversation?.type === "captain_only" && conversation.leagueId) return { leagueId: conversation.leagueId };
  return {};
}

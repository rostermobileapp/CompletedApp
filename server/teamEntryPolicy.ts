import { sql } from "drizzle-orm";
import type { RequestHandler } from "express";

// These are server-owned, static SQL fragments. Display IDs are not invitations.
// Check both classifiers: school teams can predate league_type, and Youth teams
// can still have the legacy adult program_type inside a Youth league.
const publicLeagueSql = `leagues.league_type = 'adult' AND NOT EXISTS (
  SELECT 1 FROM public.teams protected_team
  WHERE protected_team.league_id = leagues.id
    AND protected_team.program_type IS DISTINCT FROM 'adult'
)`;
const publicTeamSql = `teams.program_type = 'adult'
  AND (teams.league_id IS NULL OR (${publicLeagueSql}))`;
export const publicLeagueDiscoveryCondition = sql.raw(`(${publicLeagueSql})`);
export const publicTeamDiscoveryCondition = sql.raw(`(${publicTeamSql})`);

type EntryDb = { query: (text: string, values?: any[]) => Promise<{ rows: any[] }> };
export class TeamEntryError extends Error {
  constructor(public code: string, public status: number, message: string) { super(message); }
}

export class TeamEntryPolicy {
  constructor(private db: EntryDb) {}

  async publicLeagueJoin(leagueId: string) {
    const [league] = (await this.db.query(`SELECT (${publicLeagueSql}) AS open_join
      FROM public.leagues WHERE id=$1`, [leagueId])).rows;
    if (!league) throw new TeamEntryError("LEAGUE_NOT_FOUND", 404, "League not found.");
    if (!league.open_join) throw new TeamEntryError("INVITATION_REQUIRED", 403,
      "High School and Youth teams are invite-only. Use an invitation or a valid team invite code.");
  }

  async discoverableTeam(teamId: string) {
    return (await this.db.query(`SELECT 1 FROM public.teams
      LEFT JOIN public.leagues ON leagues.id=teams.league_id
      WHERE teams.id=$1 AND (${publicTeamSql})`, [teamId])).rows.length > 0;
  }

  async leagueManager(leagueId: string, actorId: string) {
    const [league] = (await this.db.query(`SELECT commissioner_id=$2 OR EXISTS (
      SELECT 1 FROM public.league_memberships delegated
      WHERE delegated.league_id=leagues.id AND delegated.user_id=$2
        AND delegated.status='approved'
        AND delegated.league_role IN ('commissioner','secondary_commissioner')
      ) AS allowed FROM public.leagues WHERE id=$1`, [leagueId, actorId])).rows;
    if (!league) throw new TeamEntryError("LEAGUE_NOT_FOUND", 404, "League not found.");
    if (!league.allowed) throw new TeamEntryError("LEAGUE_AUTHORITY_REQUIRED", 403,
      "Only this league's approved commissioners can manage membership.");
  }

  async membershipDecision(membershipId: string, actorId: string) {
    const [target] = (await this.db.query("SELECT league_id FROM public.league_memberships WHERE id=$1", [membershipId])).rows;
    if (!target) throw new TeamEntryError("MEMBERSHIP_NOT_FOUND", 404, "Membership not found.");
    await this.leagueManager(target.league_id, actorId);
  }

  async teamCreation(leagueId: string, actorId: string) {
    // Creating a new team is distinct from requesting membership in an existing
    // team, but an outsider must not use creation to enter a protected league.
    try { await this.publicLeagueJoin(leagueId); }
    catch (error) {
      if (!(error instanceof TeamEntryError) || error.code !== "INVITATION_REQUIRED") throw error;
      await this.leagueManager(leagueId, actorId);
    }
  }

  async teamAssignment(leagueId: string, teamId: string) {
    if (!(await this.db.query("SELECT 1 FROM public.teams WHERE id=$1 AND league_id=$2", [teamId, leagueId])).rows.length) {
      throw new TeamEntryError("TEAM_LEAGUE_MISMATCH", 403, "The selected team must belong to this league.");
    }
  }
}

export function enforceTeamEntry(check: (req: any) => Promise<void>): RequestHandler {
  return async (req, res, next) => {
    try { await check(req); next(); }
    catch (error) {
      if (error instanceof TeamEntryError) {
        res.status(error.status).json({ code: error.code, message: error.message }); return;
      }
      // A failed classification/authority lookup must never fall back to open join.
      console.error("[Team entry] Policy check failed.");
      res.status(503).json({ code: "TEAM_ENTRY_UNAVAILABLE", message: "Unable to verify team access. Please try again." });
    }
  };
}

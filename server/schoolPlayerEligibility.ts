import { randomUUID } from "node:crypto";
import { playerEligibilityInput, type SchoolEligibilityWorkspace, type SchoolPlayerEligibility } from "../shared/schoolPlayerEligibility";
import { StaffBase, staffFail, uuid } from "./highSchoolStaffBase";
import type { OnboardingActor } from "./highSchoolOnboarding";
import type { ParentTransaction } from "./highSchoolParentSecurity";
import { queueEligibilityAlerts } from "./schoolEligibilityAlerts";

export async function requirePlayerEligibility(db: Pick<ParentTransaction, "query">) {
  const [row] = (await db.query(`SELECT
    to_regclass('hs_onboarding.league_player_eligibility') IS NOT NULL
    AND to_regclass('hs_onboarding.team_player_eligibility') IS NOT NULL
    AND to_regclass('hs_onboarding.player_eligibility_audit') IS NOT NULL AS installed`)).rows;
  if (!row?.installed) staffFail("PLAYER_ELIGIBILITY_UPDATE_REQUIRED", 503);
}

/** Caller already holds the program lock; share the eligibility row lock with
 * eligibility writes so a stale lineup cannot override a new restriction. */
export async function assertPlayerCanDress(db: ParentTransaction, leagueId: string, teamId: string, playerId: string) {
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`school-eligibility:${leagueId}:${playerId}`]);
  const [status] = (await db.query(`SELECT
    EXISTS(SELECT 1 FROM hs_onboarding.league_player_eligibility WHERE league_id=$1 AND child_id=$3 AND restricted)
    OR EXISTS(SELECT 1 FROM hs_onboarding.team_player_eligibility WHERE team_id=$2 AND child_id=$3 AND restricted) AS restricted`,
  [leagueId, teamId, playerId])).rows;
  if (status?.restricted) staffFail("PLAYER_INELIGIBLE", 403);
}

export class SchoolPlayerEligibilityService extends StaffBase {
  private async owner(db: ParentTransaction, actor: OnboardingActor, leagueId: string) {
    uuid.parse(leagueId); await this.active(db, actor);
    if (!(await db.query(`SELECT 1 FROM public.leagues WHERE id=$1 AND commissioner_id=$2
      AND league_type IN('high_school','youth') FOR SHARE`, [leagueId, actor.authId])).rows.length)
      staffFail("LEAGUE_MANAGEMENT_FORBIDDEN", 403);
  }
  private async roster(db: ParentTransaction, leagueId: string, teamId?: string): Promise<SchoolPlayerEligibility[]> {
    await requirePlayerEligibility(db);
    const rows = (await db.query(`SELECT DISTINCT c.id AS "playerId",c.first_name AS "firstName",c.last_name AS "lastName",
      t.id AS "teamId",t.name AS "teamName",p.name AS "programName",
      coalesce(l.restricted,false) AS "leagueRestricted",coalesce(l.reason,'') AS "leagueReason",coalesce(l.version,0) AS "leagueVersion",
      coalesce(e.restricted,false) AS "teamRestricted",coalesce(e.reason,'') AS "teamReason",coalesce(e.version,0) AS "teamVersion"
      FROM hs_onboarding.programs p JOIN hs_onboarding.teams source ON source.program_id=p.id
      JOIN public.teams t ON t.id=source.id::text AND t.program_id=p.id AND t.program_type='high_school'
      JOIN public.team_memberships m ON m.team_id=t.id AND m.user_id IS NULL AND m.role='player' AND m.status='approved'
      JOIN hs_onboarding.children c ON c.id=m.child_profile_id AND c.revoked_at IS NULL
      JOIN hs_onboarding.player_requests r ON r.id=c.player_request_id AND r.auth_id=c.parent_auth_id
        AND r.team_id=source.id AND r.status='approved'
      LEFT JOIN hs_onboarding.league_player_eligibility l ON l.league_id=p.league_id AND l.child_id=c.id
      LEFT JOIN hs_onboarding.team_player_eligibility e ON e.team_id=source.id AND e.child_id=c.id
      WHERE p.league_id=$1 AND p.status='approved' AND($2::uuid IS NULL OR source.id=$2)
      ORDER BY "teamName","lastName","firstName","playerId"`, [leagueId, teamId ?? null])).rows;
    return rows.map(row => ({ ...row, eligible: !row.leagueRestricted && !row.teamRestricted }));
  }
  async leagueWorkspace(actor: OnboardingActor, leagueId: string): Promise<SchoolEligibilityWorkspace> {
    return this.transaction(async db => {
      await this.owner(db, actor, leagueId);
      return { scope: "league", canEdit: true, players: await this.roster(db, leagueId) };
    });
  }
  async teamWorkspace(actor: OnboardingActor, teamId: string): Promise<SchoolEligibilityWorkspace> {
    return this.withScope(actor, teamId, async (db, scope) => ({
      scope: "team", canEdit: ["head_coach", "assistant_coach"].includes(scope.role),
      players: await this.roster(db, scope.leagueId, teamId),
    }));
  }
  async setLeague(actor: OnboardingActor, leagueId: string, teamId: string, playerId: string, input: unknown) {
    uuid.parse(teamId); uuid.parse(playerId); const data = playerEligibilityInput.parse(input);
    return this.transaction(async db => {
      await this.owner(db, actor, leagueId);
      // Match the lock order used by team operations and lineup saves.
      if (!(await db.query(`SELECT p.id FROM hs_onboarding.programs p
        JOIN hs_onboarding.teams t ON t.program_id=p.id
        WHERE t.id=$1 AND p.league_id=$2 AND p.status='approved' FOR UPDATE OF p`, [teamId, leagueId])).rows.length)
        staffFail("TEAM_LEAGUE_MISMATCH", 403);
      return this.change(db, actor, leagueId, teamId, playerId, "league", data);
    });
  }
  async setTeam(actor: OnboardingActor, teamId: string, playerId: string, input: unknown) {
    uuid.parse(playerId); const data = playerEligibilityInput.parse(input);
    return this.withScope(actor, teamId, async (db, scope) => {
      if (!["head_coach", "assistant_coach"].includes(scope.role) || this.leagueAdministration)
        staffFail("COACH_ELIGIBILITY_FORBIDDEN", 403);
      return this.change(db, actor, scope.leagueId, teamId, playerId, "team", data);
    });
  }
  private async change(db: ParentTransaction, actor: OnboardingActor, leagueId: string, teamId: string,
    playerId: string, scope: "league" | "team", data: { restricted: boolean; reason: string; version: number }) {
    await requirePlayerEligibility(db);
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`school-eligibility:${leagueId}:${playerId}`]);
    const player = (await this.roster(db, leagueId, teamId)).find(row => row.playerId === playerId);
    if (!player) return staffFail("PLAYER_TEAM_FORBIDDEN", 403);
    const current = scope === "league" ? player.leagueVersion : player.teamVersion;
    if (current !== data.version) staffFail("ELIGIBILITY_CHANGED_REFRESH_REQUIRED", 409);
    // Static, server-selected table/column names. Never accept scope from input.
    const table = scope === "league" ? "league_player_eligibility" : "team_player_eligibility";
    const column = scope === "league" ? "league_id" : "team_id";
    await db.query(`INSERT INTO hs_onboarding.${table}(${column},child_id,restricted,reason,updated_by)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(${column},child_id) DO UPDATE SET
      restricted=excluded.restricted,reason=excluded.reason,updated_by=excluded.updated_by,
      updated_at=now(),version=${table}.version+1`,
    [scope === "league" ? leagueId : teamId, playerId, data.restricted, data.restricted ? data.reason : "", actor.authId]);
    const auditId = randomUUID();
    await db.query(`INSERT INTO hs_onboarding.player_eligibility_audit(id,league_id,team_id,child_id,scope,restricted,reason,actor_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [auditId, leagueId, teamId, playerId, scope, data.restricted, data.reason, actor.authId]);
    if (scope === "league" && player.leagueRestricted !== data.restricted) {
      // A league restriction follows this child across every approved roster in
      // the league, not just the team selected in the management screen.
      const affected = (await this.roster(db, leagueId)).filter(row => row.playerId === playerId);
      await queueEligibilityAlerts(db, auditId, affected.map(row => row.teamId), this.live);
    }
    // Already-saved future lineups must not continue dressing a restricted child.
    if (data.restricted) await db.query(`UPDATE hs_onboarding.staff_lineup lineup SET state='scratch',updated_by=$5
      FROM hs_onboarding.staff_events event JOIN hs_onboarding.teams t ON t.id=event.team_id
      JOIN hs_onboarding.programs p ON p.id=t.program_id
      WHERE lineup.event_id=event.id AND lineup.child_id=$1 AND lineup.state='dress'
        AND event.status='scheduled' AND event.starts_at>now() AND event.deleted_at IS NULL AND p.league_id=$2
        AND($3::boolean OR event.team_id=$4)`, [playerId, leagueId, scope === "league", teamId, actor.authId]);
    return { saved: true };
  }
}

import type { SkinActor, SkinContext, SkinTeam } from "../shared/teamSkin";
import type { ParentSql } from "./highSchoolParentSecurity";

export class TeamSkinService {
  constructor(private pool: Pick<ParentSql, "query">,
    private adultTeams?: (authId: string) => Promise<{ id: string }[]>) {}
  async context(actor: SkinActor): Promise<SkinContext> {
    if (!(await this.pool.query("SELECT to_regclass('hs_onboarding.skin_version') AS installed")).rows[0]?.installed) {
      throw new Error("SKIN_SCHEMA_NOT_INSTALLED");
    }
    // Roles/programs come directly from the approved canonical membership,
    // never an account role, onboarding draft, request body or selected skin.
    let teams = (await this.pool.query(`SELECT DISTINCT ON(t.id)
      t.id,t.name,t.program_type,t.program_id,m.role,m.status
      FROM public.team_memberships m JOIN public.teams t ON t.id=m.team_id
      WHERE m.status='approved' AND
        (($2='adult' AND m.user_id=$1 AND m.child_profile_id IS NULL)
         OR($2='child' AND m.child_profile_id=$1::uuid AND m.user_id IS NULL
            AND m.role='player' AND t.program_type='high_school'))
      ORDER BY t.id,CASE m.role WHEN 'athletic_director' THEN 0 WHEN 'head_coach' THEN 1
        WHEN 'assistant_coach' THEN 2 WHEN 'team_manager' THEN 3 WHEN 'parent' THEN 4 ELSE 5 END`,
    [actor.id, actor.type])).rows as SkinTeam[];
    if (actor.type === "adult" && this.adultTeams) {
      // Preserve the existing adult selector's league-assignment, stale-team
      // and season rules rather than inventing another adult membership model.
      const ids = (await this.adultTeams(actor.id)).map(t => t.id);
      const adult = ids.length ? (await this.pool.query(`SELECT id,name,program_type,program_id,
        'player' AS role,'approved' AS status FROM public.teams
        WHERE id=ANY($1::varchar[]) AND program_type='adult' ORDER BY name`, [ids])).rows as SkinTeam[] : [];
      teams = [...teams.filter(t => t.program_type === "high_school"), ...adult];
    }
    // This flag only preserves the existing pending-onboarding boundary. It
    // never chooses a skin or grants an unapproved role.
    const restricted = actor.type === "child" || !!(await this.pool.query(
      "SELECT 1 FROM hs_onboarding.flows WHERE auth_id=$1 AND block_legacy=true", [actor.id],
    )).rows.length;
    return { actor, teams, restricted };
  }
}

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  schoolInvitationInput, schoolInput, schoolLeagueNameInput, schoolProgramInput, schoolProgramUpdateInput, schoolScheduleImportInput,
  schoolSchedulePreviewInput, schoolTeamInput, type SchoolLeagueWorkspace,
} from "../shared/schoolLeagueManagement";
import { OnboardingError, type OnboardingActor } from "./highSchoolOnboarding";
import type { ParentSql, ParentTransaction } from "./highSchoolParentSecurity";
import { HighSchoolStaffOperations } from "./highSchoolStaffOperations";
import { HighSchoolStaffEvents } from "./highSchoolStaffEvents";
import { HighSchoolFamilyReview } from "./highSchoolFamilySetup";
import { previewEvents } from "./highSchoolStaffImports";
import { StaffBase } from "./highSchoolStaffBase";
import { SchoolPlayerEligibilityService } from "./schoolPlayerEligibility";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const decision = z.object({ approve: z.boolean() }).strict();
export class SchoolLeagueManagement extends StaffBase {
  async eligibility(actor: OnboardingActor, leagueId: string) {
    return new SchoolPlayerEligibilityService(this.pool, undefined, undefined, this.live).leagueWorkspace(actor, leagueId);
  }
  async setEligibility(actor: OnboardingActor, leagueId: string, teamId: string, playerId: string, input: unknown) {
    return new SchoolPlayerEligibilityService(this.pool, undefined, undefined, this.live)
      .setLeague(actor, leagueId, teamId, playerId, input);
  }
  private staff: HighSchoolStaffOperations;
  private events: HighSchoolStaffEvents;
  private parents: HighSchoolFamilyReview;
  constructor(pool: ParentSql, live = false) {
    super(pool, undefined, undefined, live);
    this.staff = new HighSchoolStaffOperations(pool, undefined, undefined, live, true);
    this.parents = new HighSchoolFamilyReview(pool, undefined, undefined, live, true);
    this.events = new HighSchoolStaffEvents(pool, undefined,
      async () => { throw new Error("TEST_NOTIFICATION_DELIVERY_DISABLED"); }, live, true);
  }
  private async owner(db: ParentTransaction, actor: OnboardingActor, leagueId: string, forUpdate = false) {
    z.string().uuid().parse(leagueId);
    await this.active(db, actor);
    const [league] = (await db.query(`SELECT id,name,league_type AS "leagueType" FROM public.leagues
      WHERE id=$1 AND commissioner_id=$2 ${forUpdate ? "FOR UPDATE" : "FOR SHARE"}`, [leagueId, actor.authId])).rows;
    if (!league) throw new OnboardingError("LEAGUE_MANAGEMENT_FORBIDDEN", 403);
    if (!["high_school", "youth"].includes(league.leagueType)) throw new OnboardingError("SCHOOL_LEAGUE_REQUIRED", 400);
    return league as SchoolLeagueWorkspace["league"];
  }
  async rename(actor: OnboardingActor, leagueId: string, input: unknown) {
    const data = schoolLeagueNameInput.parse(input);
    return this.transaction(async db => {
      const league = await this.owner(db, actor, leagueId, true);
      if (league.name !== data.expectedName)
        throw new OnboardingError("LEAGUE_NAME_CHANGED_REFRESH_REQUIRED", 409);
      await db.query("UPDATE public.leagues SET name=$2 WHERE id=$1", [leagueId, data.name]);
      // The private mirror is created only once the league has a program.
      // Keep it synchronized if present; renaming must not create setup records.
      await db.query("UPDATE hs_onboarding.leagues SET name=$2 WHERE id=$1", [leagueId, data.name]);
      return { saved: true };
    });
  }
  private async target(db: ParentTransaction, leagueId: string, teamId: string) {
    z.string().uuid().parse(teamId);
    const [team] = (await db.query(`SELECT t.id,t.program_id FROM hs_onboarding.teams t
      JOIN hs_onboarding.programs p ON p.id=t.program_id
      JOIN public.teams canonical ON canonical.id=t.id::text AND canonical.program_id=p.id
        AND canonical.program_type='high_school'
      WHERE t.id=$1 AND p.league_id=$2 AND p.status='approved' FOR SHARE OF p`, [teamId, leagueId])).rows;
    if (!team) throw new OnboardingError("TEAM_LEAGUE_MISMATCH", 403);
    return team;
  }
  private async schoolAccess(db: ParentTransaction, actor: OnboardingActor, schoolId: string) {
    const [school] = (await db.query(`SELECT s.id,s.name,s.town FROM hs_onboarding.schools s
      WHERE s.id=$1 AND (s.created_by=$2 OR EXISTS (
        SELECT 1 FROM hs_onboarding.programs p JOIN public.leagues l ON l.id=p.league_id::text
        WHERE p.school_id=s.id AND l.commissioner_id=$2::text AND l.league_type IN('high_school','youth')
      )) FOR SHARE OF s`, [schoolId, actor.authId])).rows;
    if (!school) throw new OnboardingError("SCHOOL_ACCESS_FORBIDDEN", 403);
    return school;
  }
  async workspace(actor: OnboardingActor, leagueId: string): Promise<SchoolLeagueWorkspace> {
    return this.transaction(async db => {
      const league = await this.owner(db, actor, leagueId);
      if (!(await db.query("SELECT to_regclass('hs_onboarding.schools') AS installed")).rows[0]?.installed)
        throw new OnboardingError("SCHOOL_STRUCTURE_UPDATE_REQUIRED", 503);
      const schools = (await db.query(`SELECT s.id,s.name,s.town FROM hs_onboarding.schools s
        WHERE s.created_by=$1 OR EXISTS (SELECT 1 FROM hs_onboarding.programs p
          JOIN public.leagues l ON l.id=p.league_id::text WHERE p.school_id=s.id
          AND l.commissioner_id=$1::text AND l.league_type IN('high_school','youth'))
        ORDER BY s.name,s.town,s.id`, [actor.authId])).rows;
      const programs = (await db.query(`SELECT p.id,p.name,coalesce(s.town,p.town) AS town,p.status,p.school_id AS "schoolId"
        FROM hs_onboarding.programs p LEFT JOIN hs_onboarding.schools s ON s.id=p.school_id
        WHERE p.league_id=$1 ORDER BY s.name,p.name`, [leagueId])).rows;
      const teams = (await db.query(`SELECT t.id,t.name,t.program_id AS "programId" FROM hs_onboarding.teams t
        JOIN hs_onboarding.programs p ON p.id=t.program_id WHERE p.league_id=$1 ORDER BY p.name,t.name`, [leagueId])).rows;
      const staffRequests = (await db.query(`SELECT r.id,r.auth_id AS "authId",r.role,coalesce(s.name,p.name) AS school,t.name AS "teamName",
        coalesce(nullif(trim(concat(u.raw_user_meta_data->>'first_name',' ',u.raw_user_meta_data->>'last_name')),''),'Staff applicant') AS name
        FROM hs_onboarding.staff_requests r JOIN hs_onboarding.programs p ON p.id=r.program_id
        LEFT JOIN hs_onboarding.schools s ON s.id=p.school_id
        JOIN auth.users u ON u.id=r.auth_id LEFT JOIN hs_onboarding.teams t ON t.id=r.team_id
        WHERE p.league_id=$1 AND r.status='pending' ORDER BY r.created_at LIMIT 200`, [leagueId])).rows;
      const parentRequests = (await db.query(`SELECT r.id,r.auth_id AS "parentAuthId",r.team_id AS "teamId",
        r.details->>'firstName' AS "firstName",r.details->>'lastName' AS "lastName",t.name AS "teamName"
        FROM hs_onboarding.player_requests r JOIN hs_onboarding.teams t ON t.id=r.team_id
        JOIN hs_onboarding.programs p ON p.id=t.program_id
        WHERE p.league_id=$1 AND r.status='pending_staff' ORDER BY r.consented_at LIMIT 200`, [leagueId])).rows;
      const events = (await db.query(`SELECT e.id,e.team_id AS "teamId",t.name AS "teamName",e.title,e.opponent,
        e.starts_at AS "startsAt",e.status FROM hs_onboarding.staff_events e
        JOIN hs_onboarding.teams t ON t.id=e.team_id JOIN hs_onboarding.programs p ON p.id=t.program_id
        WHERE p.league_id=$1 AND e.deleted_at IS NULL ORDER BY e.starts_at LIMIT 500`, [leagueId])).rows;
      return { actorId: actor.authId, league, schools, programs, teams, staffRequests, parentRequests, events };
    });
  }
  async school(actor: OnboardingActor, leagueId: string, input: unknown) {
    const data = schoolInput.parse(input);
    return this.transaction(async db => {
      await this.owner(db, actor, leagueId);
      const id = randomUUID();
      await db.query("INSERT INTO hs_onboarding.schools(id,name,town,created_by) VALUES($1,$2,$3,$4)",
        [id, data.name, data.town, actor.authId]);
      return { saved: true, id };
    });
  }
  async program(actor: OnboardingActor, leagueId: string, input: unknown) {
    const data = schoolProgramInput.parse(input);
    return this.transaction(async db => {
      const league = await this.owner(db, actor, leagueId);
      const school = await this.schoolAccess(db, actor, data.schoolId);
      await db.query("INSERT INTO hs_onboarding.leagues(id,name) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET name=excluded.name", [leagueId, league.name]);
      const id = randomUUID();
      await db.query(`INSERT INTO hs_onboarding.programs(id,league_id,school_id,name,town,status,requested_by,approved_by)
        VALUES($1,$2,$3,$4,$5,'approved',$6,$6)`, [id, leagueId, school.id, data.name, school.town, actor.authId]);
      return { saved: true, id };
    });
  }
  async updateProgram(actor: OnboardingActor, leagueId: string, id: string, input: unknown) {
    z.string().uuid().parse(id);
    const data = schoolProgramUpdateInput.parse(input);
    return this.transaction(async db => {
      await this.owner(db, actor, leagueId);
      const school = await this.schoolAccess(db, actor, data.schoolId);
      const updated = await db.query(`UPDATE hs_onboarding.programs SET school_id=$3,name=$4,town=$5
        WHERE id=$1 AND league_id=$2 RETURNING id`, [id, leagueId, school.id, data.name, school.town]);
      if (!updated.rows.length) throw new OnboardingError("PROGRAM_LEAGUE_MISMATCH", 403);
      return { saved: true, id };
    });
  }
  async team(actor: OnboardingActor, leagueId: string, input: unknown) {
    const data = schoolTeamInput.parse(input);
    return this.transaction(async db => {
      await this.owner(db, actor, leagueId);
      if (!(await db.query("SELECT 1 FROM hs_onboarding.programs WHERE id=$1 AND league_id=$2 AND status='approved' FOR UPDATE", [data.programId, leagueId])).rows.length)
        throw new OnboardingError("PROGRAM_LEAGUE_MISMATCH", 403);
      const id = randomUUID(), teamCode = randomBytes(8).toString("hex").toUpperCase();
      await db.query("INSERT INTO hs_onboarding.teams(id,program_id,name,code_digest) VALUES($1,$2,$3,$4)", [id, data.programId, data.name, digest(teamCode)]);
      await db.query(`INSERT INTO public.teams(id,name,league_id,program_type,program_id)
        VALUES($1,$2,$3,'high_school',$4)`, [id, data.name, leagueId, data.programId]);
      return { saved: true, id, teamCode };
    });
  }
  async invitation(actor: OnboardingActor, leagueId: string, input: unknown) {
    const data = schoolInvitationInput.parse(input);
    return this.transaction(async db => {
      await this.owner(db, actor, leagueId);
      await this.target(db, leagueId, data.teamId);
      const staged: string[] = [];
      if (data.kind === "parent") for (const player of data.players) {
        const source = digest(JSON.stringify([player.firstName.toLowerCase(), player.lastName.toLowerCase(), player.gradYear]));
        const [saved] = (await db.query(`INSERT INTO hs_onboarding.staged_players(id,team_id,source_key,first_name,last_name,grad_year,position,jersey_number)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(team_id,source_key)
          DO UPDATE SET expires_at=now()+interval '7 days' RETURNING id`,
        [randomUUID(), data.teamId, source, player.firstName, player.lastName, player.gradYear, player.position, player.jerseyNumber])).rows;
        staged.push(saved.id);
      }
      const invitation = randomBytes(32).toString("base64url"), expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
      await db.query(`INSERT INTO hs_onboarding.invitations(token_digest,team_id,kind,recipient_email,staff_role,staged_ids,created_by,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [digest(invitation), data.teamId, data.kind, data.email,
        data.kind === "staff" ? data.role : null, staged, actor.authId, expiresAt]);
      return { saved: true, invitation, recipientEmail: data.email, expiresAt, delivery: "manual" as const };
    });
  }
  async staffDecision(actor: OnboardingActor, leagueId: string, id: string, input: unknown) {
    z.string().uuid().parse(id);const data = decision.parse(input);
    await this.transaction(async db => {
      await this.owner(db, actor, leagueId);
      if (!(await db.query(`SELECT 1 FROM hs_onboarding.staff_requests r JOIN hs_onboarding.programs p ON p.id=r.program_id
        WHERE r.id=$1 AND p.league_id=$2`, [id, leagueId])).rows.length) throw new OnboardingError("REQUEST_LEAGUE_MISMATCH", 403);
    });
    return this.staff.decide(actor, id, data.approve);
  }
  async parentDecision(actor: OnboardingActor, leagueId: string, id: string, input: unknown) {
    const data = decision.extend({ teamId: z.string().uuid() }).parse(input);
    await this.transaction(async db => { await this.owner(db, actor, leagueId);await this.target(db, leagueId, data.teamId); });
    return this.parents.decide(actor, data.teamId, id, { approve: data.approve });
  }
  async schedulePreview(actor: OnboardingActor, leagueId: string, input: unknown) {
    const data = schoolSchedulePreviewInput.parse(input);
    await this.transaction(async db => { await this.owner(db, actor, leagueId);await this.target(db, leagueId, data.teamId); });
    return previewEvents(data.format, data.text);
  }
  async scheduleImport(actor: OnboardingActor, leagueId: string, input: unknown) {
    const data = schoolScheduleImportInput.parse(input);
    await this.transaction(async db => { await this.owner(db, actor, leagueId);await this.target(db, leagueId, data.teamId); });
    return this.events.import(actor, data.teamId, { rows: data.rows });
  }
}

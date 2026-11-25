import type { ParentSql, ParentTransaction } from "./highSchoolParentSecurity";
import { OnboardingError, type OnboardingActor } from "./highSchoolOnboarding";
import { staffRoles, type StaffRole } from "../shared/highSchoolStaff";
import { HS_CONSENT_VERSION } from "../shared/highSchoolOnboarding";
import { z } from "zod";
import { requireProductionOnboardingTester } from "./productionOnboardingTests";

export const staffFail = (code: string, status = 400): never => { throw new OnboardingError(code, status); };
export type StaffScope = { teamId: string; programId: string; leagueId: string; role: StaffRole };
export type StaffDispatch = (event: { id: string; eventId: string; teamId: string; version: number; action: string }) => Promise<void>;
export type StaffPaymentEligibility = (authId: string, leagueId: string) => Promise<boolean>;
export const uuid = z.string().uuid();
export const staffName = z.string().trim().min(1).max(100).refine(v => !/[\x00-\x1f\x7f]/.test(v));
export class StaffBase {
  constructor(protected pool: ParentSql, protected paymentEligibility: StaffPaymentEligibility = async () => false,
    protected dispatch: StaffDispatch = async () => { /* Explicit no-delivery DEV transport. */ },
    protected live = false) {}
  async installed() {
    return !!(await this.pool.query("SELECT to_regclass('hs_onboarding.staff_version') AS installed")).rows[0]?.installed;
  }
  protected async transaction<T>(fn: (db: ParentTransaction) => Promise<T>) {
    const db = await this.pool.connect();
    try { await db.query("BEGIN"); const result = await fn(db); await db.query("COMMIT"); return result; }
    catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
  }
  protected async active(db: ParentTransaction, actor: OnboardingActor) {
    if (actor.productionTest) await requireProductionOnboardingTester(db, actor);
    if (!actor.emailVerified || (!this.live && (!actor.fixture || !actor.email.endsWith("@example.com")))) staffFail("DEV_FIXTURE_REQUIRED", 403);
    const row = await db.query(`SELECT 1 FROM auth.sessions s JOIN auth.users u ON u.id=s.user_id
      WHERE s.id=$1 AND s.user_id=$2 AND(s.not_after IS NULL OR s.not_after>now())
      AND u.email=$3 AND u.email_confirmed_at IS NOT NULL
      AND($4::boolean OR(lower(u.email) LIKE '%@example.com'
        AND u.raw_app_meta_data->>'synthetic_high_school_onboarding_dev'='true'))`, [actor.sessionId, actor.authId, actor.email, this.live]);
    if (!row.rows.length) staffFail("INVALID_SESSION", 401);
  }
  /** Every operation locks the program before checking canonical roles.
   * Approval/revocation and operations therefore serialize without a stale-authority window. */
  protected async scope(db: ParentTransaction, actor: OnboardingActor, teamId: string): Promise<StaffScope> {
    uuid.parse(teamId); await this.active(db, actor);
    const program = (await db.query(`SELECT p.id,p.league_id FROM hs_onboarding.programs p
      JOIN public.teams t ON t.program_id=p.id JOIN hs_onboarding.teams source ON source.id::text=t.id AND source.program_id=p.id
      WHERE t.id=$1 AND t.program_type='high_school' AND p.status='approved' FOR UPDATE OF p`, [teamId])).rows[0];
    if (!program) staffFail("STAFF_TEAM_FORBIDDEN", 403);
    const role = (await db.query(`SELECT m.role FROM public.team_memberships m
      JOIN public.teams t ON t.id=m.team_id
      WHERE m.user_id=$1 AND m.child_profile_id IS NULL AND m.status='approved'
      AND t.program_type='high_school' AND t.program_id=$2
      AND(m.team_id=$3 OR m.role='athletic_director') AND m.role=ANY($4::text[])
      ORDER BY CASE m.role WHEN 'athletic_director' THEN 0 WHEN 'head_coach' THEN 1
        WHEN 'assistant_coach' THEN 2 ELSE 3 END LIMIT 1`,
    [actor.authId, program.id, teamId, [...staffRoles]])).rows[0]?.role;
    if (!role) staffFail("STAFF_TEAM_FORBIDDEN", 403);
    return { teamId, programId: program.id, leagueId: program.league_id, role };
  }
  protected withScope<T>(actor: OnboardingActor, teamId: string, work: (db: ParentTransaction, scope: StaffScope) => Promise<T>) {
    return this.transaction(async db => work(db, await this.scope(db, actor, teamId)));
  }
  protected manager(scope: StaffScope) {
    if (!["head_coach", "athletic_director"].includes(scope.role)) staffFail("STAFF_MANAGEMENT_FORBIDDEN", 403);
  }
  protected ad(scope: StaffScope) { if (scope.role !== "athletic_director") staffFail("PROGRAM_ACCESS_FORBIDDEN", 403); }
  protected async audit(db: ParentTransaction, actor: OnboardingActor, scope: StaffScope, event: string, target?: string) {
    await db.query(`INSERT INTO hs_onboarding.staff_audit(program_id,team_id,auth_id,event,target_id) VALUES($1,$2,$3,$4,$5)`,
      [scope.programId, scope.teamId, actor.authId, event, target ?? null]);
  }
  protected async players(db: ParentTransaction, scope: StaffScope, program = false) {
    const family = !!(await db.query("SELECT to_regclass('hs_onboarding.family_version') AS installed")).rows[0]?.installed;
    // Canonical child PLAYER memberships only. Disabled children can be rostered
    // but never receive an Auth identity, active session, RSVP or statistics.
    const rows = (await db.query(`SELECT DISTINCT c.id,r.details,c.parent_auth_id,
      t.id AS team_id,t.name AS team_name,
      EXISTS(SELECT 1 FROM public.team_memberships pm WHERE pm.team_id=t.id
        AND pm.user_id=${family ? "coalesce((SELECT adult_user_id FROM hs_onboarding.family_flows WHERE auth_id=c.parent_auth_id),c.parent_auth_id::text)" : "c.parent_auth_id::text"}
        AND pm.role='parent' AND pm.status='approved') AS guardian_linked,
      (r.consent_version=$3 AND r.consented_at IS NOT NULL) AS consented
      FROM public.team_memberships m JOIN public.teams t ON t.id=m.team_id
      JOIN hs_onboarding.children c ON c.id=m.child_profile_id AND c.revoked_at IS NULL
      JOIN hs_onboarding.player_requests r ON r.id=c.player_request_id AND r.auth_id=c.parent_auth_id AND r.team_id::text=t.id
      WHERE m.status='approved' AND m.role='player' AND m.user_id IS NULL AND r.status='approved'
      AND t.program_type='high_school' AND t.program_id=$2 AND($4::boolean OR t.id=$1)
      ORDER BY t.name,c.id`, [scope.teamId, scope.programId, HS_CONSENT_VERSION, program])).rows;
    const year = new Date().getUTCFullYear();
    const month = new Date().getUTCMonth();
    const schoolYear = year + (month >= 6 ? 1 : 0);
    return rows.map(row => ({
      id: row.id, type: "player" as const, firstName: String(row.details.firstName ?? ""),
      lastName: String(row.details.lastName ?? ""), number: String(row.details.jerseyNumber ?? ""),
      position: String(row.details.position ?? ""), gradYear: Number(row.details.gradYear ?? 0),
      className: ["Senior", "Junior", "Sophomore", "Freshman"][Number(row.details.gradYear) - schoolYear] ?? String(row.details.gradYear ?? ""),
      guardianLinked: !!row.guardian_linked, consented: !!row.consented,
      teamId: row.team_id as string, teamName: row.team_name as string, parentId: row.parent_auth_id as string,
    }));
  }
}

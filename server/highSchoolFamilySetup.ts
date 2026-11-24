import { randomUUID } from "node:crypto";
import { z } from "zod";
import { familyPlayerDraft, type FamilyRequest, type FamilySetupState } from "../shared/highSchoolFamilySetup";
import { hsPlayerDraft, HS_CONSENT_VERSION, HS_MAX_FAMILY_PLAYERS } from "../shared/highSchoolOnboarding";
import { HighSchoolOnboarding, OnboardingError, type OnboardingActor } from "./highSchoolOnboarding";
import { HighSchoolParentSecurity, ParentSecurityError, type ParentSql, type ParentTransaction } from "./highSchoolParentSecurity";
import { StaffBase, staffFail, uuid } from "./highSchoolStaffBase";

const revisionInput = z.object({ revision: z.number().int().nonnegative() }).strict();
type Coverage = FamilyRequest["coverage"];
export type FamilyCoverage = (userId: string, leagueId: string) => Promise<Coverage>;

/** Additive intake. Original flows, account roles, subscriptions and teams are never rewritten. */
export class HighSchoolFamilySetup {
  readonly intake: HighSchoolOnboarding;
  constructor(private pool: ParentSql, private parent: HighSchoolParentSecurity,
    private coverage: FamilyCoverage = async () => "uncovered") {
    this.intake = new HighSchoolOnboarding(pool, parent, true);
  }
  async installed() {
    return !!(await this.pool.query("SELECT to_regclass('hs_onboarding.family_version') AS installed")).rows[0]?.installed;
  }
  private async transaction<T>(work: (db: ParentTransaction) => Promise<T>) {
    const db = await this.pool.connect();
    try { await db.query("BEGIN"); const value = await work(db); await db.query("COMMIT"); return value; }
    catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
  }
  private async active(db: Pick<ParentSql, "query">, actor: OnboardingActor) {
    if (!actor.fixture || !actor.emailVerified || !actor.email.endsWith("@example.com"))
      throw new OnboardingError("DEV_FIXTURE_REQUIRED", 403);
    const row = await db.query(`SELECT 1 FROM auth.sessions s JOIN auth.users u ON u.id=s.user_id
      WHERE s.id=$1 AND s.user_id=$2 AND(s.not_after IS NULL OR s.not_after>now())
      AND u.email=$3 AND u.email_confirmed_at IS NOT NULL
      AND u.raw_app_meta_data->>'synthetic_high_school_onboarding_dev'='true'`, [actor.sessionId, actor.authId, actor.email]);
    if (!row.rows.length) throw new OnboardingError("INVALID_SESSION", 401);
  }
  async begin(actor: OnboardingActor) {
    await this.transaction(async db => {
      await this.active(db, actor);
      await db.query("SELECT id FROM auth.users WHERE id=$1 FOR UPDATE", [actor.authId]);
      // Same verified mapping as the adult account: never create a replacement
      // user, overwrite an ID, promote a role or move somebody's playing data.
      const adults = (await db.query(`SELECT id FROM public.users
        WHERE onboarding_completed=true AND(id=$1 OR lower(email)=lower($2))`, [actor.authId, actor.email])).rows;
      if (adults.length !== 1) throw new OnboardingError("EXISTING_ADULT_ACCOUNT_REQUIRED", 403);
      await db.query(`INSERT INTO hs_parent_security.accounts(auth_id,parent_email) VALUES($1,$2)
        ON CONFLICT(auth_id) DO NOTHING`, [actor.authId, actor.email]);
      await db.query(`INSERT INTO hs_onboarding.family_flows(auth_id,adult_user_id) VALUES($1,$2)
        ON CONFLICT(auth_id) DO NOTHING`, [actor.authId, adults[0].id]);
    });
    // This enrolls protection only. No child data, consent or authority is created.
    return { started: true, verificationRequired: true };
  }
  private async lock(db: ParentTransaction, actor: OnboardingActor, revision: number, grant?: string) {
    await this.active(db, actor);
    await db.query("SELECT id FROM auth.users WHERE id=$1 FOR UPDATE", [actor.authId]);
    if (!await this.parent.authorized(actor, grant, db)) throw new ParentSecurityError("PARENT_VERIFICATION_REQUIRED", 403);
    const flow = (await db.query("SELECT * FROM hs_onboarding.family_flows WHERE auth_id=$1 FOR UPDATE", [actor.authId])).rows[0];
    if (!flow) throw new OnboardingError("START_FAMILY_SETUP_FIRST", 409);
    if (flow.revision !== revision) throw new OnboardingError("DRAFT_CONFLICT", 409);
    return flow;
  }
  async state(actor: OnboardingActor, grant?: string): Promise<FamilySetupState> {
    await this.active(this.pool, actor);
    const flow = (await this.pool.query("SELECT * FROM hs_onboarding.family_flows WHERE auth_id=$1", [actor.authId])).rows[0];
    const verified = !!flow && await this.parent.authorized(actor, grant);
    const empty: FamilySetupState = { started: !!flow, verified, revision: 0, status: flow ? "parent_verification_required" : "not_started",
      players: [], guardianConfirmed: false, imported: false, requests: [], maximumPlayers: HS_MAX_FAMILY_PLAYERS, activationAvailable: false };
    if (!verified) return empty;
    const rows = (await this.pool.query(`SELECT r.id,r.player_key AS "playerKey",r.team_id AS "teamId",t.name AS "teamName",
      r.status,r.details,c.id AS "childId",p.league_id
      FROM hs_onboarding.player_requests r JOIN hs_onboarding.teams t ON t.id=r.team_id
      JOIN hs_onboarding.programs p ON p.id=t.program_id
      LEFT JOIN hs_onboarding.children c ON c.player_request_id=r.id AND c.parent_auth_id=r.auth_id AND c.revoked_at IS NULL
      WHERE r.auth_id=$1 ORDER BY r.consented_at,r.id`, [actor.authId])).rows;
    const requests = await Promise.all(rows.map(async row => {
      const { league_id, ...safe } = row;
      return { ...safe, status: row.status === "approved" ? "approved" : row.status === "denied" ? "denied" : "pending",
        deviceActivation: "disabled", coverage: await this.coverage(flow.adult_user_id, league_id) } as FamilyRequest;
    }));
    return { ...empty, revision: flow.revision, status: flow.status,
      players: flow.draft.players ?? [], guardianConfirmed: flow.draft.guardianConfirmed === true,
      imported: flow.status === "draft" && !!flow.draft.invitationDigest, requests };
  }
  async draft(actor: OnboardingActor, input: unknown, grant?: string) {
    const data = z.object({ revision: z.number().int().nonnegative(),
      players: z.array(familyPlayerDraft).max(HS_MAX_FAMILY_PLAYERS) }).strict().parse(input);
    return this.transaction(async db => {
      const flow = await this.lock(db, actor, data.revision, grant);
      if (flow.status !== "draft") throw new OnboardingError("REQUEST_ALREADY_SUBMITTED", 409);
      // A parent can discard an unsubmitted imported copy even after its
      // invitation expires/revokes. Never permit editing the staged identity.
      if (flow.draft.invitationDigest && data.players.length) throw new OnboardingError("IMPORT_REVIEW_REQUIRED", 409);
      const existing = (await db.query("SELECT player_key,details FROM hs_onboarding.player_requests WHERE auth_id=$1", [actor.authId])).rows;
      const keys = [...existing.map(p => p.player_key), ...data.players.map(p => p.id)];
      if (new Set(keys).size !== keys.length) throw new OnboardingError("DUPLICATE_PLAYER", 409);
      if (keys.length > HS_MAX_FAMILY_PLAYERS) throw new OnboardingError("HOUSEHOLD_LIMIT", 409);
      const names = [...existing.map(p => p.details), ...data.players].filter(p => p.firstName.trim() && p.lastName.trim())
        .map(p => `${p.firstName.trim().toLowerCase()}|${p.lastName.trim().toLowerCase()}|${p.gradYear}`);
      if (new Set(names).size !== names.length) throw new OnboardingError("DUPLICATE_PLAYER", 409);
      await db.query(`UPDATE hs_onboarding.family_flows SET draft=$2,revision=revision+1,updated_at=now() WHERE auth_id=$1`,
        [actor.authId, { players: data.players.map(p => ({ ...p, consent: false })), guardianConfirmed: false }]);
      return { saved: true };
    });
  }
  async consent(actor: OnboardingActor, input: unknown, grant?: string) {
    const data = z.object({ revision: z.number().int().nonnegative(), players: z.array(familyPlayerDraft).min(1).max(HS_MAX_FAMILY_PLAYERS),
      guardianConfirmed: z.literal(true) }).strict().parse(input);
    return this.intake.save(actor, { ...data, kind: "parent" }, grant);
  }
  async newDraft(actor: OnboardingActor, input: unknown, grant?: string) {
    const { revision } = revisionInput.parse(input);
    return this.transaction(async db => {
      const flow = await this.lock(db, actor, revision, grant);
      if (flow.status === "draft") throw new OnboardingError("UNSUBMITTED_DRAFT", 409);
      const count = (await db.query("SELECT count(DISTINCT player_key)::int AS n FROM hs_onboarding.player_requests WHERE auth_id=$1", [actor.authId])).rows[0].n;
      if (count >= HS_MAX_FAMILY_PLAYERS) throw new OnboardingError("HOUSEHOLD_LIMIT", 409);
      await db.query(`UPDATE hs_onboarding.family_flows SET draft='{}',status='draft',revision=revision+1,updated_at=now() WHERE auth_id=$1`, [actor.authId]);
      return { saved: true };
    });
  }
}

/** Review shares the staff program lock and hierarchy, not a requested role. */
export class HighSchoolFamilyReview extends StaffBase {
  async requests(actor: OnboardingActor, teamId: string) {
    return this.withScope(actor, teamId, async (db, scope) => {
      this.manager(scope);
      const requests = (await db.query(`SELECT r.id,r.details->>'firstName' AS "firstName",
        r.details->>'lastName' AS "lastName",r.details->>'gradYear' AS "gradYear",
        r.details->>'position' AS position,r.status,t.name AS "teamName"
        FROM hs_onboarding.player_requests r JOIN hs_onboarding.teams t ON t.id=r.team_id
        WHERE r.team_id=$1 AND r.status='pending_staff' ORDER BY r.consented_at,r.id`, [teamId])).rows;
      return { requests };
    });
  }
  async decide(actor: OnboardingActor, teamId: string, id: string, input: unknown) {
    uuid.parse(id);
    const { approve } = z.object({ approve: z.boolean() }).strict().parse(input);
    return this.withScope(actor, teamId, async (db, scope) => {
      this.manager(scope);
      const row = (await db.query(`SELECT r.* FROM hs_onboarding.player_requests r WHERE r.id=$1 AND r.team_id=$2 FOR UPDATE`, [id, teamId])).rows[0];
      if (!row || row.auth_id === actor.authId) staffFail("PLAYER_REVIEW_FORBIDDEN", 403);
      if (row.status !== "pending_staff") staffFail("DECISION_ALREADY_RECORDED", 409);
      await db.query("SELECT id FROM auth.users WHERE id=$1 FOR UPDATE", [row.auth_id]);
      if (approve) {
        const guardian = (await db.query(`SELECT a.auth_id,f.adult_user_id FROM hs_parent_security.accounts a
          JOIN auth.users u ON u.id=a.auth_id LEFT JOIN hs_onboarding.family_flows f ON f.auth_id=a.auth_id
          WHERE a.auth_id=$1 AND u.email_confirmed_at IS NOT NULL AND u.email=a.parent_email
          AND u.raw_app_meta_data->>'synthetic_high_school_onboarding_dev'='true'`, [row.auth_id])).rows[0];
        const household = (await db.query(`SELECT count(DISTINCT player_key)::int AS n FROM hs_onboarding.player_requests WHERE auth_id=$1`, [row.auth_id])).rows[0].n;
        if (!guardian || household > HS_MAX_FAMILY_PLAYERS) staffFail("GUARDIAN_LINK_REQUIRED", 403);
        if (row.consent_version !== HS_CONSENT_VERSION || !row.consented_at ||
          row.details.consent !== true || row.details.consentVersion !== HS_CONSENT_VERSION ||
          row.details.id !== row.player_key) staffFail("PLAYER_CONSENT_REQUIRED", 403);
        // Revalidate all fields, including identity and explicit consent.
        const player = hsPlayerDraft.parse(row.details);
        const parentId = guardian.adult_user_id ?? row.auth_id;
        // Never create or replace an adult account as a side effect of review.
        if (!(await db.query("SELECT 1 FROM public.users WHERE id=$1", [parentId])).rows.length) staffFail("GUARDIAN_ACCOUNT_REQUIRED", 403);
        const existing = (await db.query(`SELECT id,parent_auth_id,revoked_at,enabled FROM hs_onboarding.children WHERE player_request_id=$1 FOR UPDATE`, [id])).rows[0];
        if (existing && (existing.parent_auth_id !== row.auth_id || existing.revoked_at || existing.enabled)) staffFail("CHILD_REVIEW_REQUIRED", 409);
        const childId = existing?.id ?? randomUUID();
        if (!existing) await db.query(`INSERT INTO hs_onboarding.children(id,parent_auth_id,player_request_id,first_name,last_name,enabled)
          VALUES($1,$2,$3,$4,$5,false)`, [childId, row.auth_id, id, player.firstName, player.lastName]);
        // Separate rows preserve a parent's existing staff role on this team.
        if (!(await db.query(`SELECT 1 FROM public.team_memberships WHERE user_id=$1 AND team_id=$2 AND role='parent' AND status='approved'`, [parentId, teamId])).rows.length)
          await db.query(`INSERT INTO public.team_memberships(id,user_id,team_id,role,status,is_captain) VALUES($1,$2,$3,'parent','approved',false)`,
            [randomUUID(), parentId, teamId]);
        if (!(await db.query(`SELECT 1 FROM public.team_memberships WHERE child_profile_id=$1 AND team_id=$2 AND role='player' AND status='approved'`, [childId, teamId])).rows.length)
          await db.query(`INSERT INTO public.team_memberships(id,user_id,child_profile_id,team_id,role,status,is_captain)
            VALUES($1,NULL,$2,$3,'player','approved',false)`, [randomUUID(), childId, teamId]);
      }
      await db.query(`UPDATE hs_onboarding.player_requests SET status=$2,decided_by=$3,decided_at=now() WHERE id=$1`,
        [id, approve ? "approved" : "denied", actor.authId]);
      await this.audit(db, actor, scope, approve ? "consented_player_approved_device_disabled" : "player_request_declined", id);
      return { saved: true, activationAvailable: false };
    });
  }
}

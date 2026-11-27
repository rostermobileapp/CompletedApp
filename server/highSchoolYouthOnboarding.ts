import { hsHockeyType, hsJourneyInput, hsLeagueDraftInput, validateHsLeagueDraft } from "../shared/highSchoolYouthOnboarding";
import { HighSchoolOnboarding, OnboardingError, type OnboardingActor } from "./highSchoolOnboarding";
import { HighSchoolParentSecurity, type ParentSql, type ParentTransaction } from "./highSchoolParentSecurity";
import { requireProductionOnboardingTester } from "./productionOnboardingTests";

/** Additive, private DEV draft services. Never creates adult billing entitlements. */
export class HighSchoolYouthOnboarding {
  constructor(
    private pool: ParentSql,
    private parent: HighSchoolParentSecurity,
    private onboarding: HighSchoolOnboarding,
  ) {}
  async installed() {
    return !!(await this.pool.query("SELECT to_regclass('hs_onboarding.youth_version') AS installed")).rows[0]?.installed;
  }
  async requireParentAuthority(actor: OnboardingActor, grant?: string) {
    if (await this.parent.enrolled(actor.authId) && !await this.parent.authorized(actor, grant))
      throw new OnboardingError("PARENT_VERIFICATION_REQUIRED", 403);
  }
  private async transaction<T>(fn: (tx: ParentTransaction) => Promise<T>) {
    const tx = await this.pool.connect();
    try {
      await tx.query("BEGIN"); const result = await fn(tx); await tx.query("COMMIT"); return result;
    } catch (e) { await tx.query("ROLLBACK"); throw e; } finally { tx.release(); }
  }
  private async active(actor: OnboardingActor, db: Pick<ParentSql, "query"> = this.pool) {
    if (actor.productionTest) await requireProductionOnboardingTester(db, actor);
    if (!(await db.query(
      "SELECT 1 FROM auth.sessions WHERE id=$1 AND user_id=$2 AND (not_after IS NULL OR not_after>now())",
      [actor.sessionId, actor.authId],
    )).rows.length) throw new OnboardingError("INVALID_SESSION", 401);
  }
  private fixture(actor: OnboardingActor) {
    if (actor.productionTest && actor.emailVerified) return;
    if (!actor.fixture || !actor.emailVerified || !actor.email.endsWith("@example.com")) {
      throw new OnboardingError("DEV_FIXTURE_REQUIRED", 403);
    }
  }
  async state(actor: OnboardingActor, grant?: string): Promise<Record<string, any>> {
    const state = await this.onboarding.state(actor, grant);
    // A noninstalled extension must not break existing adult or legacy DEV flows.
    if (!await this.installed()) return state;
    const context = (await this.pool.query("SELECT hockey_type,journey FROM hs_onboarding.contexts WHERE auth_id=$1", [actor.authId])).rows[0];
    if (state.status === "parent_verification_required") return { ...state, hockeyType: context?.hockey_type };
    const league = state.path === "league_admin"
      ? (await this.pool.query("SELECT draft FROM hs_onboarding.league_drafts WHERE auth_id=$1", [actor.authId])).rows[0]
      : undefined;
    const suggestion = actor.fixture && !context?.journey?.referralPartnerId && !context?.journey?.referralSourceOther
      ? (await this.pool.query(`SELECT p.id FROM auth.users a JOIN referral_partners p
        ON upper(p.referral_code)=upper(a.raw_user_meta_data->'initial_referral'->>'code')
        AND p.status='approved' WHERE a.id=$1 LIMIT 1`, [actor.authId])).rows[0]?.id : undefined;
    return { ...state, hockeyType: context?.hockey_type, journey: context?.journey ?? {}, leagueDraft: league?.draft,
      ...(suggestion ? { suggestedReferralPartnerId: suggestion } : {}) };
  }
  async hockeyType(actor: OnboardingActor, input: unknown) {
    const { hockeyType } = hsHockeyType.parse(input);
    if (hockeyType !== "adult") this.fixture(actor);
    return this.transaction(async tx => {
      await this.active(actor, tx);
      await tx.query("SELECT id FROM auth.users WHERE id=$1 FOR UPDATE", [actor.authId]);
      const flow = (await tx.query("SELECT path FROM hs_onboarding.flows WHERE auth_id=$1", [actor.authId])).rows[0];
      if (flow && (["player", "organizer"].includes(flow.path) ? "adult" : "high_school_youth") !== hockeyType) {
        throw new OnboardingError("PATH_ALREADY_SELECTED", 409);
      }
      await tx.query(`INSERT INTO hs_onboarding.contexts(auth_id,hockey_type) VALUES($1,$2)
        ON CONFLICT(auth_id) DO UPDATE SET hockey_type=$2,updated_at=now()`, [actor.authId, hockeyType]);
      return { saved: true, hockeyType };
    });
  }
  private async lockFlow(tx: ParentTransaction, actor: OnboardingActor, revision: number, grant?: string) {
    await this.active(actor, tx); this.fixture(actor);
    const flow = (await tx.query("SELECT * FROM hs_onboarding.flows WHERE auth_id=$1 FOR UPDATE", [actor.authId])).rows[0];
    if (!flow || !["staff", "parent", "league_admin"].includes(flow.path)) throw new OnboardingError("WRONG_ONBOARDING_PATH", 403);
    if (flow.revision !== revision) throw new OnboardingError("DRAFT_CONFLICT", 409);
    if (flow.path === "parent" && await this.parent.enrolled(actor.authId) && !await this.parent.authorized(actor, grant, tx)) {
      throw new OnboardingError("PARENT_VERIFICATION_REQUIRED", 403);
    }
    return flow;
  }
  async referralPartners(actor: OnboardingActor) {
    await this.active(actor); this.fixture(actor);
    return (await this.pool.query(
      `SELECT id,org_name AS "orgName" FROM referral_partners WHERE status='approved' ORDER BY org_name LIMIT 500`,
    )).rows;
  }
  async journey(actor: OnboardingActor, input: unknown, grant?: string) {
    const data = hsJourneyInput.parse(input);
    return this.transaction(async tx => {
      const flow = await this.lockFlow(tx, actor, data.revision, grant);
      const prefix = flow.path === "league_admin" ? "league_" : `${flow.path}_`;
      if (!["hs_role", "referral", "profile"].includes(data.screen) && !data.screen.startsWith(prefix)) {
        throw new OnboardingError("WRONG_ONBOARDING_PATH", 403);
      }
      if (data.profile) {
        try { new Intl.DateTimeFormat("en", { timeZone: data.profile.timezone }); }
        catch { throw new OnboardingError("INVALID_TIMEZONE"); }
      }
      const old = (await tx.query("SELECT journey FROM hs_onboarding.contexts WHERE auth_id=$1 FOR UPDATE", [actor.authId])).rows[0]?.journey ?? {};
      if (data.staffRole !== undefined || data.programId !== undefined || data.teamId !== undefined) {
        if (flow.path !== "staff") throw new OnboardingError("WRONG_ONBOARDING_PATH", 403);
        const programId = data.programId !== undefined ? data.programId : old.programId;
        const teamId = data.teamId !== undefined ? data.teamId : old.teamId;
        if (programId && !(await tx.query(`SELECT 1 FROM hs_onboarding.programs
          WHERE id=$1 AND(status='approved' OR requested_by=$2)`, [programId, actor.authId])).rows.length) {
          throw new OnboardingError("UNKNOWN_SCHOOL");
        }
        if (teamId && (!programId || !(await tx.query(
          "SELECT 1 FROM hs_onboarding.teams WHERE id=$1 AND program_id=$2", [teamId, programId],
        )).rows.length)) throw new OnboardingError("WRONG_SCHOOL_TEAM");
      }
      // First confirmed partner is immutable, just like adult attribution.
      if (old.referralPartnerId && ((data.referralPartnerId && data.referralPartnerId !== old.referralPartnerId) || data.referralSourceOther)) {
        throw new OnboardingError("REFERRAL_LOCKED", 409);
      }
      if (old.referralSourceOther && (data.referralPartnerId ||
          (data.referralSourceOther && data.referralSourceOther !== old.referralSourceOther))) {
        throw new OnboardingError("REFERRAL_LOCKED", 409);
      }
      let partnerCode = old.referralCode;
      if (data.referralPartnerId) {
        const partner = (await tx.query(
          "SELECT id,referral_code FROM referral_partners WHERE id=$1 AND status='approved' FOR SHARE", [data.referralPartnerId],
        )).rows[0];
        if (!partner) throw new OnboardingError("INVALID_REFERRAL");
        partnerCode = partner.referral_code;
      }
      const { revision: _, ...fields } = data;
      const journey = { ...old, ...fields, ...(partnerCode ? { referralCode: partnerCode } : {}) };
      // Pending school identities do not become adult users or billing conversions.
      // This is a durable, validated attribution record for their eventual activation.
      await tx.query(`INSERT INTO hs_onboarding.contexts(auth_id,hockey_type,journey)
        VALUES($1,'high_school_youth',$2) ON CONFLICT(auth_id) DO UPDATE SET journey=$2,updated_at=now()`,
      [actor.authId, journey]);
      await tx.query("UPDATE hs_onboarding.flows SET revision=revision+1,updated_at=now() WHERE auth_id=$1", [actor.authId]);
      return { saved: true, journey, revision: data.revision + 1 };
    });
  }
  async leagueDraft(actor: OnboardingActor, grant?: string) {
    const state = await this.state(actor, grant);
    this.fixture(actor);
    if (state.path !== "league_admin") throw new OnboardingError("WRONG_ONBOARDING_PATH", 403);
    if (await this.parent.enrolled(actor.authId) && !await this.parent.authorized(actor, grant)) {
      throw new OnboardingError("PARENT_VERIFICATION_REQUIRED", 403);
    }
    return { ...state.leagueDraft, revision: state.revision, status: "draft", seats: { allocated: 0, total: 0 }, price: "[Price]" };
  }
  async saveLeagueDraft(actor: OnboardingActor, input: unknown, grant?: string) {
    const data = hsLeagueDraftInput.parse(input);
    return this.transaction(async tx => {
      const flow = await this.lockFlow(tx, actor, data.revision, grant);
      if (flow.path !== "league_admin") throw new OnboardingError("WRONG_ONBOARDING_PATH", 403);
      const previous = (await tx.query("SELECT draft FROM hs_onboarding.league_drafts WHERE auth_id=$1 FOR UPDATE", [actor.authId])).rows[0]?.draft ?? {};
      let draft: Record<string, any>;
      try { draft = validateHsLeagueDraft(previous, data); }
      catch (e) { throw new OnboardingError((e as Error).message); }
      await tx.query(`INSERT INTO hs_onboarding.league_drafts(auth_id,draft) VALUES($1,$2)
        ON CONFLICT(auth_id) DO UPDATE SET draft=$2,updated_at=now()`, [actor.authId, draft]);
      await tx.query("UPDATE hs_onboarding.flows SET revision=revision+1,updated_at=now() WHERE auth_id=$1", [actor.authId]);
      return { ...draft, saved: true, revision: data.revision + 1, status: "draft", activated: false, invitationsSent: 0, price: "[Price]" };
    });
  }
}

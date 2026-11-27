import { randomUUID } from "node:crypto";
import { z } from "zod";
import { hsChoosePath, hsSaveDraft, hsTeamEntry, HS_CONSENT_VERSION, HS_MAX_FAMILY_PLAYERS } from "../shared/highSchoolOnboarding";
import { HighSchoolParentSecurity, ParentSecurityError, parentDigest, type ParentActor, type ParentSql, type ParentTransaction } from "./highSchoolParentSecurity";
import { requireProductionOnboardingTester } from "./productionOnboardingTests";
import { independentChildSetupInstalled, saveIndependentChildProfiles } from "./highSchoolFamilyProfiles";
import { schoolProgramPresentation } from "./schoolProgramPresentation";

export class OnboardingError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
export type OnboardingActor = ParentActor & { email: string; emailVerified: boolean; fixture: boolean; productionTest?: boolean };
const fail = (code: string, status = 400): never => { throw new OnboardingError(code, status); };
const uuid = z.string().uuid();
export class HighSchoolOnboarding {
  staffDecisions?: { installed(): Promise<boolean>; decide(actor: OnboardingActor, id: string, approve: boolean): Promise<unknown> };
  // Only trusted server composition selects this store. The public original
  // onboarding routes always use the primary store.
  private readonly flowTable: "hs_onboarding.flows" | "hs_onboarding.family_flows";
  constructor(private pool: ParentSql, private parent: HighSchoolParentSecurity, family = false,
    private familyEligibility?: (actor: OnboardingActor, db: Pick<ParentSql, "query">) => Promise<unknown>,
    private liveFamily = false) {
    this.flowTable = family ? "hs_onboarding.family_flows" : "hs_onboarding.flows";
  }
  async installed() {
    return !!(await this.pool.query("SELECT to_regclass('hs_onboarding.version') AS installed")).rows[0]?.installed;
  }
  private async tx<T>(fn: (tx: ParentTransaction) => Promise<T>) {
    const tx = await this.pool.connect();
    try { await tx.query("BEGIN"); const result = await fn(tx); await tx.query("COMMIT"); return result; }
    catch (e) { await tx.query("ROLLBACK"); throw e; } finally { tx.release(); }
  }
  private fixture(actor: OnboardingActor) {
    if (actor.productionTest && actor.emailVerified) return;
    if (this.liveFamily && this.flowTable === "hs_onboarding.family_flows" && actor.emailVerified) return;
    if (!actor.fixture || !actor.emailVerified || !actor.email.endsWith("@example.com")) fail("DEV_FIXTURE_REQUIRED", 403);
  }
  private async active(actor: OnboardingActor, tx: Pick<ParentSql, "query"> = this.pool) {
    if (actor.productionTest) await requireProductionOnboardingTester(tx, actor);
    const session = await tx.query("SELECT 1 FROM auth.sessions WHERE id=$1 AND user_id=$2 AND (not_after IS NULL OR not_after>now())", [actor.sessionId, actor.authId]);
    if (!session.rows.length) fail("INVALID_SESSION", 401);
    if (this.flowTable === "hs_onboarding.family_flows") {
      // A family store must not bypass eligibility through shared intake
      // methods such as consent, invitation lookup or join.
      if (this.familyEligibility) await this.familyEligibility(actor, tx);
      else fail("FAMILY_ELIGIBILITY_UNAVAILABLE", 503);
    }
  }
  private async event(tx: ParentTransaction, actor: OnboardingActor, event: string, id?: string) {
    await tx.query("INSERT INTO hs_onboarding.audit(auth_id,event,target_id) VALUES($1,$2,$3)", [actor.authId,event,id??null]);
  }
  private async completedAdult(actor:OnboardingActor,tx:Pick<ParentSql,"query">=this.pool){
    return !!(await tx.query(`SELECT 1 FROM users WHERE onboarding_completed=true
      AND(id=$1::text OR($3::boolean AND lower(email)=lower($2::text))) LIMIT 1`,
      [actor.authId,actor.email,actor.emailVerified])).rows.length;
  }
  async blocksLegacy(authId: string,email?:string,emailVerified=false) {
    const row=(await this.pool.query(`SELECT coalesce(
      (SELECT block_legacy AND path IN('staff','parent','league_admin') FROM hs_onboarding.flows WHERE auth_id=$1::uuid),
      NOT EXISTS(SELECT 1 FROM users WHERE onboarding_completed=true AND
        (id=$1::text OR($3::boolean AND lower(email)=lower($2::text))))) AS blocked`,[authId,email??null,emailVerified])).rows[0];
    return row?.blocked!==false;
  }
  async state(actor: OnboardingActor, grant?: string) {
    await this.active(actor);
    const row = (await this.pool.query(`SELECT * FROM ${this.flowTable} WHERE auth_id=$1`, [actor.authId])).rows[0];
    if ((!row || row.path === "parent") && await this.parent.enrolled(actor.authId) && !await this.parent.authorized(actor, grant)) {
      return { active: !!row?.block_legacy, path: row?.path ?? null, revision: row?.revision ?? 0,
        status: "parent_verification_required", fixtureOnly: true };
    }
    if (!row) {
      return { active: !await this.completedAdult(actor), path: null, revision: 0, status: "choose", fixtureOnly: true };
    }
    const active = ["staff","parent","league_admin"].includes(row.path) && row.block_legacy;
    if (row.path==="parent" && !await this.parent.authorized(actor,grant)) {
      return { active, path: row.path, revision: row.revision, status: "parent_verification_required", fixtureOnly: true };
    }
    const {invitationDigest,...draft}=row.draft;
    return { active,path:row.path,revision:row.revision,status:row.status,draft:{...draft,imported:!!invitationDigest},fixtureOnly:true };
  }
  async choose(actor: OnboardingActor, input: unknown) {
    if (this.flowTable !== "hs_onboarding.flows") fail("USE_FAMILY_SETUP", 403);
    const data = hsChoosePath.parse(input);
    if (["staff","parent","league_admin"].includes(data.path)) this.fixture(actor);
    const youthInstalled = !!(await this.pool.query("SELECT to_regclass('hs_onboarding.youth_version') AS installed")).rows[0]?.installed;
    if (data.path === "league_admin" && !youthInstalled) fail("DEV_YOUTH_INSTALL_REQUIRED", 503);
    await this.tx(async tx => {
      await this.active(actor,tx);
      // Serialize enrollment and path selection, including when no flow exists.
      await tx.query("SELECT id FROM auth.users WHERE id=$1 FOR UPDATE", [actor.authId]);
      if (youthInstalled) {
        const expected = ["player", "organizer"].includes(data.path) ? "adult" : "high_school_youth";
        const context = (await tx.query("SELECT hockey_type FROM hs_onboarding.contexts WHERE auth_id=$1", [actor.authId])).rows[0];
        if (context && context.hockey_type !== expected) fail("HOCKEY_TYPE_ROLE_MISMATCH", 409);
        // Older DEV clients can resume without forging a mixed-role context.
        await tx.query(`INSERT INTO hs_onboarding.contexts(auth_id,hockey_type) VALUES($1,$2)
          ON CONFLICT(auth_id) DO NOTHING`, [actor.authId, expected]);
      }
      const current = (await tx.query("SELECT * FROM hs_onboarding.flows WHERE auth_id=$1", [actor.authId])).rows[0];
      if (current && current.path!==data.path) fail("PATH_ALREADY_SELECTED",409);
      if (current) return;
      const adult=await this.completedAdult(actor,tx);
      if (data.path==="parent" && adult) fail("PARENT_CONTEXT_FOUNDATION_PENDING",409);
      await tx.query("INSERT INTO hs_onboarding.flows(auth_id,path,block_legacy) VALUES($1,$2,$3)", [actor.authId,data.path,!adult]);
      if (data.path==="parent") {
        // Synthetic DEV enrollment only. Never a client-supplied destination.
        const user = (await tx.query("SELECT email,email_confirmed_at,raw_app_meta_data FROM auth.users WHERE id=$1", [actor.authId])).rows[0];
        if (!user?.email_confirmed_at || !user.raw_app_meta_data?.synthetic_high_school_onboarding_dev ||
            user.email!==actor.email || !user.email.endsWith("@example.com")) fail("DEV_FIXTURE_REQUIRED",403);
        await tx.query("INSERT INTO hs_parent_security.accounts(auth_id,parent_email) VALUES($1,$2) ON CONFLICT(auth_id) DO NOTHING", [actor.authId,user.email]);
      }
      await this.event(tx,actor,"onboarding_path_selected");
    });
  }
  private async flow(tx: ParentTransaction, actor: OnboardingActor, kind: string, revision: number, grant?: string) {
    await this.active(actor,tx); this.fixture(actor);
    // Serialize limits and claims across primary AND additive family journeys.
    await tx.query("SELECT id FROM auth.users WHERE id=$1 FOR UPDATE", [actor.authId]);
    const flow = (await tx.query(`SELECT * FROM ${this.flowTable} WHERE auth_id=$1 FOR UPDATE`, [actor.authId])).rows[0];
    if (!flow || flow.path!==kind) fail("WRONG_ONBOARDING_PATH",403);
    if (flow.revision!==revision) fail("DRAFT_CONFLICT",409);
    if (kind==="parent" && !await this.parent.authorized(actor,grant,tx)) throw new ParentSecurityError("PARENT_VERIFICATION_REQUIRED",403);
    return flow;
  }
  async catalog(actor: OnboardingActor, query: string) {
    await this.active(actor); this.fixture(actor);
    if (query.length>100) fail("INVALID_SEARCH");
    const school = await schoolProgramPresentation(this.pool);
    const programs = (await this.pool.query(`SELECT p.id,p.name,${school.name} AS "schoolName",${school.town} AS town,p.status,p.league_id,
      coalesce((SELECT json_agg(json_build_object('id',t.id,'name',t.name)) FROM hs_onboarding.teams t WHERE t.program_id=p.id AND ${school.teamActive}),'[]') AS teams
      FROM hs_onboarding.programs p ${school.join} WHERE ${school.active} AND (p.status='approved' OR p.requested_by=$1)
      AND position(lower($2) in lower(${school.name}||' '||p.name||' '||${school.town}))>0 ORDER BY p.name LIMIT 30`, [actor.authId,query])).rows;
    const leagues = (await this.pool.query("SELECT id,name FROM hs_onboarding.leagues ORDER BY name LIMIT 30")).rows;
    return {programs,leagues};
  }
  async save(actor: OnboardingActor, input: unknown, grant?: string) {
    const data=hsSaveDraft.parse(input);
    await this.tx(async tx => {
      const flow=await this.flow(tx,actor,data.kind,data.revision,grant);
      if (flow.status!=="draft") fail("REQUEST_ALREADY_SUBMITTED",409);
      if (data.kind==="parent") {
        if (data.players.some(p => p.birthYear === undefined)) fail("BIRTH_YEAR_REQUIRED");
        if (new Set(data.players.map(p=>p.id)).size!==data.players.length) fail("DUPLICATE_PLAYER");
        const names=data.players.map(p=>`${p.firstName.trim().toLowerCase()}|${p.lastName.trim().toLowerCase()}|${p.gradYear}`);
        if(new Set(names).size!==names.length) fail("DUPLICATE_PLAYER");
        const existing=(await tx.query("SELECT player_key,details FROM hs_onboarding.player_requests WHERE auth_id=$1",[actor.authId])).rows;
        if(new Set([...existing.map(p=>p.player_key),...data.players.map(p=>p.id)]).size>HS_MAX_FAMILY_PLAYERS) fail("HOUSEHOLD_LIMIT");
        if (data.players.some(p => existing.some(e => e.player_key !== p.id &&
          e.details?.firstName?.trim().toLowerCase() === p.firstName.trim().toLowerCase() &&
          e.details?.lastName?.trim().toLowerCase() === p.lastName.trim().toLowerCase() && e.details?.gradYear === p.gradYear))) fail("DUPLICATE_PLAYER",409);
        // Import data is server-owned; clients may consent but cannot rename an
        // imported child or swap its identity after looking up an invitation.
        const staged=flow.draft?.invitationDigest ? (await this.invite(tx,actor,flow.draft.invitationDigest,"parent")).players : [];
        if(staged.length && (data.players.length!==staged.length || data.players.some(p=>{
          const stagedId=flow.draft?.playerLinks?.find((link:any)=>link.playerId===p.id)?.stagedId??p.id;
          const s=staged.find((s:any)=>s.id===stagedId);
          return !s || p.firstName!==s.firstName || p.lastName!==s.lastName || p.gradYear!==s.gradYear || p.position!==s.position || p.jerseyNumber!==s.jerseyNumber;
        }))) fail("INVITATION_PLAYER_MISMATCH");
        await saveIndependentChildProfiles(tx, actor, data.players, this.liveFamily || !!actor.productionTest);
        await tx.query(`UPDATE ${this.flowTable} SET draft=$2,revision=revision+1,updated_at=now() WHERE auth_id=$1`,
          [actor.authId,{...flow.draft,players:data.players,guardianConfirmed:true,consentVersion:HS_CONSENT_VERSION,
            consentRecords:data.players.map(p=>({playerId:p.id,version:HS_CONSENT_VERSION,recordedAt:new Date().toISOString()}))}]);
        await this.event(tx,actor,"per_player_consent_draft_saved");
      } else {
        if(Boolean(data.newSchool)===Boolean(data.programId)) fail("CHOOSE_SCHOOL_OR_REQUEST");
        // Existing-team staff entry must use lookupInvitation, which validates
        // the recipient, expiry, inviter's current authority and invited role.
        if(!data.newSchool) throw new OnboardingError("INVITATION_REQUIRED",403);
        if(data.teamId) fail("NEW_SCHOOL_TEAM_NOT_ALLOWED");
        if(!["head_coach","athletic_director"].includes(data.role)) fail("SCHOOL_CREATION_ROLE_REQUIRED",403);
        if(!(await tx.query("SELECT 1 FROM hs_onboarding.leagues WHERE id=$1",[data.newSchool.leagueId])).rows.length) fail("UNKNOWN_LEAGUE");
        const programId=randomUUID();
        const separated = !!(await tx.query("SELECT to_regclass('hs_onboarding.schools') AS installed")).rows[0]?.installed;
        if (separated) {
          const schoolId = randomUUID();
          await tx.query("INSERT INTO hs_onboarding.schools(id,name,town,created_by) VALUES($1,$2,$3,$4)",
            [schoolId,data.newSchool.name,data.newSchool.town,actor.authId]);
          await tx.query(`INSERT INTO hs_onboarding.programs(id,league_id,school_id,name,town,status,requested_by)
            VALUES($1,$2,$3,$4,$5,'pending',$6)`,
          [programId,data.newSchool.leagueId,schoolId,data.newSchool.programName,data.newSchool.town,actor.authId]);
        } else {
          // Compatibility while the separately approved migration rolls out.
          await tx.query("INSERT INTO hs_onboarding.programs(id,league_id,name,town,status,requested_by) VALUES($1,$2,$3,$4,'pending',$5)",
            [programId,data.newSchool.leagueId,data.newSchool.name,data.newSchool.town,actor.authId]);
        }
        const id=randomUUID();
        await tx.query("INSERT INTO hs_onboarding.staff_requests(id,auth_id,program_id,team_id,role) VALUES($1,$2,$3,NULL,$4)",[id,actor.authId,programId,data.role]);
        await tx.query("UPDATE hs_onboarding.flows SET status='waiting_approval',draft=$2,revision=revision+1,updated_at=now() WHERE auth_id=$1",
          [actor.authId,{role:data.role,programId,teamId:data.teamId??null,requestId:id}]);
        await this.event(tx,actor,"staff_approval_requested",id);
      }
    });
  }
  private async invite(tx: Pick<ParentSql,"query">, actor: OnboardingActor, digest: string, kind?: string) {
    const row=(await tx.query(`SELECT i.*,t.program_id,p.status AS program_status FROM hs_onboarding.invitations i
      JOIN hs_onboarding.teams t ON t.id=i.team_id JOIN hs_onboarding.programs p ON p.id=t.program_id
      WHERE token_digest=$1 AND expires_at>now()`,[digest])).rows[0];
    if(!row || row.program_status!=="approved" || row.recipient_email.toLowerCase()!==actor.email.toLowerCase() || (kind && row.kind!==kind)) fail("INVALID_INVITATION",403);
    // Recheck creator authority at use time, so revocation invalidates links.
    const canonical = this.liveFamily || this.staffDecisions && await this.staffDecisions.installed();
    const creator= canonical ? await tx.query(`SELECT 1 FROM public.team_memberships m JOIN public.teams t ON t.id=m.team_id
      WHERE m.user_id=$1::text AND m.child_profile_id IS NULL AND m.status='approved' AND t.program_type='high_school'
      AND t.program_id=$2 AND(m.role='athletic_director' OR(m.role='head_coach' AND t.id=$3::text))
      UNION ALL SELECT 1 FROM public.leagues l JOIN hs_onboarding.programs p ON p.league_id::text=l.id
      WHERE l.commissioner_id=$1::text AND p.id=$2 AND l.league_type IN('high_school','youth')`,
    [row.created_by,row.program_id,row.team_id]) : await tx.query(`SELECT 1 FROM hs_onboarding.staff_requests WHERE auth_id=$1 AND program_id=$2 AND status='approved'
      AND (role='athletic_director' OR (role='head_coach' AND team_id=$3))`,[row.created_by,row.program_id,row.team_id]);
    if(!creator.rows.length) fail("INVALID_INVITATION",403);
    const players=(await tx.query(`SELECT id,first_name AS "firstName",last_name AS "lastName",grad_year AS "gradYear",position,jersey_number AS "jerseyNumber"
      FROM hs_onboarding.staged_players WHERE id=ANY($1::uuid[]) AND team_id=$2 AND expires_at>now() ORDER BY id`,[row.staged_ids,row.team_id])).rows;
    if(row.kind==="parent" && (!players.length || players.length!==row.staged_ids.length || players.length>HS_MAX_FAMILY_PLAYERS)) fail("INVALID_INVITATION",403);
    return {...row,players};
  }
  async lookup(actor: OnboardingActor, token: unknown, revision: number, grant?: string) {
    const text=z.string().regex(/^[A-Za-z0-9_-]{32,128}$/).parse(token);
    return this.tx(async tx=>{
      await this.active(actor,tx); this.fixture(actor);
      await tx.query("SELECT id FROM auth.users WHERE id=$1 FOR UPDATE", [actor.authId]);
      const flow=(await tx.query(`SELECT * FROM ${this.flowTable} WHERE auth_id=$1 FOR UPDATE`,[actor.authId])).rows[0];
      if(!flow || !["parent","staff"].includes(flow.path)) fail("WRONG_ONBOARDING_PATH",403);
      await this.flowForLookup(flow,actor,revision,grant,tx);
      const invite=await this.invite(tx,actor,parentDigest(text),flow.path);
      if(flow.path==="parent"){
        const owned=(await tx.query("SELECT auth_id FROM hs_onboarding.player_requests WHERE staged_id=ANY($1::uuid[])",[invite.staged_ids])).rows;
        if(owned.some(p=>p.auth_id!==actor.authId)) fail("PLAYER_ALREADY_CLAIMED",409);
        const existing=(await tx.query("SELECT player_key FROM hs_onboarding.player_requests WHERE auth_id=$1",[actor.authId])).rows;
        // Resolve only exact, unique household identities. The invitation stays
        // server-owned; no client-supplied child IDs or fuzzy name merges.
        const profiles=await independentChildSetupInstalled(tx)
          ? (await tx.query(`SELECT id,profile_details FROM hs_onboarding.children
            WHERE parent_auth_id=$1 AND revoked_at IS NULL AND profile_details IS NOT NULL`,[actor.authId])).rows : [];
        const playerLinks:Array<{stagedId:string;playerId:string}>=[];
        const invitedPlayers=invite.players.map((p:any)=>{
          const matches=profiles.filter(c=>{
            const saved=c.profile_details;
            return saved.firstName.trim().toLowerCase()===p.firstName.trim().toLowerCase()
              && saved.lastName.trim().toLowerCase()===p.lastName.trim().toLowerCase()
              && (saved.gradYear === undefined || saved.gradYear === p.gradYear);
          });
          if(matches.length>1)fail("CHILD_IDENTITY_MISMATCH",409);
          const saved=matches[0]?.profile_details;
          if(saved)playerLinks.push({stagedId:p.id,playerId:saved.id});
          return {...p,id:saved?.id??p.id,...(saved?.birthYear?{birthYear:saved.birthYear}:{})};
        });
        // An unspecified graduation year must not let two same-name roster
        // entries both claim the same household child.
        if (new Set(invitedPlayers.map((p:any)=>p.id)).size !== invitedPlayers.length) fail("CHILD_IDENTITY_MISMATCH",409);
        const householdKeys=profiles.map(c=>c.profile_details.id);
        if(new Set([...existing.map(p=>p.player_key),...householdKeys,...invitedPlayers.map((p:any)=>p.id)]).size>HS_MAX_FAMILY_PLAYERS) fail("HOUSEHOLD_LIMIT");
        await tx.query(`UPDATE ${this.flowTable} SET draft=$2,revision=revision+1 WHERE auth_id=$1`,
          [actor.authId,{invitationDigest:parentDigest(text),teamId:invite.team_id,playerLinks,players:invitedPlayers.map((p:any)=>({...p,consent:false,photoConsent:false,publicNameConsent:false,consentVersion:HS_CONSENT_VERSION}))}]);
      } else {
        if(!["assistant_coach","team_manager","head_coach","athletic_director"].includes(invite.staff_role)) fail("INVALID_INVITATION",403);
        const canonical = this.staffDecisions && await this.staffDecisions.installed();
        const creatorIsAd=(canonical ? await tx.query(`SELECT 1 FROM public.team_memberships m JOIN public.teams t ON t.id=m.team_id
          WHERE m.user_id=$1::text AND m.child_profile_id IS NULL AND m.role='athletic_director' AND m.status='approved'
          AND t.program_type='high_school' AND t.program_id=$2
          UNION ALL SELECT 1 FROM public.leagues l JOIN hs_onboarding.programs p ON p.league_id::text=l.id
          WHERE l.commissioner_id=$1::text AND p.id=$2 AND l.league_type IN('high_school','youth')`,[invite.created_by,invite.program_id])
          : await tx.query("SELECT 1 FROM hs_onboarding.staff_requests WHERE auth_id=$1 AND program_id=$2 AND role='athletic_director' AND status='approved'",[invite.created_by,invite.program_id])).rows.length;
        if(!creatorIsAd && !["assistant_coach","team_manager"].includes(invite.staff_role)) fail("INVALID_INVITATION",403);
        const id=randomUUID();
        await tx.query("INSERT INTO hs_onboarding.staff_requests(id,auth_id,program_id,team_id,role) VALUES($1,$2,$3,$4,$5)",[id,actor.authId,invite.program_id,invite.team_id,invite.staff_role]);
        await tx.query("UPDATE hs_onboarding.flows SET status='waiting_approval',draft=$2,revision=revision+1 WHERE auth_id=$1",
          [actor.authId,{role:invite.staff_role,programId:invite.program_id,teamId:invite.team_id,requestId:id}]);
      }
      await this.event(tx,actor,"invitation_matched_without_activation");
      return {matched:true};
    });
  }
  private async flowForLookup(flow:any,actor:OnboardingActor,revision:number,grant:string|undefined,tx:ParentTransaction){
    if(flow.revision!==revision) fail("DRAFT_CONFLICT",409);
    if(flow.status!=="draft") fail("REQUEST_ALREADY_SUBMITTED",409);
    if(flow.path==="parent" && !await this.parent.authorized(actor,grant,tx)) throw new ParentSecurityError("PARENT_VERIFICATION_REQUIRED",403);
  }
  async join(actor:OnboardingActor,input:unknown,grant?:string){
    const data=hsTeamEntry.parse(input);
    await this.tx(async tx=>{
      const flow=await this.flow(tx,actor,"parent",data.revision,grant);
      if(flow.status!=="draft") fail("REQUEST_ALREADY_SUBMITTED",409);
      const payload=hsSaveDraft.parse({kind:"parent",revision:data.revision,guardianConfirmed:flow.draft.guardianConfirmed,players:flow.draft.players});
      if(payload.kind!=="parent") throw new OnboardingError("INVALID_DRAFT");
      let teamId:string, stagedIds:string[]=[];
      if(data.invitation){
        const digest=parentDigest(data.invitation);
        if(flow.draft.invitationDigest!==digest) fail("LOOK_UP_INVITATION_FIRST");
        const invitation=await this.invite(tx,actor,digest,"parent");
        teamId=invitation.team_id;stagedIds=invitation.staged_ids;
        if(payload.players.length!==stagedIds.length || payload.players.some(p=>{
          const stagedId=flow.draft.playerLinks?.find((link:any)=>link.playerId===p.id)?.stagedId??p.id;
          return !stagedIds.includes(stagedId);
        })) fail("INVITATION_PLAYER_MISMATCH");
      } else {
        if(flow.draft.invitationDigest) fail("INVITATION_REQUIRED");
        const team=(await tx.query(`SELECT t.id FROM hs_onboarding.teams t JOIN hs_onboarding.programs p ON p.id=t.program_id
          WHERE t.code_digest=$1 AND p.status='approved'`,[parentDigest(data.teamCode!.toUpperCase())])).rows[0];
        if(!team) fail("INVALID_TEAM_CODE");
        teamId=team.id;
      }
      const existing=(await tx.query("SELECT player_key FROM hs_onboarding.player_requests WHERE auth_id=$1",[actor.authId])).rows;
      if(new Set([...existing.map(p=>p.player_key),...payload.players.map(p=>p.id)]).size>HS_MAX_FAMILY_PLAYERS) fail("HOUSEHOLD_LIMIT");
      for(const player of payload.players){
        const stagedId=flow.draft.playerLinks?.find((link:any)=>link.playerId===player.id)?.stagedId??player.id;
        const consent=flow.draft.consentRecords?.find((c:any)=>c.playerId===player.id&&c.version===HS_CONSENT_VERSION);
        if(!consent?.recordedAt)fail("PLAYER_CONSENT_REQUIRED",403);
        const owned=(await tx.query("SELECT auth_id FROM hs_onboarding.player_requests WHERE staged_id=$1",[stagedIds.includes(stagedId)?stagedId:null])).rows[0];
        if(owned && owned.auth_id!==actor.authId) fail("PLAYER_ALREADY_CLAIMED",409);
        if(existing.some(p=>p.player_key===player.id)) fail("PLAYER_ALREADY_SUBMITTED",409);
        await tx.query(`INSERT INTO hs_onboarding.player_requests(id,auth_id,team_id,staged_id,player_key,details,consent_version,consented_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(auth_id,player_key) DO NOTHING`,
        [randomUUID(),actor.authId,teamId,stagedIds.includes(stagedId)?stagedId:null,player.id,player,HS_CONSENT_VERSION,consent.recordedAt]);
      }
      await tx.query(`UPDATE ${this.flowTable} SET status=$2,draft=draft||$3::jsonb,revision=revision+1 WHERE auth_id=$1`,
        [actor.authId,stagedIds.length?"coverage_pending":"waiting_staff_review",JSON.stringify({teamId})]);
      await this.event(tx,actor,"consented_players_submitted_without_activation");
    });
  }
  async approvals(actor:OnboardingActor){
    await this.active(actor);this.fixture(actor);
    const school = await schoolProgramPresentation(this.pool);
    if (this.staffDecisions && await this.staffDecisions.installed()) {
      return (await this.pool.query(`SELECT r.id,r.role,r.status,${school.name} AS school,p.name AS "programName"
        FROM hs_onboarding.staff_requests r JOIN hs_onboarding.programs p ON p.id=r.program_id
        ${school.join}
        WHERE r.status='pending' AND r.auth_id<>$1 AND (
          EXISTS(SELECT 1 FROM hs_onboarding.league_approvers a WHERE a.auth_id=$1 AND a.league_id=p.league_id)
          OR EXISTS(SELECT 1 FROM public.team_memberships m JOIN public.teams t ON t.id=m.team_id
            WHERE m.user_id=$1::text AND m.status='approved' AND m.child_profile_id IS NULL
            AND t.program_type='high_school' AND t.program_id=r.program_id
            AND(m.role='athletic_director' OR(m.role='head_coach' AND t.id=r.team_id::text
              AND r.role IN('assistant_coach','team_manager')))))
        ORDER BY r.created_at LIMIT 50`,[actor.authId])).rows;
    }
    return (await this.pool.query(`SELECT r.id,r.role,r.status,${school.name} AS school,p.name AS "programName"
      FROM hs_onboarding.staff_requests r JOIN hs_onboarding.programs p ON p.id=r.program_id
      ${school.join}
      WHERE r.status='pending' AND r.auth_id<>$1 AND (
        EXISTS(SELECT 1 FROM hs_onboarding.league_approvers a WHERE a.auth_id=$1 AND a.league_id=p.league_id)
        OR EXISTS(SELECT 1 FROM hs_onboarding.staff_requests a WHERE a.auth_id=$1 AND a.program_id=r.program_id AND a.status='approved'
          AND(a.role='athletic_director' OR(a.role='head_coach' AND a.team_id=r.team_id AND r.role IN('assistant_coach','team_manager')))))
      ORDER BY r.created_at LIMIT 50`,[actor.authId])).rows;
  }
  async decide(actor:OnboardingActor,id:unknown,approve:unknown){
    uuid.parse(id);z.boolean().parse(approve);
    // Once Phase 2 is installed, ALL approval entry points use the atomic
    // canonical writer, including the existing league bootstrap UI.
    if (this.staffDecisions && await this.staffDecisions.installed()) {
      await this.staffDecisions.decide(actor,id as string,approve as boolean); return;
    }
    await this.tx(async tx=>{
      await this.active(actor,tx);this.fixture(actor);
      const row=(await tx.query(`SELECT r.*,p.league_id FROM hs_onboarding.staff_requests r
        JOIN hs_onboarding.programs p ON p.id=r.program_id WHERE r.id=$1 FOR UPDATE OF r`,[id])).rows[0];
      if(!row || row.auth_id===actor.authId) fail("APPROVAL_FORBIDDEN",403);
      const league=(await tx.query("SELECT 1 FROM hs_onboarding.league_approvers WHERE league_id=$1 AND auth_id=$2",[row.league_id,actor.authId])).rows.length;
      const authorities=(await tx.query("SELECT role,team_id FROM hs_onboarding.staff_requests WHERE auth_id=$1 AND program_id=$2 AND status='approved'",[actor.authId,row.program_id])).rows;
      const trusted=league || authorities.some(a=>a.role==="athletic_director"||(a.role==="head_coach"&&a.team_id===row.team_id&&["assistant_coach","team_manager"].includes(row.role)));
      if(!trusted) fail("APPROVAL_FORBIDDEN",403);
      if(row.status!=="pending") fail("DECISION_ALREADY_RECORDED",409);
      // A new program's initial authority must always come from its league.
      const program=(await tx.query("SELECT status FROM hs_onboarding.programs WHERE id=$1 FOR UPDATE",[row.program_id])).rows[0];
      if(program.status==="pending"&&!league) fail("LEAGUE_APPROVAL_REQUIRED",403);
      await tx.query("UPDATE hs_onboarding.staff_requests SET status=$2,decided_by=$3 WHERE id=$1",[id,approve?"approved":"denied",actor.authId]);
      if(approve&&league)await tx.query("UPDATE hs_onboarding.programs SET status='approved',approved_by=$2 WHERE id=$1",[row.program_id,actor.authId]);
      await tx.query("UPDATE hs_onboarding.flows SET status=$2,revision=revision+1 WHERE auth_id=$1",[row.auth_id,approve?(row.team_id?"coverage_pending":"team_setup_pending"):"denied"]);
      await this.event(tx,actor,approve?"staff_approved_without_team_access":"staff_denied",id as string);
    });
  }
}

import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { OnboardingActor } from "./highSchoolOnboarding";
import type { ParentTransaction } from "./highSchoolParentSecurity";
import { StaffBase, staffFail, staffName, uuid, type StaffScope } from "./highSchoolStaffBase";
import { rosterImportRow } from "./highSchoolStaffImports";
import { staffRoles } from "../shared/highSchoolStaff";
import { SchoolPlayerEligibilityService } from "./schoolPlayerEligibility";

export class HighSchoolStaffOperations extends StaffBase {
  async eligibility(actor: OnboardingActor, teamId: string) {
    return new SchoolPlayerEligibilityService(this.pool, undefined, undefined, this.live).teamWorkspace(actor, teamId);
  }
  async setEligibility(actor: OnboardingActor, teamId: string, playerId: string, input: unknown) {
    return new SchoolPlayerEligibilityService(this.pool, undefined, undefined, this.live, this.leagueAdministration)
      .setTeam(actor, teamId, playerId, input);
  }
  async authorize(actor: OnboardingActor, teamId: string) {
    return this.withScope(actor, teamId, async () => ({ authorized: true }));
  }
  async workspace(actor: OnboardingActor, teamId: string) {
    return this.withScope(actor, teamId, async (db, scope) => {
      const team = (await db.query(`SELECT t.id,t.name,t.program_id AS "programId",p.name AS "programName",
        coalesce(s.rink,'') AS rink,coalesce(s.address,'') AS address FROM public.teams t
        JOIN hs_onboarding.programs p ON p.id=t.program_id LEFT JOIN hs_onboarding.team_settings s ON s.team_id::text=t.id
        WHERE t.id=$1`, [teamId])).rows[0];
      const allPlayers = await this.players(db, scope, true);
      const own = allPlayers.filter(p => p.teamId === teamId);
      const cleanPlayer = ({ parentId: _parent, teamId: _team, ...player }: typeof allPlayers[number]) => player;
      const staged = (await db.query(`SELECT s.id,'staged' AS type,s.first_name AS "firstName",s.last_name AS "lastName",
        s.jersey_number AS number,s.position,s.grad_year AS "gradYear",s.grad_year::text AS "className",
        false AS "guardianLinked",false AS consented FROM hs_onboarding.staged_players s WHERE s.team_id=$1
        AND s.expires_at>now() AND NOT EXISTS(SELECT 1 FROM hs_onboarding.player_requests r WHERE r.staged_id=s.id) ORDER BY s.last_name`, [teamId])).rows;
      const events = (await db.query(`SELECT id,title,opponent,starts_at AS "startsAt",rink,address,version,status,
        home_score AS "homeScore",away_score AS "awayScore",
        (status='scheduled' AND starts_at<=now()-interval '2 hours') AS "reportAvailable"
        FROM hs_onboarding.staff_events WHERE team_id=$1 AND deleted_at IS NULL ORDER BY starts_at LIMIT 500`, [teamId])).rows;
      for (const [kind, name] of [["team", "Team"], ["parents", "Parents"], ["coaches", "Coaches Only"]]) {
        await db.query(`INSERT INTO hs_onboarding.child_chats(id,kind,name,team_id) VALUES($1,$2,$3,$4)
          ON CONFLICT(team_id,kind) WHERE team_id IS NOT NULL DO NOTHING`, [randomUUID(), kind, name, teamId]);
      }
      const rooms = (await db.query(`SELECT id,kind,name FROM hs_onboarding.child_chats
        WHERE team_id=$1 AND parent_auth_id IS NULL AND kind IN('team','parents','coaches') ORDER BY name`, [teamId])).rows;
      const staff = (await db.query(`SELECT m.id,m.user_id AS "userId",m.role,
        coalesce(nullif(trim(concat(u.first_name,' ',u.last_name)),''),'Staff member') AS name
        FROM public.team_memberships m JOIN public.users u ON u.id=m.user_id
        WHERE m.team_id=$1 AND m.status='approved' AND m.role=ANY($2::text[]) ORDER BY m.role,u.first_name`,
      [teamId, [...staffRoles]])).rows;
      const manageStaff = ["head_coach", "athletic_director"].includes(scope.role);
      const approvals = manageStaff ? await this.pending(db, actor, scope) : [];
      const programTeams = (await db.query(`SELECT id,name FROM public.teams WHERE program_id=$1 AND program_type='high_school'
        AND($2::boolean OR id=$3) ORDER BY name`, [scope.programId, scope.role === "athletic_director", teamId])).rows;
      const gaps = programTeams.map(t => {
        const players = allPlayers.filter(p => p.teamId === t.id);
        return { teamId: t.id, name: t.name, missingGuardian: players.filter(p => !p.guardianLinked).length,
          missingConsent: players.filter(p => !p.consented).length };
      });
      // AD reporting is deliberately restricted to Team, never Family or staff-only rooms.
      const reports = scope.role === "athletic_director" ? (await db.query(`SELECT r.id,m.body,r.reason,r.status,
        t.name AS "teamName",coalesce(nullif(trim(concat(u.first_name,' ',u.last_name)),''),c.first_name,'Member') AS sender
        FROM hs_onboarding.message_reports r JOIN hs_onboarding.child_messages m ON m.id=r.message_id
        JOIN hs_onboarding.child_chats room ON room.id=m.chat_id AND room.kind='team' AND room.parent_auth_id IS NULL
        JOIN public.teams t ON t.id=room.team_id::text AND t.program_id=$1 AND t.program_type='high_school'
        LEFT JOIN public.users u ON u.id=m.author_auth_id::text LEFT JOIN hs_onboarding.children c ON c.id=m.child_id
        ORDER BY r.created_at DESC LIMIT 100`, [scope.programId])).rows : [];
      const audit = scope.role === "athletic_director" ? (await db.query(`SELECT id::text,event,created_at AS "createdAt"
        FROM hs_onboarding.staff_audit WHERE program_id=$1 ORDER BY id DESC LIMIT 100`, [scope.programId])).rows : [];
      const payments = (await db.query(`SELECT p.id,p.creator_id AS "creatorId",p.title,p.amount_per_person AS amount FROM public.payment_requests p
        JOIN hs_onboarding.staff_payment_links l ON l.request_id=p.id WHERE l.team_id=$1 ORDER BY p.created_at DESC LIMIT 100`, [teamId])).rows;
      for (const payment of payments) payment.recipients = (await db.query(`SELECT r.id,
        coalesce(nullif(trim(concat(u.first_name,' ',u.last_name)),''),'Parent') AS name,r.is_paid AS paid,r.is_confirmed AS confirmed
        FROM public.payment_request_recipients r LEFT JOIN public.users u ON u.id=r.user_id WHERE r.payment_request_id=$1`, [payment.id])).rows;
      const eligible = await this.paymentEligibility(actor.authId, scope.leagueId);
      // Use the SAME invoiceable league set as ordinary creation, intersected
      // with approved parents on this team. Staff status grants no payer access.
      const paymentRecipients = await this.invoiceableParents(db, scope);
      return { team, role: scope.role, capabilities: { manageStaff, manageProgram: scope.role === "athletic_director",
        createPayments: eligible, paymentReason: eligible ? "" : "Requires approved league membership and existing Player Pro or league commissioner entitlement." },
        roster: [...own.map(cleanPlayer), ...staged], callupCandidates: [],
        events, rooms, staff, approvals, gaps, reports, audit, payments, paymentRecipients };
    });
  }
  protected async invoiceableParents(db: ParentTransaction, scope: StaffScope) {
    // Current invoice creation only accepts approved league players; do not
    // silently broaden that policy to every parent or create billing grants.
    return (await db.query(`SELECT DISTINCT u.id,
      coalesce(nullif(trim(concat(u.first_name,' ',u.last_name)),''),'Parent') AS name
      FROM public.team_memberships tm JOIN public.users u ON u.id=tm.user_id
      JOIN public.league_memberships lm ON lm.user_id=u.id AND lm.league_id=$2 AND lm.status='approved'
      WHERE tm.team_id=$1 AND tm.status='approved' AND tm.role='parent'`, [scope.teamId, scope.leagueId])).rows;
  }
  async settings(actor: OnboardingActor, teamId: string, input: unknown) {
    const data = z.object({ name: staffName, rink: z.string().trim().max(160), address: z.string().trim().max(240) }).strict().parse(input);
    return this.withScope(actor, teamId, async (db, scope) => {
      this.manager(scope);
      await db.query("UPDATE public.teams SET name=$2 WHERE id=$1", [teamId, data.name]);
      await db.query("UPDATE hs_onboarding.teams SET name=$2 WHERE id=$1", [teamId, data.name]);
      await db.query(`INSERT INTO hs_onboarding.team_settings(team_id,rink,address) VALUES($1,$2,$3)
        ON CONFLICT(team_id) DO UPDATE SET rink=excluded.rink,address=excluded.address`, [teamId, data.rink, data.address]);
      await this.audit(db, actor, scope, "team_settings_saved", teamId); return { saved: true };
    });
  }
  async importRoster(actor: OnboardingActor, teamId: string, input: unknown) {
    const { rows } = z.object({ rows: z.array(rosterImportRow).min(1).max(200) }).strict().parse(input);
    return this.withScope(actor, teamId, async (db, scope) => {
      for (const row of rows) {
        const source = createHash("sha256").update(JSON.stringify([row.firstName.toLowerCase(), row.lastName.toLowerCase(), row.gradYear])).digest("hex");
        await db.query(`INSERT INTO hs_onboarding.staged_players(id,team_id,source_key,first_name,last_name,grad_year,position,jersey_number)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(team_id,source_key) DO UPDATE
          SET position=excluded.position,jersey_number=excluded.jersey_number,expires_at=now()+interval '7 days'`,
        [randomUUID(), teamId, source, row.firstName, row.lastName, row.gradYear, row.position, row.jerseyNumber]);
      }
      await this.audit(db, actor, scope, "roster_staged_not_activated"); return { saved: true, count: rows.length };
    });
  }
  async invitation(actor: OnboardingActor, teamId: string, input: unknown) {
    const data = z.object({ email: z.string().email().transform(s => s.toLowerCase()).refine(s => s.endsWith("@example.com")),
      role: z.enum(["assistant_coach", "team_manager"]) }).strict().parse(input);
    return this.withScope(actor, teamId, async (db, scope) => {
      this.manager(scope);
      await db.query(`INSERT INTO hs_onboarding.staff_invitations(id,team_id,recipient_email,role,created_by)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT(team_id,recipient_email,role) DO NOTHING`, [randomUUID(), teamId, data.email, data.role, actor.authId]);
      await db.query(`INSERT INTO hs_onboarding.invitations(token_digest,team_id,kind,recipient_email,staff_role,created_by)
        VALUES($1,$2,'staff',$3,$4,$5)`, [createHash("sha256").update(randomUUID()).digest("hex"), teamId, data.email, data.role, actor.authId]);
      await this.audit(db, actor, scope, "staff_invitation_saved_delivery_disabled");
      return { saved: true, delivery: "disabled" };
    });
  }
  private async pending(db: ParentTransaction, actor: OnboardingActor, scope: StaffScope) {
    return (await db.query(`SELECT r.id,r.role,p.name AS school,
      coalesce(nullif(trim(concat(u.raw_user_meta_data->>'first_name',' ',u.raw_user_meta_data->>'last_name')),''),'Staff applicant') AS name,
      coalesce(t.name,'Program-wide') AS "teamName" FROM hs_onboarding.staff_requests r
      JOIN hs_onboarding.programs p ON p.id=r.program_id LEFT JOIN hs_onboarding.teams t ON t.id=r.team_id
      JOIN auth.users u ON u.id=r.auth_id
      WHERE r.program_id=$1 AND r.status='pending' AND r.auth_id<>$2
      AND($3='athletic_director' OR(r.team_id=$4 AND r.role IN('assistant_coach','team_manager')))
      ORDER BY r.created_at LIMIT 100`, [scope.programId, actor.authId, scope.role, scope.teamId])).rows;
  }
  async approve(actor: OnboardingActor, teamId: string, id: string, input: unknown) {
    uuid.parse(id); const { approve } = z.object({ approve: z.boolean() }).strict().parse(input);
    return this.withScope(actor, teamId, async (db, scope) => {
      this.manager(scope); await this.decideLocked(db, actor, id, approve, scope); return { saved: true };
    });
  }
  /** Used by the pre-existing league/bootstrap onboarding decision route too. */
  async decide(actor: OnboardingActor, id: string, approve: boolean) {
    uuid.parse(id); z.boolean().parse(approve);
    return this.transaction(async db => {
      await this.active(db, actor);
      const request = (await db.query("SELECT program_id FROM hs_onboarding.staff_requests WHERE id=$1", [id])).rows[0];
      if (!request) staffFail("APPROVAL_FORBIDDEN", 403);
      // Same lock order as every operational route.
      await db.query("SELECT id FROM hs_onboarding.programs WHERE id=$1 FOR UPDATE", [request.program_id]);
      await this.decideLocked(db, actor, id, approve);
      return { saved: true };
    });
  }
  private async decideLocked(db: ParentTransaction, actor: OnboardingActor, id: string, approve: boolean, scope?: StaffScope) {
    const row = (await db.query(`SELECT r.*,p.league_id,p.status AS program_status FROM hs_onboarding.staff_requests r
      JOIN hs_onboarding.programs p ON p.id=r.program_id WHERE r.id=$1 FOR UPDATE OF r`, [id])).rows[0];
    if (!row || row.auth_id === actor.authId || (scope && row.program_id !== scope.programId)) staffFail("APPROVAL_FORBIDDEN", 403);
    const league = !!(await db.query(actor.productionTest || this.leagueAdministration
      ?"SELECT 1 FROM public.leagues WHERE commissioner_id=$1::text AND id=$2::text"
      :"SELECT 1 FROM hs_onboarding.league_approvers WHERE auth_id=$1 AND league_id=$2", [actor.authId, row.league_id])).rows.length;
    const authorities = (await db.query(`SELECT m.role,m.team_id FROM public.team_memberships m JOIN public.teams t ON t.id=m.team_id
      WHERE m.user_id=$1 AND m.status='approved' AND m.child_profile_id IS NULL
      AND t.program_type='high_school' AND t.program_id=$2`, [actor.authId, row.program_id])).rows;
    if (!league && !authorities.some(a => a.role === "athletic_director" ||
      (a.role === "head_coach" && a.team_id === row.team_id && ["assistant_coach", "team_manager"].includes(row.role)))) staffFail("APPROVAL_FORBIDDEN", 403);
    if (row.program_status !== "approved" && !league) staffFail("LEAGUE_APPROVAL_REQUIRED", 403);
    if (row.status !== "pending") staffFail("DECISION_ALREADY_RECORDED", 409);
    if (!staffRoles.includes(row.role)) staffFail("INVALID_STAFF_ROLE");
    if (approve && !(await db.query(`SELECT 1 FROM auth.users a WHERE a.id=$1 AND a.email_confirmed_at IS NOT NULL
      AND ((lower(a.email) LIKE '%@example.com' AND a.raw_app_meta_data->>'synthetic_high_school_onboarding_dev'='true')
        OR ($2::boolean AND EXISTS(SELECT 1 FROM public.users u WHERE u.id=a.id::text AND u.deleted_at IS NULL
          AND u.display_id=ANY($3::text[]))))`, [row.auth_id, !!actor.productionTest,
        ["U00001", "U00002", "U00250"]])).rows.length) staffFail("STAFF_RECIPIENT_NOT_ELIGIBLE", 403);
    await db.query("UPDATE hs_onboarding.staff_requests SET status=$2,decided_by=$3 WHERE id=$1", [id, approve ? "approved" : "denied", actor.authId]);
    if (approve) {
      if (league) await db.query("UPDATE hs_onboarding.programs SET status='approved',approved_by=$2 WHERE id=$1", [row.program_id, actor.authId]);
      await db.query(`INSERT INTO public.users(id,email,first_name,last_name)
        SELECT id::text,email,raw_user_meta_data->>'first_name',raw_user_meta_data->>'last_name' FROM auth.users WHERE id=$1
        ON CONFLICT(id) DO NOTHING`, [row.auth_id]);
      // A league-approved initial head coach/AD may have no team yet. Create
      // the first canonical team in the same approval transaction, rather
      // than trapping them behind an empty-team onboarding shell.
      if (!row.team_id && !(await db.query("SELECT 1 FROM hs_onboarding.teams WHERE program_id=$1", [row.program_id])).rows.length) {
        if (!league) staffFail("LEAGUE_APPROVAL_REQUIRED", 403);
        const initialId = randomUUID();
        const programName = (await db.query("SELECT name FROM hs_onboarding.programs WHERE id=$1", [row.program_id])).rows[0].name;
        await db.query("INSERT INTO hs_onboarding.teams(id,program_id,name,code_digest) VALUES($1,$2,$3,$4)",
          [initialId, row.program_id, `${programName} Varsity`, createHash("sha256").update(randomUUID()).digest("hex")]);
        if (row.role !== "athletic_director") {
          row.team_id = initialId;
          await db.query("UPDATE hs_onboarding.staff_requests SET team_id=$2 WHERE id=$1", [id, initialId]);
        }
      }
      const teams = (await db.query(`SELECT id,name,program_id FROM hs_onboarding.teams WHERE program_id=$1
        AND($2='athletic_director' OR id=$3)`, [row.program_id, row.role, row.team_id])).rows;
      if (!teams.length) staffFail("STAFF_TEAM_ASSIGNMENT_REQUIRED", 409);
      for (const team of teams) {
        await this.canonicalTeam(db, team);
        await this.canonicalStaff(db, row.auth_id, team.id, row.role);
      }
    }
    await db.query("UPDATE hs_onboarding.flows SET status=$2,revision=revision+1 WHERE auth_id=$1",
      [row.auth_id, approve ? (row.team_id ? "coverage_pending" : "team_setup_pending") : "denied"]);
    await this.audit(db, actor, { teamId: row.team_id, programId: row.program_id } as StaffScope,
      approve ? "staff_approved" : "staff_denied", id);
  }
  private async canonicalTeam(db: ParentTransaction, team: { id: string; name: string; program_id: string }) {
    const old = (await db.query("SELECT program_type,program_id FROM public.teams WHERE id=$1", [team.id])).rows[0];
    if (old && (old.program_type !== "high_school" || old.program_id !== team.program_id)) staffFail("TEAM_IDENTITY_CONFLICT", 409);
    await db.query(`INSERT INTO public.teams(id,name,program_type,program_id) VALUES($1,$2,'high_school',$3)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name`, [team.id, team.name, team.program_id]);
  }
  private async canonicalStaff(db: ParentTransaction, authId: string, teamId: string, role: string) {
    const existing = (await db.query(`SELECT id,role,status FROM public.team_memberships
      WHERE user_id=$1 AND team_id=$2 FOR UPDATE`, [authId, teamId])).rows[0];
    if (existing) {
      if (existing.role === "player" || existing.role === "parent") staffFail("STAFF_MEMBERSHIP_CONFLICT", 409);
      const rank = (r: string) => ["athletic_director", "head_coach", "assistant_coach", "team_manager"].indexOf(r);
      const next = existing.status === "approved" && rank(existing.role) < rank(role) ? existing.role : role;
      await db.query("UPDATE public.team_memberships SET role=$2,status='approved',is_captain=false WHERE id=$1", [existing.id, next]);
    } else await db.query(`INSERT INTO public.team_memberships(id,user_id,team_id,role,status,is_captain)
      VALUES($1,$2,$3,$4,'approved',false)`, [randomUUID(), authId, teamId, role]);
  }
  async newTeam(actor: OnboardingActor, teamId: string, input: unknown) {
    const { name } = z.object({ name: staffName }).strict().parse(input);
    return this.withScope(actor, teamId, async (db, scope) => {
      this.ad(scope); const id = randomUUID();
      // New teams inherit the already-canonical ADs, not requested/draft roles.
      const ads = (await db.query(`SELECT DISTINCT m.user_id FROM public.team_memberships m JOIN public.teams t ON t.id=m.team_id
        WHERE t.program_id=$1 AND t.program_type='high_school' AND m.role='athletic_director' AND m.status='approved'`, [scope.programId])).rows;
      await db.query("INSERT INTO hs_onboarding.teams(id,program_id,name,code_digest) VALUES($1,$2,$3,$4)",
        [id, scope.programId, name, createHash("sha256").update(randomUUID()).digest("hex")]);
      await this.canonicalTeam(db, { id, name, program_id: scope.programId });
      for (const ad of ads) await this.canonicalStaff(db, ad.user_id, id, "athletic_director");
      await this.audit(db, actor, scope, "program_team_created", id);
      return { saved: true, id };
    });
  }
  async revoke(actor: OnboardingActor, teamId: string, id: string) {
    uuid.parse(id);
    return this.withScope(actor, teamId, async (db, scope) => {
      this.manager(scope);
      const target = (await db.query(`SELECT m.*,t.program_id FROM public.team_memberships m
        JOIN public.teams t ON t.id=m.team_id WHERE m.id=$1 FOR UPDATE OF m`, [id])).rows[0];
      if (!target || target.status !== "approved" || target.program_id !== scope.programId || target.user_id === actor.authId ||
          !staffRoles.includes(target.role) || (scope.role !== "athletic_director" &&
          (target.team_id !== teamId || !["assistant_coach", "team_manager"].includes(target.role)))) staffFail("REVOCATION_FORBIDDEN", 403);
      const programWide = target.role === "athletic_director";
      await db.query(`UPDATE public.team_memberships m SET status='pending' FROM public.teams t
        WHERE t.id=m.team_id AND t.program_id=$1 AND m.user_id=$2 AND m.role=$3 AND($4::boolean OR m.id=$5)`,
      [scope.programId, target.user_id, target.role, programWide, id]);
      // Preserve the source's established status vocabulary (pending/approved/denied).
      await db.query(`UPDATE hs_onboarding.staff_requests SET status='denied',decided_by=$1
        WHERE auth_id=$2 AND program_id=$3 AND role=$4 AND($5::boolean OR team_id::text=$6)`,
      [actor.authId, target.user_id, scope.programId, target.role, programWide, target.team_id]);
      await this.audit(db, actor, scope, "staff_revoked", id); return { saved: true };
    });
  }
  async createPayment(actor: OnboardingActor, teamId: string, input: unknown) {
    const data = z.object({ title: staffName, amount: z.string().regex(/^\d{1,5}\.\d{2}$/).refine(v => Number(v) > 0),
      recipientIds: z.array(uuid).min(1).max(100) }).strict().parse(input);
    return this.withScope(actor, teamId, async (db, scope) => {
      if (!await this.paymentEligibility(actor.authId, scope.leagueId)) staffFail("EXISTING_PAYMENT_ENTITLEMENT_REQUIRED", 403);
      const allowed = new Set((await this.invoiceableParents(db, scope)).map(p => p.id));
      if (data.recipientIds.some(id => !allowed.has(id))) staffFail("PAYMENT_RECIPIENT_FORBIDDEN", 403);
      const id = randomUUID();
      // Persist ordinary payment requests and recipients atomically with their
      // team link. No charges, card readiness, messages or push/email side effects.
      await db.query(`INSERT INTO public.payment_requests(id,creator_id,title,amount_per_person)
        VALUES($1,$2,$3,$4)`, [id, actor.authId, data.title, data.amount]);
      for (const recipient of Array.from(new Set(data.recipientIds))) await db.query(`INSERT INTO public.payment_request_recipients
        (id,payment_request_id,user_id,is_paid,is_confirmed) VALUES($1,$2,$3,false,false)`, [randomUUID(), id, recipient]);
      await db.query("INSERT INTO hs_onboarding.staff_payment_links(request_id,team_id) VALUES($1,$2)", [id, teamId]);
      await this.audit(db, actor, scope, "payment_request_created_delivery_disabled", id);
      return { saved: true, id, delivery: "disabled" };
    });
  }
  async confirmPayment(actor: OnboardingActor, teamId: string, requestId: string, recipientId: string, input: unknown) {
    uuid.parse(requestId); uuid.parse(recipientId);
    const { confirmed } = z.object({ confirmed: z.boolean() }).strict().parse(input);
    return this.withScope(actor, teamId, async (db, scope) => {
      // As in the ordinary flow: creation needs premium; confirming one's
      // existing requests does not. A staff role alone never grants ownership.
      const result = await db.query(`UPDATE public.payment_request_recipients r SET is_confirmed=$4,
        confirmed_at=CASE WHEN $4 THEN now() ELSE NULL END,updated_at=now()
        FROM public.payment_requests p JOIN hs_onboarding.staff_payment_links l ON l.request_id=p.id
        WHERE r.id=$1 AND r.payment_request_id=p.id AND p.id=$2 AND p.creator_id=$3 AND l.team_id=$5
        AND(r.is_paid=true OR $4=false) RETURNING r.id`, [recipientId, requestId, actor.authId, confirmed, teamId]);
      if (!result.rows.length) staffFail("PAYMENT_CONFIRMATION_REQUIRES_CREATOR_AND_RECORDED_PAYMENT", 403);
      await this.audit(db, actor, scope, "payment_confirmation_updated", requestId);
      return { saved: true };
    });
  }
}

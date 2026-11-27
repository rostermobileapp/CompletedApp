import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import express from "express";
import { WebSocket, WebSocketServer } from "ws";
import { createServer } from "node:http";
import { createStaffFixture } from "./helpers/highSchoolStaffFixture";
import { HighSchoolFamilySetup, HighSchoolFamilyReview } from "../highSchoolFamilySetup";
import { HighSchoolParentSecurity, parentDigest } from "../highSchoolParentSecurity";
import { HighSchoolOnboarding } from "../highSchoolOnboarding";
import { registerHighSchoolFamilyRoutes } from "../highSchoolFamilyHttp";
import { TeamSkinService } from "../teamSkinService";
import { HS_CONSENT_VERSION } from "../../shared/highSchoolOnboarding";
import { guardVerifiedAdultSocket } from "../verifiedAdultSocket";

const player = (firstName = "Casey") => ({ id: randomUUID(), firstName, lastName: "Synthetic", birthYear: 2012, gradYear: 2028,
  position: "D", jerseyNumber: "8", consent: true, consentVersion: HS_CONSENT_VERSION, photoConsent: false, publicNameConsent: false });
const reject = (fn: () => Promise<unknown>, code: string) => assert.rejects(fn, (e: any) => e.code === code);

test("existing adult family setup uses real isolated SQL, consent and canonical staff review", async t => {
  const f = await createStaffFixture();
  const { pool, actors: a, ids } = f;
  const captured: { code: string }[] = [];
  const parent = new HighSchoolParentSecurity(pool, async mail => { captured.push(mail); });
  let personal = false;
  const family = new HighSchoolFamilySetup(pool, parent, async (_id, league) => personal ? "personal" : league === ids.league ? "league" : "uncovered");
  family.intake.staffDecisions = f.staff;
  const review = new HighSchoolFamilyReview(pool);
  const adult = a.applicant;
  let grant = "", first = player(), second = player("Jamie");
  try {
    await pool.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false, ADD COLUMN IF NOT EXISTS date_of_birth varchar;
      CREATE TABLE hs_parent_security.grants(token_digest text PRIMARY KEY,auth_id uuid,session_id uuid,purpose text,expires_at timestamptz,consumed boolean DEFAULT false);
      CREATE TABLE hs_parent_security.audit(auth_id uuid,session_id uuid,event text,created_at timestamptz DEFAULT now());
      CREATE TABLE hs_parent_security.challenges(id uuid PRIMARY KEY,auth_id uuid,session_id uuid,purpose text,code_digest text,expires_at timestamptz,
        attempts int DEFAULT 0,delivered boolean DEFAULT false,consumed boolean DEFAULT false,created_at timestamptz DEFAULT now());
      CREATE TABLE hs_parent_security.version(version int);`);
    const db = await pool.connect();
    try {
      await db.query("SELECT set_config('roster.hs_family_dev','family-setup',false)");
      await db.query(await readFile("scripts/dev-only/high-school-family-setup.sql", "utf8"));
      await db.query(await readFile("scripts/dev-only/high-school-family-setup.sql", "utf8"));
    } finally { db.release(); }
    await pool.query("UPDATE public.users SET onboarding_completed=true,date_of_birth='1990-01-01' WHERE id=$1", [adult.authId]);
    // The shared staff fixture now supplies adult DOBs. This negative case
    // deliberately exercises missing DOB, independently of fixture defaults.
    await pool.query("UPDATE public.users SET date_of_birth=NULL WHERE id=$1",[a.head.authId]);
    await pool.query("UPDATE hs_onboarding.flows SET path='player',block_legacy=false,draft=$2 WHERE auth_id=$1", [adult.authId, { untouchedAdult: true }]);
    await pool.query("INSERT INTO hs_onboarding.contexts(auth_id,hockey_type,journey) VALUES($1,'adult',$2)", [adult.authId, { original: "player profile" }]);
    const adultTeam = randomUUID();
    await pool.query("INSERT INTO public.teams(id,name) VALUES($1,'Adult playing team')", [adultTeam]);
    await pool.query("INSERT INTO public.team_memberships(user_id,team_id,role,status) VALUES($1,$2,'player','approved')", [adult.authId, adultTeam]);
    const originalFlow = (await pool.query("SELECT * FROM hs_onboarding.flows WHERE auth_id=$1", [adult.authId])).rows[0];
    const originalUser = (await pool.query("SELECT * FROM public.users WHERE id=$1", [adult.authId])).rows[0];
    await pool.query("UPDATE hs_onboarding.teams SET code_digest=$2 WHERE id=$1", [ids.varsity, parentDigest("NORTH123")]);

    await t.test("additive enrollment is idempotent and changes no adult or staff account data", async () => {
      assert.equal((await family.state(adult)).started, false);
      await reject(() => family.begin(a.head), "FAMILY_DOB_REQUIRED");
      await family.begin(adult); await family.begin(adult);
      assert.deepEqual((await pool.query("SELECT * FROM hs_onboarding.flows WHERE auth_id=$1", [adult.authId])).rows[0], originalFlow);
      assert.deepEqual((await pool.query("SELECT * FROM public.users WHERE id=$1", [adult.authId])).rows[0], originalUser);
      assert.equal((await pool.query("SELECT hockey_type FROM hs_onboarding.contexts WHERE auth_id=$1", [adult.authId])).rows[0].hockey_type, "adult");
      assert.equal(await new HighSchoolOnboarding(pool, parent).blocksLegacy(adult.authId, adult.email, true), false);
      assert.deepEqual((await family.state(adult)).players, []);
    });
    await t.test("existing captured-email verification, session binding and denied fresh-login access", async () => {
      const challenge = await parent.challenge(adult, "parent_action");
      grant = (await parent.verify(adult, challenge.challengeId, captured[0].code)).verificationToken;
      const fresh = { ...adult, sessionId: randomUUID() };
      await pool.query("INSERT INTO auth.sessions VALUES($1,$2,NULL)", [fresh.sessionId, fresh.authId]);
      assert.equal(await parent.authorized(fresh, grant), false);
      await reject(() => family.draft(fresh, { revision: 0, players: [first] }, grant), "PARENT_VERIFICATION_REQUIRED");
      assert.equal((await family.state(fresh, grant)).verified, false);
      // Adult onboarding remains available; the independent Family state and
      // writes above still reject this fresh session's missing parent proof.
      const ordinary = await new HighSchoolOnboarding(pool, parent).state(fresh, grant);
      assert.equal(ordinary.path, "player");
      assert.notEqual(ordinary.status, "parent_verification_required");
      assert.equal(ordinary.draft.untouchedAdult, true);
      assert.equal(ordinary.draft.players, undefined);
      assert.equal((await family.state(adult, grant)).verified, true);
    });
    await t.test("stored DOB gates every own-family entry point, including shared invitation and consent intake", async () => {
      const operations = [
        () => family.state(adult, grant),
        () => family.begin(adult),
        () => family.draft(adult, { revision: 0, players: [first] }, grant),
        () => family.consent(adult, { revision: 0, players: [first], guardianConfirmed: true }, grant),
        () => family.newDraft(adult, { revision: 0 }, grant),
        () => family.intake.lookup(adult, "a".repeat(43), 0, grant),
        () => family.intake.join(adult, { revision: 0, teamCode: "NORTH123" }, grant),
      ];
      try {
        for (const [dob, code] of [[null, "FAMILY_DOB_REQUIRED"], ["invalid", "FAMILY_DOB_INVALID"],
          ["2008-01-01", "FAMILY_AGE_REQUIRED"]] as const) {
          await pool.query("UPDATE public.users SET date_of_birth=$2 WHERE id=$1", [adult.authId, dob]);
          for (const operation of operations) await reject(operation, code);
        }
        assert.equal((await pool.query("SELECT revision FROM hs_onboarding.family_flows WHERE auth_id=$1", [adult.authId])).rows[0].revision, 0);
        assert.equal((await pool.query("SELECT count(*)::int AS n FROM hs_onboarding.player_requests WHERE auth_id=$1", [adult.authId])).rows[0].n, 0);
      } finally {
        await pool.query("UPDATE public.users SET date_of_birth='1990-01-01' WHERE id=$1", [adult.authId]);
      }
    });
    await t.test("an existing verified 21+ account needs no completed onboarding or adult-team membership", async () => {
      await pool.query("UPDATE public.users SET date_of_birth='1990-01-01' WHERE id=$1", [a.head.authId]);
      assert.equal((await family.state(a.head)).started, false);
      assert.equal((await pool.query("SELECT onboarding_completed FROM public.users WHERE id=$1", [a.head.authId])).rows[0].onboarding_completed, false);
      assert.equal((await pool.query(`SELECT count(*)::int AS n FROM public.team_memberships m JOIN public.teams t ON t.id=m.team_id
        WHERE m.user_id=$1 AND coalesce(t.program_type,'adult')='adult'`, [a.head.authId])).rows[0].n, 0);
    });
    await t.test("incomplete drafts resume, revisions conflict and consent is never implied", async () => {
      await family.draft(adult, { revision: 0, players: [{ ...first, firstName: "", consent: false }] }, grant);
      assert.equal((await family.state(adult, grant)).players[0].firstName, "");
      await reject(() => family.draft(adult, { revision: 0, players: [first] }, grant), "DRAFT_CONFLICT");
      await family.draft(adult, { revision: 1, players: [first] }, grant);
      const saved = await family.state(adult, grant);
      assert.equal(saved.players[0].consent, false);
      assert.equal(saved.guardianConfirmed, false);
      await assert.rejects(() => family.intake.join(adult, { revision: saved.revision, teamCode: "NORTH123" }, grant));
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM hs_onboarding.player_requests WHERE auth_id=$1", [adult.authId])).rows[0].n, 0);
      await family.consent(adult, { revision: saved.revision, players: [first], guardianConfirmed: true }, grant);
      await family.intake.join(adult, { revision: saved.revision + 1, teamCode: "NORTH123" }, grant);
      const requested = await family.state(adult, grant);
      assert.equal(requested.requests.length, 1); assert.equal(requested.requests[0].status, "pending");
      assert.equal(requested.requests[0].childId, null); assert.equal(requested.activationAvailable, false);
      await reject(() => family.intake.join(adult, { revision: requested.revision, teamCode: "NORTH123" }, grant), "REQUEST_ALREADY_SUBMITTED");
    });
    await t.test("only canonical head coach or AD can review the right team's consented child", async () => {
      const request = (await review.requests(a.head, ids.varsity)).requests.find(r => r.firstName === "Casey")!;
      assert.ok(request);
      for (const actor of [a.assistant, a.manager, a.parent, a.pending])
        await assert.rejects(() => review.decide(actor, ids.varsity, request.id, { approve: true }));
      await reject(() => review.decide(a.outsider, ids.foreign, request.id, { approve: true }), "PLAYER_REVIEW_FORBIDDEN");
      await pool.query("UPDATE hs_onboarding.player_requests SET consent_version='expired' WHERE id=$1", [request.id]);
      await reject(() => review.decide(a.head, ids.varsity, request.id, { approve: true }), "PLAYER_CONSENT_REQUIRED");
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM hs_onboarding.children WHERE parent_auth_id=$1", [adult.authId])).rows[0].n, 0);
      await pool.query("UPDATE hs_onboarding.player_requests SET consent_version=$2 WHERE id=$1", [request.id, HS_CONSENT_VERSION]);
      await review.decide(a.head, ids.varsity, request.id, { approve: true });
      await reject(() => review.decide(a.head, ids.varsity, request.id, { approve: false }), "DECISION_ALREADY_RECORDED");
      const child = (await pool.query("SELECT * FROM hs_onboarding.children WHERE player_request_id=$1", [request.id])).rows[0];
      assert.equal(child.enabled, false); assert.equal(child.parent_auth_id, adult.authId);
      const context = await new TeamSkinService(pool).context({ id: adult.authId, type: "adult" });
      assert.ok(context.teams.some(team => team.id === adultTeam && team.program_type === "adult"));
      assert.ok(context.teams.some(team => team.id === ids.varsity && team.role === "parent"));
      assert.ok((await f.staff.workspace(a.head, ids.varsity)).roster.some(p => p.id === child.id && p.guardianLinked && p.consented));
    });
    await t.test("another child can join a different team while preserving the two-child household", async () => {
      let state = await family.state(adult, grant);
      await family.newDraft(adult, { revision: state.revision }, grant);
      state = await family.state(adult, grant);
      await family.consent(adult, { revision: state.revision, players: [second], guardianConfirmed: true }, grant);
      await pool.query("UPDATE hs_onboarding.teams SET code_digest=$2 WHERE id=$1", [ids.jv, parentDigest("SOUTH123")]);
      await family.intake.join(adult, { revision: state.revision + 1, teamCode: "SOUTH123" }, grant);
      state = await family.state(adult, grant);
      const request = state.requests.find(r => r.playerKey === second.id)!;
      await review.decide(a.ad, ids.jv, request.id, { approve: false });
      state = await family.state(adult, grant);
      assert.equal(state.requests.find(r => r.playerKey === second.id)?.status, "denied");
      await reject(() => family.newDraft(adult, { revision: state.revision }, grant), "HOUSEHOLD_LIMIT");
      assert.equal(state.requests[0].coverage, "league"); personal = true;
      assert.equal((await family.state(adult, grant)).requests[0].coverage, "personal");
      assert.equal((await pool.query("SELECT role FROM public.users WHERE id=$1", [adult.authId])).rows[0].role, "free_tier");
    });
    await t.test("legacy adult IDs and invitation-backed consent use canonical authority and atomic writes", async () => {
      const actor = { authId: randomUUID(), sessionId: randomUUID(), email: "legacy-family@example.com", fixture: true, emailVerified: true };
      const adultId = `legacy-${randomUUID()}`;
      await pool.query("INSERT INTO auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) VALUES($1,$2,now(),$3,'{}')", [actor.authId, actor.email, { synthetic_high_school_onboarding_dev: true }]);
      await pool.query("INSERT INTO auth.sessions VALUES($1,$2,NULL)", [actor.sessionId, actor.authId]);
      await pool.query("INSERT INTO public.users(id,email,first_name,last_name,onboarding_completed,date_of_birth) VALUES($1,$2,'Legacy','Fixture',true,'1990-01-01')", [adultId, actor.email]);
      await pool.query("INSERT INTO public.team_memberships(user_id,team_id,role,status) VALUES($1,$2,'player','approved')", [adultId, adultTeam]);
      await family.begin(actor);
      const c = await parent.challenge(actor, "parent_action");
      const actorGrant = (await parent.verify(actor, c.challengeId, captured[captured.length - 1].code)).verificationToken;
      assert.equal((await pool.query("SELECT adult_user_id FROM hs_onboarding.family_flows WHERE auth_id=$1", [actor.authId])).rows[0].adult_user_id, adultId);
      const staged = player("Invited"), token = randomBytes(32).toString("base64url");
      await pool.query(`INSERT INTO hs_onboarding.staged_players(id,team_id,source_key,first_name,last_name,grad_year,position,jersey_number)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [staged.id, ids.varsity, randomUUID(), staged.firstName, staged.lastName, staged.gradYear, staged.position, staged.jerseyNumber]);
      await pool.query(`INSERT INTO hs_onboarding.invitations(token_digest,team_id,kind,recipient_email,staged_ids,created_by)
        VALUES($1,$2,'parent',$3,$4::uuid[],$5)`, [parentDigest(token), ids.varsity, actor.email, [staged.id], a.head.authId]);
      await family.intake.lookup(actor, token, 0, actorGrant);
      const loaded = await family.state(actor, actorGrant);
      assert.equal(loaded.imported, true); assert.equal(loaded.players[0].consent, false);
      await reject(() => family.consent(actor, { revision: 1, players: [{ ...staged, firstName: "Swapped" }], guardianConfirmed: true }, actorGrant), "INVITATION_PLAYER_MISMATCH");
      await family.consent(actor, { revision: 1, players: [staged], guardianConfirmed: true }, actorGrant);
      await pool.query("UPDATE public.team_memberships SET status='pending' WHERE user_id=$1 AND team_id=$2 AND role='head_coach'", [a.head.authId, ids.varsity]);
      await reject(() => family.intake.join(actor, { revision: 2, invitation: token }, actorGrant), "INVALID_INVITATION");
      assert.equal((await family.state(actor, actorGrant)).revision, 2);
      await pool.query("UPDATE public.team_memberships SET status='approved' WHERE user_id=$1 AND team_id=$2 AND role='head_coach'", [a.head.authId, ids.varsity]);
      await family.intake.join(actor, { revision: 2, invitation: token }, actorGrant);
      const submitted = await family.state(actor, actorGrant);
      assert.equal(submitted.imported, false, "a submitted invitation is not an unsubmitted locked draft");
      const request = submitted.requests[0];
      await review.decide(a.ad, ids.varsity, request.id, { approve: true });
      const context = await new TeamSkinService(pool).context({ id: actor.authId, type: "adult" });
      assert.ok(context.teams.some(team => team.id === adultTeam && team.program_type === "adult"));
      assert.ok(context.teams.some(team => team.id === ids.varsity && team.role === "parent"));
      assert.ok((await f.staff.workspace(a.head, ids.varsity)).roster.some(p => p.firstName === "Invited" && p.guardianLinked));
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM public.users WHERE email=$1", [actor.email])).rows[0].n, 1);
      await family.newDraft(actor, { revision: submitted.revision }, actorGrant);
      const next = await family.state(actor, actorGrant);
      assert.equal(next.status, "draft"); assert.equal(next.imported, false);
      assert.deepEqual(next.players, []); assert.equal(next.requests.length, 1);
      const expired = player("Expired"), expiredToken = randomBytes(32).toString("base64url");
      await pool.query(`INSERT INTO hs_onboarding.staged_players(id,team_id,source_key,first_name,last_name,grad_year,position,jersey_number)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [expired.id, ids.varsity, randomUUID(), expired.firstName, expired.lastName, expired.gradYear, expired.position, expired.jerseyNumber]);
      await pool.query(`INSERT INTO hs_onboarding.invitations(token_digest,team_id,kind,recipient_email,staged_ids,created_by)
        VALUES($1,$2,'parent',$3,$4::uuid[],$5)`, [parentDigest(expiredToken), ids.varsity, actor.email, [expired.id], a.head.authId]);
      await family.intake.lookup(actor, expiredToken, next.revision, actorGrant);
      const matched = await family.state(actor, actorGrant);
      await pool.query("UPDATE hs_onboarding.invitations SET expires_at=now()-interval '1 second' WHERE token_digest=$1", [parentDigest(expiredToken)]);
      await reject(() => family.consent(actor, { revision: matched.revision, players: [expired], guardianConfirmed: true }, actorGrant), "INVALID_INVITATION");
      await reject(() => family.draft(actor, { revision: matched.revision, players: [expired] }, actorGrant), "IMPORT_REVIEW_REQUIRED");
      await reject(() => family.draft(actor, { revision: matched.revision, players: [] }), "PARENT_VERIFICATION_REQUIRED");
      await reject(() => family.draft(actor, { revision: next.revision, players: [] }, actorGrant), "DRAFT_CONFLICT");
      await family.draft(actor, { revision: matched.revision, players: [] }, actorGrant);
      const cleared = await family.state(actor, actorGrant);
      assert.equal(cleared.imported, false); assert.deepEqual(cleared.players, []);
      assert.equal(cleared.guardianConfirmed, false); assert.equal(cleared.requests[0].id, request.id);
      assert.equal((await pool.query("SELECT first_name FROM hs_onboarding.staged_players WHERE id=$1", [expired.id])).rows[0].first_name, "Expired");
      const second = player("Ordinary");
      await family.draft(actor, { revision: cleared.revision, players: [second] }, actorGrant);
      const ordinary = await family.state(actor, actorGrant);
      await family.consent(actor, { revision: ordinary.revision, players: [second], guardianConfirmed: true }, actorGrant);
      const consented = await family.state(actor, actorGrant);
      await family.intake.join(actor, { revision: consented.revision, teamCode: "NORTH123" }, actorGrant);
      const complete = await family.state(actor, actorGrant);
      assert.equal(complete.requests.length, 2);
      await reject(() => family.newDraft(actor, { revision: complete.revision }, actorGrant), "HOUSEHOLD_LIMIT");
    });
    await t.test("actual HTTP parent proof, production denial, no-store and lost authority", async () => {
      const old = { ...process.env };
      process.env.NODE_ENV = "development"; process.env.NONPRODUCTION_ISOLATED = "1"; delete process.env.PREVIEW_USE_LIVE_SECRETS;
      const app = express(); app.use(express.json());
      registerHighSchoolFamilyRoutes(app, family, review, parent, async () => adult);
      const http = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => http.once("listening", resolve));
      const origin = `http://127.0.0.1:${(http.address() as any).port}`;
      try {
        let response = await fetch(`${origin}/api/high-school/family/state`);
        assert.match(response.headers.get("cache-control")!, /no-store/);
        assert.deepEqual((await response.json() as any).requests, []);
        response = await fetch(`${origin}/api/high-school/family/draft`, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ revision: 0, players: [] }) });
        assert.equal(response.status, 403);
        process.env.NODE_ENV = "production";
        assert.equal((await fetch(`${origin}/api/high-school/family/state`)).status, 404);
        process.env.NODE_ENV = "development";
        await parent.revoke(adult);
        assert.deepEqual((await family.state(adult, grant)).requests, []);
        assert.equal(await parent.authorized(adult, grant), false);
        const otherSession = { ...adult, sessionId: randomUUID() };
        await pool.query("INSERT INTO auth.sessions VALUES($1,$2,NULL)", [otherSession.sessionId, adult.authId]);
        assert.equal(await parent.authorized(otherSession, grant), false);
      } finally { await new Promise<void>(resolve => http.close(() => resolve())); process.env = old; }
    });
    await t.test("the original playing account and onboarding data remain byte-for-byte intact", async () => {
      assert.deepEqual((await pool.query("SELECT * FROM public.users WHERE id=$1", [adult.authId])).rows[0], originalUser);
      assert.deepEqual((await pool.query("SELECT * FROM hs_onboarding.flows WHERE auth_id=$1", [adult.authId])).rows[0], originalFlow);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM public.team_memberships WHERE user_id=$1 AND team_id=$2 AND status='approved'", [adult.authId, adultTeam])).rows[0].n, 1);
    });
  } finally { await f.close(); }
});

test("live socket payloads stop immediately when verified authority disappears", async () => {
  const server = createServer(), wss = new WebSocketServer({ server });
  let allowed = true, socket: WebSocket | undefined;
  wss.on("connection", ws => { socket = ws; guardVerifiedAdultSocket(ws, async () => allowed); ws.send("verified adult payload"); });
  server.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  const client = new WebSocket(`ws://127.0.0.1:${(server.address() as any).port}`);
  const received: string[] = []; client.on("message", body => received.push(body.toString()));
  await new Promise<void>(resolve => client.once("message", () => resolve()));
  allowed = false;
  const closed = new Promise<void>(resolve => client.once("close", () => resolve()));
  socket!.send("must never reach a child");
  await closed;
  assert.deepEqual(received, ["verified adult payload"]);
  await new Promise<void>(resolve => wss.close(() => resolve()));
  await new Promise<void>(resolve => server.close(() => resolve()));
});

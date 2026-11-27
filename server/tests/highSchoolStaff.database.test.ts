import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { createStaffFixture } from "./helpers/highSchoolStaffFixture";
import { registerHighSchoolStaffRoutes } from "../highSchoolStaffHttp";
import { OnboardingError } from "../highSchoolOnboarding";
import { HighSchoolChildDevices } from "../highSchoolChildDevices";
import { parentDigest } from "../highSchoolParentSecurity";
import { TeamSkinService } from "../teamSkinService";
import { HighSchoolOnboarding } from "../highSchoolOnboarding";

const denied = (fn: () => Promise<unknown>, code?: string) => assert.rejects(fn, (error: any) =>
  error instanceof OnboardingError && (code ? error.code === code : error.status === 403));
test("real isolated PostgreSQL staff operations and HTTP boundaries", async t => {
  const sent: any[] = []; let failDispatch = false;
  const f = await createStaffFixture(async event => { sent.push(event); if (failDispatch) throw new Error("synthetic transport failure"); });
  const { pool, ids, actors: a, staff, events, chat } = f;
  try {
    await t.test("canonical staff only, role capabilities and roster identity", async () => {
      for (const name of ["head", "assistant", "manager", "ad"]) {
        const workspace = await staff.workspace(a[name], ids.varsity);
        assert.equal(workspace.roster.filter(p => p.type === "player").length, 2);
        assert.ok(workspace.roster.every(p => p.type !== "player" || p.id !== a[name].authId));
        assert.equal(workspace.capabilities.manageStaff, ["head", "ad"].includes(name));
        assert.equal(workspace.capabilities.createPayments, false);
      }
      for (const name of ["parent", "pending", "revoked", "outsider", "applicant"])
        await denied(() => staff.workspace(a[name], ids.varsity));
      await denied(() => staff.workspace(a.head, ids.jv));
      assert.equal((await staff.workspace(a.ad, ids.jv)).role, "athletic_director");
      await denied(() => staff.workspace({ ...a.head, fixture: false }, ids.varsity), "DEV_FIXTURE_REQUIRED");
      await denied(() => staff.settings(a.assistant, ids.varsity, { name: "No", rink: "", address: "" }));
    });
    await t.test("validated staging is idempotent and never creates children or players", async () => {
      const before = (await pool.query("SELECT count(*)::int AS n FROM hs_onboarding.children")).rows[0].n;
      const body = { rows: [{ firstName: "Staged", lastName: "Only", gradYear: 2028, position: "G", jerseyNumber: "31" }] };
      await staff.importRoster(a.manager, ids.varsity, body); await staff.importRoster(a.manager, ids.varsity, body);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM hs_onboarding.staged_players")).rows[0].n, 1);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM hs_onboarding.children")).rows[0].n, before);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM hs_onboarding.children WHERE enabled")).rows[0].n, 0);
      await assert.rejects(() => staff.importRoster(a.head, ids.varsity, { rows: [{ ...body.rows[0], consent: true }] }));
    });
    let eventId: string;
    await t.test("schedule CRUD version checks, immediate safe dispatch and idempotent retry", async () => {
      const event = { title: "Fixture game", opponent: "South", startsAt: new Date(Date.now() + 86400000).toISOString(), rink: "North", address: "123 Fixture Way" };
      const created = await events.create(a.assistant, ids.varsity, event); eventId = created.id!;
      assert.equal(sent.length, 1);
      await events.update(a.manager, ids.varsity, eventId, { ...event, rink: "Updated rink", version: 1 });
      await denied(() => events.update(a.head, ids.varsity, eventId, { ...event, version: 1 }), "EVENT_CHANGED_REFRESH_REQUIRED");
      failDispatch = true;
      const changed = await events.update(a.head, ids.varsity, eventId, { ...event, version: 2 });
      assert.equal((changed.notification as any).pending, 1);
      const retryId = sent[sent.length - 1].id;
      failDispatch = false; await events.retryDispatch(a.head, ids.varsity); assert.equal(sent[sent.length - 1].id, retryId);
      const count = sent.length; await events.retryDispatch(a.head, ids.varsity); assert.equal(sent.length, count);
      await denied(() => events.remove(a.outsider, ids.varsity, eventId, { version: 3 }));
      await events.import(a.head, ids.varsity, { rows: [event] }); await events.import(a.head, ids.varsity, { rows: [event] });
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM hs_onboarding.staff_events WHERE team_id=$1", [ids.varsity])).rows[0].n, 2);
    });
    await t.test("lineups admit only consented players on the coach's own team", async () => {
      await denied(() => events.saveLineup(a.head, ids.varsity, eventId, { entries: [{ playerId: ids.child2, state: "dress" }] }));
      await events.saveLineup(a.head, ids.varsity, eventId, { entries: [{ playerId: ids.child1, state: "dress" }] });
      const lineup = await events.lineup(a.assistant, ids.varsity, eventId);
      assert.equal(lineup.entries.length, 1); assert.ok(lineup.entries.every(p => !p.callup));
      for (const playerId of [ids.child3, a.head.authId, randomUUID()]) await denied(() =>
        events.saveLineup(a.head, ids.varsity, eventId, { entries: [{ playerId, state: "dress" }] }));
      await denied(() => events.report(a.head, ids.varsity, eventId, { version: 3, homeScore: 3, awayScore: 1 }), "FINAL_REPORT_AVAILABLE_TWO_HOURS_AFTER_START");
      await pool.query("UPDATE hs_onboarding.staff_events SET starts_at=now()-interval '3 hours' WHERE id=$1", [eventId]);
      await events.report(a.manager, ids.varsity, eventId, { version: 3, homeScore: 3, awayScore: 1 });
      await denied(() => events.report(a.head, ids.varsity, eventId, { version: 4, homeScore: 99, awayScore: 0 }), "FINAL_EVENT_LOCKED");
      assert.equal((await pool.query("SELECT home_score FROM hs_onboarding.staff_events WHERE id=$1", [eventId])).rows[0].home_score, 3);
    });
    await t.test("shared Team chat, staff labels, retries, Family privacy and AD reporting", async () => {
      const own = await staff.workspace(a.head, ids.varsity);
      const room = own.rooms.find(r => r.kind === "team")!;
      const requestId = randomUUID();
      const message = await chat.send(a.head, ids.varsity, room.id, { body: "Practice at six.", requestId });
      assert.equal((await chat.send(a.head, ids.varsity, room.id, { body: "Practice at six.", requestId })).id, message.id);
      await denied(() => chat.send(a.head, ids.varsity, room.id, { body: "Changed", requestId }), "MESSAGE_RETRY_CONFLICT");
      await pool.query("INSERT INTO hs_onboarding.child_messages(id,chat_id,child_id,body) VALUES($1,$2,$3,'Got it, Coach.')", [randomUUID(), room.id, ids.child1]);
      const messages = (await chat.messages(a.assistant, ids.varsity, room.id)).messages;
      assert.ok(messages.some(m => m.authorType === "staff" && m.sender === "head Fixture"));
      assert.ok(messages.some(m => m.authorType === "child" && m.body === "Got it, Coach."));
      const family = randomUUID();
      await pool.query("INSERT INTO hs_onboarding.child_chats(id,kind,name,parent_auth_id) VALUES($1,'family','Own Family',$2)", [family, a.parent.authId]);
      await denied(() => chat.messages(a.ad, ids.varsity, family));
      await chat.reportMessage(a.assistant, ids.varsity, message.id, { reason: "Synthetic report" });
      assert.equal((await staff.workspace(a.head, ids.varsity)).reports.length, 0);
      const report = (await staff.workspace(a.ad, ids.jv)).reports[0]; assert.ok(report);
      await denied(() => chat.resolve(a.head, ids.varsity, report.id));
      await chat.resolve(a.ad, ids.jv, report.id);
      assert.equal((await staff.workspace(a.ad, ids.varsity)).reports[0].status, "resolved");
      await denied(() => chat.messages(a.head, ids.jv, room.id));
    });
    await t.test("canonical approvals/revocation/team creation are immediate and hierarchy-scoped", async () => {
      const request = randomUUID();
      await pool.query(`INSERT INTO hs_onboarding.staff_requests(id,auth_id,program_id,team_id,role) VALUES($1,$2,$3,$4,'assistant_coach')`,
        [request, a.applicant.authId, ids.program, ids.varsity]);
      await denied(() => staff.approve(a.assistant, ids.varsity, request, { approve: true }));
      await denied(() => staff.approve(a.outsider, ids.foreign, request, { approve: true }));
      await staff.approve(a.head, ids.varsity, request, { approve: true });
      assert.equal((await staff.workspace(a.applicant, ids.varsity)).role, "assistant_coach");
      const membership = (await pool.query("SELECT id FROM public.team_memberships WHERE user_id=$1 AND team_id=$2", [a.applicant.authId, ids.varsity])).rows[0];
      await staff.revoke(a.head, ids.varsity, membership.id);
      await denied(() => staff.workspace(a.applicant, ids.varsity));
      const self = (await pool.query("SELECT id FROM public.team_memberships WHERE user_id=$1", [a.head.authId])).rows[0];
      await denied(() => staff.revoke(a.head, ids.varsity, self.id));
      await denied(() => staff.newTeam(a.head, ids.varsity, { name: "New JV" }));
      const created = await staff.newTeam(a.ad, ids.varsity, { name: "New JV" });
      assert.equal((await staff.workspace(a.ad, created.id)).team.name, "New JV");
      assert.ok((await new TeamSkinService(pool).context({ id: a.ad.authId, type: "adult" })).teams.some(t => t.id === created.id));
    });
    await t.test("payment entitlement, existing table persistence, tracking and ownership", async () => {
      const body = { title: "Team fee", amount: "15.00", recipientIds: [a.parent.authId] };
      await denied(() => staff.createPayment(a.head, ids.varsity, body));
      f.setPaymentsAllowed(true);
      await denied(() => staff.createPayment(a.head, ids.varsity, { ...body, recipientIds: [a.otherParent.authId] }));
      const request = await staff.createPayment(a.head, ids.varsity, body);
      const payment = (await staff.workspace(a.assistant, ids.varsity)).payments.find(p => p.id === request.id)!;
      assert.equal(payment.recipients[0].paid, false);
      await denied(() => staff.confirmPayment(a.head, ids.varsity, request.id, payment.recipients[0].id, { confirmed: true }));
      await pool.query("UPDATE public.payment_request_recipients SET is_paid=true WHERE id=$1", [payment.recipients[0].id]);
      await denied(() => staff.confirmPayment(a.assistant, ids.varsity, request.id, payment.recipients[0].id, { confirmed: true }));
      f.setPaymentsAllowed(false);
      await staff.confirmPayment(a.head, ids.varsity, request.id, payment.recipients[0].id, { confirmed: true });
    });
    await t.test("league bootstrap uses the same atomic writer, and conflicts roll back source decisions", async () => {
      const program = randomUUID(), request = randomUUID();
      await pool.query(`INSERT INTO hs_onboarding.programs(id,league_id,name,town,status,requested_by)
        VALUES($1,$2,'New Fixture School','Fixture Town','pending',$3)`, [program, ids.league, a.applicant.authId]);
      await pool.query(`INSERT INTO hs_onboarding.staff_requests(id,auth_id,program_id,role)
        VALUES($1,$2,$3,'head_coach')`, [request, a.applicant.authId, program]);
      await denied(() => staff.decide(a.ad, request, true));
      const onboarding = new HighSchoolOnboarding(pool, {} as any); onboarding.staffDecisions = staff;
      await onboarding.decide(a.league, request, true);
      const context = await new TeamSkinService(pool).context({ id: a.applicant.authId, type: "adult" });
      const initial = context.teams.find(t => t.program_id === program)!;
      assert.ok(initial); assert.equal(initial.role, "head_coach");
      assert.equal((await staff.workspace(a.applicant, initial.id)).team.name, "New Fixture School Varsity");
      const conflict = randomUUID();
      await pool.query(`INSERT INTO hs_onboarding.staff_requests(id,auth_id,program_id,team_id,role)
        VALUES($1,$2,$3,$4,'assistant_coach')`, [conflict, a.parent.authId, ids.program, ids.varsity]);
      await denied(() => staff.approve(a.head, ids.varsity, conflict, { approve: true }), "STAFF_MEMBERSHIP_CONFLICT");
      assert.equal((await pool.query("SELECT status FROM hs_onboarding.staff_requests WHERE id=$1", [conflict])).rows[0].status, "pending");
      const self = randomUUID();
      await pool.query(`INSERT INTO hs_onboarding.staff_requests(id,auth_id,program_id,team_id,role)
        VALUES($1,$2,$3,$4,'assistant_coach')`, [self, a.head.authId, ids.program, ids.varsity]);
      await denied(() => staff.approve(a.head, ids.varsity, self, { approve: true }));
      await staff.invitation(a.head, ids.varsity, { email: "future-staff@example.com", role: "assistant_coach" });
      await assert.rejects(() => staff.invitation(a.head, ids.varsity, { email: "real@external.test", role: "assistant_coach" }));
      assert.equal((await pool.query("SELECT delivery FROM hs_onboarding.staff_invitations")).rows[0].delivery, "disabled");
    });
    await t.test("operations recheck current authority after waiting for a revocation transaction", async () => {
      const lock = await pool.connect();
      try {
        await lock.query("BEGIN"); await lock.query("SELECT id FROM hs_onboarding.programs WHERE id=$1 FOR UPDATE", [ids.program]);
        const waiting = staff.workspace(a.assistant, ids.varsity);
        const rejected = denied(() => waiting);
        await lock.query("UPDATE public.team_memberships SET status='pending' WHERE user_id=$1", [a.assistant.authId]);
        await lock.query("COMMIT"); await rejected;
        await pool.query("UPDATE public.team_memberships SET status='approved' WHERE user_id=$1", [a.assistant.authId]);
      } finally { lock.release(); }
    });
    await t.test("future child Team/own Family boundaries work without runtime activation", async () => {
      const disabled = new HighSchoolChildDevices(pool, {} as any, false);
      await denied(() => disabled.messages("hs_child_" + "a".repeat(43), randomUUID()), "CHILD_ACTIVATION_PENDING");
      // Enable only this disposable synthetic child to exercise the future
      // protocol. Application constructor is unchanged and remains false.
      await pool.query("UPDATE hs_onboarding.children SET enabled=true WHERE id=$1", [ids.child1]);
      const room = (await staff.workspace(a.head, ids.varsity)).rooms.find(r => r.kind === "team")!;
      const token = "hs_child_" + "a".repeat(43);
      const code = randomUUID(), request = randomUUID();
      await pool.query("INSERT INTO hs_onboarding.device_codes(id,child_id,parent_auth_id,code_digest,expires_at) VALUES($1,$2,$3,'fixture',now()+interval '1 hour')", [code, ids.child1, a.parent.authId]);
      await pool.query(`INSERT INTO hs_onboarding.device_requests(id,code_id,child_id,parent_auth_id,token_digest,device_label,status,approved_session_id,expires_at)
        VALUES($1,$2,$3,$4,'request-fixture','Fixture','redeemed',$5,now()+interval '1 hour')`, [request, code, ids.child1, a.parent.authId, a.parent.sessionId]);
      await pool.query(`INSERT INTO hs_onboarding.child_sessions(token_digest,child_id,request_id,parent_auth_id,approved_session_id,expires_at)
        VALUES($1,$2,$3,$4,$5,now()+interval '1 hour')`, [parentDigest(token), ids.child1, request, a.parent.authId, a.parent.sessionId]);
      await pool.query("INSERT INTO hs_onboarding.child_chat_members VALUES($1,$2)", [room.id, ids.child1]);
      const child = new HighSchoolChildDevices(pool, {} as any, true);
      const messages = await child.messages(token, room.id);
      assert.ok(messages.messages.some((m: any) => m.authorType === "staff" && m.sender === "head Fixture"));
      await child.sendMessage(token, room.id, { body: "Shared team reply" });
      for (const badRoom of (await staff.workspace(a.head, ids.varsity)).rooms.filter(r => r.kind !== "team")) {
        await pool.query("INSERT INTO hs_onboarding.child_chat_members VALUES($1,$2)", [badRoom.id, ids.child1]);
        await denied(() => child.messages(token, badRoom.id)); await denied(() => child.sendMessage(token, badRoom.id, { body: "No" }));
      }
      const families = (await pool.query("SELECT id FROM hs_onboarding.child_chats WHERE kind='family' AND parent_auth_id=$1", [a.parent.authId])).rows;
      await pool.query("INSERT INTO hs_onboarding.child_chat_members VALUES($1,$2)", [families[0].id, ids.child1]);
      await child.sendMessage(token, families[0].id, { body: "Own family only" });
      const foreignFamily = randomUUID();
      await pool.query("INSERT INTO hs_onboarding.child_chats(id,kind,name,parent_auth_id) VALUES($1,'family','Other Family',$2)", [foreignFamily, a.otherParent.authId]);
      await pool.query("INSERT INTO hs_onboarding.child_chat_members VALUES($1,$2)", [foreignFamily, ids.child1]);
      await denied(() => child.messages(token, foreignFamily));
      await denied(() => child.sendMessage(token, foreignFamily, { body: "Forbidden" }));
      await pool.query("UPDATE public.team_memberships SET status='pending' WHERE child_profile_id=$1", [ids.child1]);
      await denied(() => child.messages(token, room.id));
      await pool.query("UPDATE public.team_memberships SET status='approved' WHERE child_profile_id=$1", [ids.child1]);
      await pool.query("UPDATE hs_onboarding.children SET enabled=false WHERE id=$1", [ids.child1]);
    });
    await t.test("HTTP denies spoofed roles and revoked sessions; production route is closed", async () => {
      const app = express(); app.use(express.json());
      let parentRequired = false;
      registerHighSchoolStaffRoutes(app, staff, events, chat, { enrolled: async () => parentRequired, authorized: async () => false } as any,
        async req => a[req.get("x-fixture-actor") ?? "pending"]);
      const server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.on("listening", resolve));
      const port = (server.address() as any).port;
      const old = { node: process.env.NODE_ENV, isolated: process.env.NONPRODUCTION_ISOLATED, live: process.env.PREVIEW_USE_LIVE_SECRETS };
      Object.assign(process.env, { NODE_ENV: "development", NONPRODUCTION_ISOLATED: "1", PREVIEW_USE_LIVE_SECRETS: "0" });
      try {
        const url = `http://127.0.0.1:${port}/api/high-school/staff/teams/${ids.varsity}`;
        assert.equal((await fetch(url, { headers: { "x-fixture-actor": "head" } })).status, 200);
        parentRequired = true;
        // Being a parent does not remove this adult's canonical staff authority.
        assert.equal((await fetch(url, { headers: { "x-fixture-actor": "head" } })).status, 200);
        parentRequired = false;
        assert.equal((await fetch(url + "?role=athletic_director", { headers: { "x-fixture-actor": "pending" } })).status, 403);
        await pool.query("UPDATE auth.sessions SET not_after=now()-interval '1 minute' WHERE id=$1", [a.manager.sessionId]);
        assert.equal((await fetch(url, { headers: { "x-fixture-actor": "manager" } })).status, 401);
        process.env.NODE_ENV = "production";
        assert.equal((await fetch(url, { headers: { "x-fixture-actor": "head" } })).status, 404);
      } finally {
        for (const [key, value] of Object.entries({ NODE_ENV: old.node, NONPRODUCTION_ISOLATED: old.isolated, PREVIEW_USE_LIVE_SECRETS: old.live })) {
          if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
        await new Promise<void>(resolve => server.close(() => resolve()));
      }
    });
  } finally { await f.close(); }
});

import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import express from "express";
import { createStaffFixture } from "./helpers/highSchoolStaffFixture";
import { SchoolLeagueManagement } from "../schoolLeagueManagement";
import { registerSchoolLeagueManagement } from "../schoolLeagueManagementHttp";
import { HighSchoolOnboarding } from "../highSchoolOnboarding";
import { HighSchoolParentSecurity, parentDigest } from "../highSchoolParentSecurity";

test("school league owner manages real teams and invitations without acquiring a staff or parent grant", async t => {
  const f = await createStaffFixture(), { pool, ids, actors: a } = f;
  const service = new SchoolLeagueManagement(pool), leagueId = ids.league;
  let server: ReturnType<express.Express["listen"]> | undefined;
  const reject = (work: Promise<unknown>, code: string) => assert.rejects(work, (error: any) => error.code === code);
  try {
    await pool.query("ALTER TABLE public.teams ADD COLUMN league_id varchar");
    await pool.query("INSERT INTO public.leagues(id,name,league_type,commissioner_id) VALUES($1,'School league','high_school',$2)", [leagueId, a.league.authId]);
    await pool.query("INSERT INTO hs_parent_security.accounts(auth_id,parent_email) VALUES($1,$2)", [a.league.authId, a.league.email]);
    const foreignLeague = randomUUID();
    await pool.query("INSERT INTO hs_onboarding.leagues(id,name) VALUES($1,'Other league')", [foreignLeague]);
    await pool.query("UPDATE hs_onboarding.programs SET league_id=$2 WHERE id=$1", [ids.foreignProgram, foreignLeague]);
    const app = express();app.use(express.json());
    registerSchoolLeagueManagement(app, service, async req => {
      if (req.get("authorization") !== "Bearer synthetic-adult-session") throw Object.assign(new Error("Denied"), { code: "INVALID_SESSION" });
      return a.league;
    });
    server = app.listen(0, "127.0.0.1");await new Promise<void>(resolve => server!.once("listening", resolve));
    const origin = `http://127.0.0.1:${(server.address() as any).port}`;
    let team: { id: string; teamCode: string }, school: { id: string };
    await t.test("real HTTP creates a program, canonical team and secret code, without an AD membership", async () => {
      const before = (await pool.query("SELECT count(*)::int AS n FROM public.team_memberships WHERE user_id=$1", [a.league.authId])).rows[0].n;
      let response = await fetch(`${origin}/api/high-school/leagues/${leagueId}/management/programs`, {
        method: "POST", headers: { authorization: "Bearer synthetic-adult-session", "content-type": "application/json" },
        body: JSON.stringify({ name: "New School", town: "Fixture Town" }),
      });
      assert.equal(response.status, 200);assert.equal(response.headers.get("cache-control"), "private, no-store");
      school = await response.json() as any;
      team = await service.team(a.league, leagueId, { programId: school.id, name: "New School Varsity" });
      assert.match(team.teamCode, /^[0-9A-F]{16}$/);
      const record = (await pool.query("SELECT * FROM hs_onboarding.teams WHERE id=$1", [team.id])).rows[0];
      assert.equal(record.code_digest, parentDigest(team.teamCode));assert.notEqual(record.code_digest, team.teamCode);
      const canonical = (await pool.query("SELECT * FROM public.teams WHERE id=$1", [team.id])).rows[0];
      assert.equal(canonical.league_id, leagueId);assert.equal(canonical.program_id, school.id);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM public.team_memberships WHERE user_id=$1", [a.league.authId])).rows[0].n, before);
      const workspace = await service.workspace(a.league, leagueId);
      assert.ok(workspace.teams.some(row => row.id === team.id));assert.ok(!JSON.stringify(workspace).includes(team.teamCode));
    });
    await t.test("global commissioner labels, cross-league targets and revoked sessions do not grant ownership", async () => {
      await pool.query("UPDATE public.users SET role='commissioner' WHERE id=$1", [a.outsider.authId]);
      await reject(service.workspace(a.outsider, leagueId), "LEAGUE_MANAGEMENT_FORBIDDEN");
      await pool.query("DELETE FROM auth.sessions WHERE id=$1", [a.revoked.sessionId]);
      await reject(service.workspace(a.revoked, leagueId), "INVALID_SESSION");
      await reject(service.team(a.league, leagueId, { name: "Foreign", programId: ids.foreignProgram }), "PROGRAM_LEAGUE_MISMATCH");
      await reject(service.schedulePreview(a.league, leagueId, { teamId: ids.foreign, format: "csv", text: "title,start\nNo,2026-12-01T12:00:00Z" }), "TEAM_LEAGUE_MISMATCH");
      const response = await fetch(`${origin}/api/high-school/leagues/${leagueId}/management`, { headers: { authorization: "Bearer restricted-child-token" } });
      assert.notEqual(response.status, 200);
    });
    await t.test("recipient-bound coach code redeems into a pending request, then requires this league owner", async () => {
      const intake = new HighSchoolOnboarding(pool, new HighSchoolParentSecurity(pool));intake.staffDecisions = f.staff;
      const invite = await service.invitation(a.league, leagueId, { kind: "staff", email: a.applicant.email, teamId: team.id, role: "head_coach" });
      assert.equal(invite.delivery, "manual");assert.ok(invite.invitation);
      await intake.choose(a.applicant, { path: "staff" });
      const state = await intake.state(a.applicant);
      await intake.lookup(a.applicant, invite.invitation, state.revision);
      const pending = (await service.workspace(a.league, leagueId)).staffRequests.find(row => row.authId === a.applicant.authId)!;
      assert.equal(pending.role, "head_coach");
      assert.equal((await pool.query("SELECT 1 FROM public.team_memberships WHERE user_id=$1 AND team_id=$2", [a.applicant.authId, team.id])).rows.length, 0);
      await reject(service.staffDecision(a.outsider, leagueId, pending.id, { approve: true }), "LEAGUE_MANAGEMENT_FORBIDDEN");
      await service.staffDecision(a.league, leagueId, pending.id, { approve: true });
      const membership = (await pool.query("SELECT role,status FROM public.team_memberships WHERE user_id=$1 AND team_id=$2", [a.applicant.authId, team.id])).rows[0];
      assert.deepEqual(membership, { role: "head_coach", status: "approved" });
      await reject(service.staffDecision(a.league, leagueId, pending.id, { approve: true }), "DECISION_ALREADY_RECORDED");
      const revokedInvite = await service.invitation(a.league, leagueId, { kind: "staff", email: a.assistant.email, teamId: team.id, role: "athletic_director" });
      await intake.choose(a.assistant, { path: "staff" });
      await pool.query("UPDATE public.leagues SET commissioner_id=$2 WHERE id=$1", [leagueId, a.outsider.authId]);
      await reject(intake.lookup(a.assistant, revokedInvite.invitation, 0), "INVALID_INVITATION");
      await pool.query("UPDATE public.leagues SET commissioner_id=$2 WHERE id=$1", [leagueId, a.league.authId]);
    });
    await t.test("parent invitation stages children without granting consent or roster access", async () => {
      const before = (await pool.query("SELECT count(*)::int AS n FROM hs_onboarding.children")).rows[0].n;
      const invite = await service.invitation(a.league, leagueId, { kind: "parent", email: a.parent.email, teamId: team.id,
        players: [{ firstName: "Invited", lastName: "Child", gradYear: 2032, position: "F", jerseyNumber: "8" }] });
      const row = (await pool.query("SELECT * FROM hs_onboarding.invitations WHERE token_digest=$1", [parentDigest(invite.invitation)])).rows[0];
      assert.equal(row.kind, "parent");assert.equal(row.staged_ids.length, 1);
      assert.equal(row.recipient_email, a.parent.email);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM hs_onboarding.children")).rows[0].n, before);
      assert.equal((await pool.query("SELECT 1 FROM public.team_memberships WHERE team_id=$1 AND role='parent'", [team.id])).rows.length, 0);
    });
    await t.test("schedule preview/import persists canonical staff events and does not pretend notification delivery", async () => {
      const text = "title,startsAt,opponent,rink,address\nFixture game,2026-12-01T18:00:00-05:00,Opponent,Fixture Rink,Town";
      const preview = await service.schedulePreview(a.league, leagueId, { teamId: team.id, format: "csv", text });
      assert.deepEqual(preview.errors, []);assert.equal(preview.rows.length, 1);
      const result = await service.scheduleImport(a.league, leagueId, { teamId: team.id, rows: preview.rows });
      assert.equal(result.count, 1);assert.ok(result.notification.pending > 0);
      assert.equal((await service.scheduleImport(a.league, leagueId, { teamId: team.id, rows: preview.rows })).count, 0);
      assert.ok((await service.workspace(a.league, leagueId)).events.some(row => row.teamId === team.id && row.title === "Fixture game"));
      const invalid = await service.schedulePreview(a.league, leagueId, { teamId: team.id, format: "csv", text: "title,startsAt\nWrong,not-a-date" });
      assert.ok(invalid.errors.length);
      await reject(service.parentDecision(a.league, leagueId, randomUUID(), { teamId: ids.foreign, approve: true }), "TEAM_LEAGUE_MISMATCH");
    });
  } finally { if (server) await new Promise<void>(resolve => server!.close(() => resolve()));await f.close(); }
});

import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import express from "express";
import { readFile } from "node:fs/promises";
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
    const migration = await readFile("migrations/0060_school_program_separation.sql", "utf8");
    await pool.query(migration);
    await pool.query(migration);
    await pool.query(await readFile("migrations/0063_school_structure_deletion.sql","utf8"));
    const app = express();app.use(express.json());
    registerSchoolLeagueManagement(app, service, async req => {
      if (req.get("authorization") !== "Bearer synthetic-adult-session") throw Object.assign(new Error("Denied"), { code: "INVALID_SESSION" });
      return a.league;
    });
    server = app.listen(0, "127.0.0.1");await new Promise<void>(resolve => server!.once("listening", resolve));
    const origin = `http://127.0.0.1:${(server.address() as any).port}`;
    let team: { id: string; teamCode: string }, school: { id: string }, program: { id: string };
    await t.test("migration preserves existing programs, teams, memberships and private storage", async () => {
      const legacy = (await service.workspace(a.league, leagueId)).programs.find(row => row.id === ids.program)!;
      assert.equal(legacy.schoolId, ids.program);assert.equal(legacy.name, "program");
      assert.equal((await pool.query("SELECT program_id FROM hs_onboarding.teams WHERE id=$1", [ids.varsity])).rows[0].program_id, ids.program);
      assert.equal((await pool.query("SELECT status FROM public.team_memberships WHERE user_id=$1 AND team_id=$2", [a.head.authId, ids.varsity])).rows[0].status, "approved");
      const privacy = (await pool.query(`SELECT relrowsecurity,
        has_table_privilege('anon','hs_onboarding.schools','SELECT') AS anon,
        has_table_privilege('authenticated','hs_onboarding.schools','SELECT') AS authenticated
        FROM pg_class WHERE oid='hs_onboarding.schools'::regclass`)).rows[0];
      assert.deepEqual(privacy, { relrowsecurity: true, anon: false, authenticated: false });
    });
    await t.test("real HTTP creates a school, separate program, canonical team and secret code without an AD membership", async () => {
      const before = (await pool.query("SELECT count(*)::int AS n FROM public.team_memberships WHERE user_id=$1", [a.league.authId])).rows[0].n;
      let response = await fetch(`${origin}/api/high-school/leagues/${leagueId}/management/schools`, {
        method: "POST", headers: { authorization: "Bearer synthetic-adult-session", "content-type": "application/json" },
        body: JSON.stringify({ name: "New School", town: "Fixture Town" }),
      });
      assert.equal(response.status, 200);assert.equal(response.headers.get("cache-control"), "private, no-store");
      school = await response.json() as any;
      response = await fetch(`${origin}/api/high-school/leagues/${leagueId}/management/programs`, {
        method: "POST", headers: { authorization: "Bearer synthetic-adult-session", "content-type": "application/json" },
        body: JSON.stringify({ name: "Hockey", schoolId: school.id }),
      });
      assert.equal(response.status, 200); program = await response.json() as any;
      assert.notEqual(program.id, school.id);
      team = await service.team(a.league, leagueId, { programId: program.id, name: "New School Varsity" });
      assert.match(team.teamCode, /^[0-9A-F]{16}$/);
      const record = (await pool.query("SELECT * FROM hs_onboarding.teams WHERE id=$1", [team.id])).rows[0];
      assert.equal(record.code_digest, parentDigest(team.teamCode));assert.notEqual(record.code_digest, team.teamCode);
      const canonical = (await pool.query("SELECT * FROM public.teams WHERE id=$1", [team.id])).rows[0];
      assert.equal(canonical.league_id, leagueId);assert.equal(canonical.program_id, program.id);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM public.team_memberships WHERE user_id=$1", [a.league.authId])).rows[0].n, before);
      const workspace = await service.workspace(a.league, leagueId);
      assert.ok(workspace.teams.some(row => row.id === team.id));assert.ok(!JSON.stringify(workspace).includes(team.teamCode));
    });
    await t.test("one school has multiple programs and a program has three independent teams", async () => {
      await service.team(a.league, leagueId, { programId: program.id, name: "JV" });
      await service.team(a.league, leagueId, { programId: program.id, name: "Freshman" });
      const other = await service.program(a.league, leagueId, { schoolId: school.id, name: "Girls Hockey" });
      let workspace = await service.workspace(a.league, leagueId);
      assert.equal(workspace.programs.filter(row => row.schoolId === school.id).length, 2);
      assert.equal(workspace.teams.filter(row => row.programId === program.id).length, 3);
      await service.updateProgram(a.league, leagueId, other.id, { schoolId: school.id, name: "Girls Varsity Hockey" });
      workspace = await service.workspace(a.league, leagueId);
      assert.equal(workspace.programs.find(row => row.id === other.id)?.name, "Girls Varsity Hockey");
      const duplicate = await fetch(`${origin}/api/high-school/leagues/${leagueId}/management/programs`, {
        method: "POST", headers: { authorization: "Bearer synthetic-adult-session", "content-type": "application/json" },
        body: JSON.stringify({ name: "hockey", schoolId: school.id }),
      });
      assert.equal(duplicate.status, 409);
    });
    await t.test("school reuse across owned leagues does not share teams or grant foreign program access", async () => {
      const secondLeague = randomUUID();
      await pool.query("INSERT INTO public.leagues(id,name,league_type,commissioner_id) VALUES($1,'Youth league','youth',$2)", [secondLeague, a.league.authId]);
      const shared = await service.program(a.league, secondLeague, { schoolId: school.id, name: "Hockey" });
      const workspace = await service.workspace(a.league, secondLeague);
      assert.ok(workspace.schools.some(row => row.id === school.id));
      assert.ok(workspace.programs.some(row => row.id === shared.id));
      assert.ok(!workspace.programs.some(row => row.id === program.id));
      assert.ok(!workspace.teams.some(row => row.id === team.id));
      await reject(service.program(a.league, leagueId, { schoolId: ids.foreignProgram, name: "Stolen" }), "SCHOOL_ACCESS_FORBIDDEN");
      await reject(service.updateProgram(a.league, leagueId, ids.foreignProgram, { schoolId: school.id, name: "Stolen" }), "PROGRAM_LEAGUE_MISMATCH");
      await reject(service.updateProgram(a.outsider, leagueId, program.id, { schoolId: school.id, name: "Stolen" }), "LEAGUE_MANAGEMENT_FORBIDDEN");
    });
    await t.test("legacy programs can be renamed and explicitly relinked without changing staff, children or teams", async () => {
      const before = (await pool.query("SELECT id,team_id,user_id,child_profile_id,role,status FROM public.team_memberships ORDER BY id")).rows;
      await service.updateProgram(a.league, leagueId, ids.program, { schoolId: school.id, name: "Legacy Hockey" });
      const after = (await pool.query("SELECT id,team_id,user_id,child_profile_id,role,status FROM public.team_memberships ORDER BY id")).rows;
      assert.deepEqual(after, before);
      assert.equal((await pool.query("SELECT program_id FROM hs_onboarding.teams WHERE id=$1", [ids.varsity])).rows[0].program_id, ids.program);
      const legacy = (await service.workspace(a.league, leagueId)).programs.find(row => row.id === ids.program)!;
      assert.equal(legacy.schoolId, school.id);assert.equal(legacy.name, "Legacy Hockey");
    });
    await t.test("staff school requests save distinct school and program records but grant no access", async () => {
      const intake = new HighSchoolOnboarding(pool, new HighSchoolParentSecurity(pool));
      const state = await intake.state(a.manager);
      await intake.save(a.manager, { kind: "staff", revision: state.revision, role: "head_coach",
        newSchool: { name: "Requested School", town: "Requested Town", programName: "Requested Hockey", leagueId } });
      const [record] = (await pool.query(`SELECT p.name,p.status,s.name AS school,s.town FROM hs_onboarding.programs p
        JOIN hs_onboarding.schools s ON s.id=p.school_id WHERE p.requested_by=$1 AND p.name='Requested Hockey'`, [a.manager.authId])).rows;
      assert.deepEqual(record, { name: "Requested Hockey", status: "pending", school: "Requested School", town: "Requested Town" });
      const result = await intake.catalog(a.manager, "Requested School");
      assert.equal(result.programs.length, 1);assert.equal(result.programs[0].name, "Requested Hockey");
      assert.equal(result.programs[0].schoolName, "Requested School");
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

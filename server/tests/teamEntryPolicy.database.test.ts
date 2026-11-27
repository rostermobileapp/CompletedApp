import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import express from "express";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq, ilike } from "drizzle-orm";
import { leagues, teams } from "../../shared/schema";
import { createStaffFixture } from "./helpers/highSchoolStaffFixture";
import { HighSchoolOnboarding } from "../highSchoolOnboarding";
import { parentDigest, type HighSchoolParentSecurity } from "../highSchoolParentSecurity";
import { TeamEntryPolicy, enforceTeamEntry, publicLeagueDiscoveryCondition, publicTeamDiscoveryCondition } from "../teamEntryPolicy";

test("actual public routes require invitations and cannot be bypassed by roles, IDs or legacy membership state", async t => {
  const f = await createStaffFixture();
  let server: any;
  try {
    await f.pool.query(`DROP TABLE public.leagues; CREATE TABLE public.leagues(id varchar PRIMARY KEY,name text,unique_league_id varchar,
      league_type varchar NOT NULL DEFAULT 'adult',commissioner_id varchar);
      ALTER TABLE public.teams ADD COLUMN league_id varchar, ADD COLUMN unique_team_id varchar;
      ALTER TABLE public.league_memberships ADD COLUMN id varchar DEFAULT gen_random_uuid(), ADD COLUMN league_role varchar;
      INSERT INTO public.leagues(id,name,league_type) VALUES('adult','Adult','adult'),('school','School','high_school'),('youth','Youth','youth');
      INSERT INTO public.teams(id,name,program_type,league_id,unique_team_id) VALUES
        ('adult-team','Adult','adult','adult','T90001'),
        ('school-team','School','adult','school','T90002'),
        ('youth-team','Youth','adult','youth','T90003'),
        ('standalone-adult','Standalone Adult','adult',NULL,'T90004');
      UPDATE public.teams SET unique_team_id='T90005' WHERE id='${f.ids.varsity}';
      UPDATE public.teams SET unique_team_id='T90006' WHERE id='${f.ids.foreign}';`);
    await f.pool.query("INSERT INTO public.leagues(id,name,commissioner_id) VALUES($1,'Legacy school league',$2)",
      [f.ids.league, f.actors.league.authId]);
    await f.pool.query("UPDATE public.leagues SET commissioner_id=$1 WHERE id IN('school','youth')", [f.actors.league.authId]);
    await f.pool.query("UPDATE public.leagues SET commissioner_id=$1 WHERE id='adult'", [f.actors.parent.authId]);
    await f.pool.query("UPDATE public.teams SET league_id=$1 WHERE id=$2", [f.ids.league, f.ids.varsity]);
    await f.pool.query(`INSERT INTO public.league_memberships(id,user_id,league_id,status,league_role)
      VALUES('old-request',$1,'youth','rejected','free_tier'),('co-commissioner',$2,'youth','approved','secondary_commissioner')`,
    [f.actors.parent.authId, f.actors.assistant.authId]);
    const db = drizzle(f.pool), policy = new TeamEntryPolicy(f.pool);
    let writes = 0;
    const storage = {
      getLeagues: async (_sport: unknown, _search: unknown, publicDiscovery: boolean) => {
        assert.equal(publicDiscovery, true);
        return db.select({ id: leagues.id, name: leagues.name }).from(leagues).where(publicLeagueDiscoveryCondition);
      },
      searchTeams: async (search: string) => db.select({ id: teams.id, uniqueTeamId: teams.uniqueTeamId })
        .from(teams).leftJoin(leagues, eq(teams.leagueId, leagues.id))
        .where(and(ilike(teams.uniqueTeamId, `%${search}%`), publicTeamDiscoveryCondition)),
      getTeamByUniqueId: async (code: string) => (await f.pool.query(
        "SELECT id,unique_team_id AS \"uniqueTeamId\" FROM public.teams WHERE unique_team_id=$1", [code])).rows[0],
      getUserLeagueMembership: async (userId: string, leagueId: string) => (await f.pool.query(
        "SELECT id,status FROM public.league_memberships WHERE user_id=$1 AND league_id=$2", [userId, leagueId])).rows[0],
      requestLeagueMembership: async ({ userId, leagueId }: any) => {
        writes++;
        return (await f.pool.query(`INSERT INTO public.league_memberships(user_id,league_id,status)
          VALUES($1,$2,'pending') RETURNING id,status`, [userId, leagueId])).rows[0];
      },
      getLeague: async () => undefined, // No external notifications from this isolated harness.
      getUser: async (id: string) => ({ id }),
      approveLeagueMembership: async (id: string) => {
        writes++;return (await f.pool.query("UPDATE public.league_memberships SET status='approved' WHERE id=$1 RETURNING id,status", [id])).rows[0];
      },
      rejectLeagueMembership: async (id: string) => {
        writes++;return (await f.pool.query("UPDATE public.league_memberships SET status='rejected' WHERE id=$1 RETURNING id,status", [id])).rows[0];
      },
      createTeam: async () => { writes++; throw new Error("Unexpected team creation"); },
    };
    // Execute the actual registration statements, including middleware order and
    // complete handlers, without importing app startup or any hosted database.
    const source = await readFile("server/routes.ts", "utf8");
    const ast = ts.createSourceFile("routes.ts", source, ts.ScriptTarget.Latest, true);
    const paths = new Set(["/api/leagues", "/api/teams/search", "/api/teams/:id", "/api/teams/by-code/:uniqueTeamId",
      "/api/leagues/:id/join", "/api/teams/:teamId/join-league", "/api/teams",
      "/api/league-memberships/:id/approve", "/api/league-memberships/:id/reject",
      "/api/leagues/:leagueId/members/:memberId"]);
    const app = express();app.use(express.json());
    const isAuthenticated = (req: any, res: any, next: any) => {
      const actor = Object.values(f.actors).find(actor => actor.authId === req.get("x-test-actor"));
      if (!actor) return res.status(401).json({ code: "UNAUTHENTICATED" });
      req.user = { claims: { sub: actor.authId } };next();
    };
    const captured = new Set<string>();
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
          node.expression.expression.getText(ast) === "app" && node.arguments[0] &&
          ts.isStringLiteral(node.arguments[0]) && paths.has(node.arguments[0].text)) {
        const path = node.arguments[0].text;
        const method = ["/api/leagues", "/api/teams/search", "/api/teams/:id", "/api/teams/by-code/:uniqueTeamId"].includes(path) ? "get"
          : path === "/api/leagues/:leagueId/members/:memberId" ? "patch" : "post";
        if (node.expression.name.text !== method) return;
        const compiled = ts.transpileModule(`${node.getText(ast)};`, {
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
        }).outputText;
        vm.runInNewContext(compiled, { app, pool: f.pool, db, storage, isAuthenticated, TeamEntryPolicy,
          enforceTeamEntry, console, broadcastNotificationUpdate: () => {}, broadcastToUser: () => {} });
        captured.add(path);
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);assert.equal(captured.size, paths.size);
    server = app.listen(0, "127.0.0.1");await new Promise<void>(resolve => server.once("listening", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const request = (path: string, method = "GET", actor = f.actors.parent.authId, body?: unknown) =>
      fetch(`${origin}${path}`, { method, headers: { "content-type": "application/json", "x-test-actor": actor },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

    await t.test("searches and display-ID lookups never disclose school or Youth teams", async () => {
      assert.equal((await request("/api/teams/search?search=T900", "GET", "")).status, 401);
      assert.deepEqual((await (await request("/api/leagues?search=%25")).json()).map((row: any) => row.id), ["adult"]);
      const response = await request("/api/teams/search?search=T900");
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).map((row: any) => row.id).sort(), ["adult-team", "standalone-adult"]);
      for (const code of ["T90002", "T90003", "T90005", "T90006"]) {
        assert.equal((await request(`/api/teams/by-code/${code}`)).status, 404);
      }
      assert.equal((await request("/api/teams/by-code/T90001")).status, 200);
    });
    await t.test("all account roles are refused before membership changes, including forged invitations and re-requests", async () => {
      for (const actor of Object.values(f.actors)) for (const leagueId of ["school", "youth", f.ids.league]) {
        const response = await request(`/api/leagues/${leagueId}/join`, "POST", actor.authId,
          { inviteCode: "T90003", invitation: "forged", role: "commissioner", leagueType: "adult" });
        assert.equal(response.status, 403);assert.equal((await response.json()).code, "INVITATION_REQUIRED");
      }
      assert.equal((await request("/api/teams/adult-team/join-league", "POST", f.actors.parent.authId, { leagueId: "youth" })).status, 403);
      assert.equal(writes, 0);
      assert.equal((await f.pool.query("SELECT status FROM public.league_memberships WHERE id='old-request'")).rows[0].status, "rejected");
      assert.equal((await request("/api/leagues/missing/join", "POST", f.actors.parent.authId, {})).status, 404);
    });
    await t.test("team creation, cross-league assignment and self-approval cannot bypass invitations", async () => {
      assert.equal((await request("/api/teams", "POST", f.actors.parent.authId,
        { name: "Uninvited team", leagueId: "youth", sport: "hockey" })).status, 403);
      assert.equal((await request("/api/leagues/adult/members/fake-member", "PATCH", f.actors.parent.authId,
        { assignedTeamId: "youth-team", status: "approved" })).status, 403);
      for (const actor of [f.actors.parent, f.actors.pending, f.actors.outsider]) {
        assert.equal((await request("/api/league-memberships/old-request/approve", "POST", actor.authId, {})).status, 403);
      }
      assert.equal(writes, 0);
    });
    await t.test("Adult joining and correctly authorized management still work", async () => {
      assert.equal((await request("/api/leagues/adult/join", "POST", f.actors.applicant.authId, {})).status, 200);
      assert.equal((await request("/api/league-memberships/old-request/approve", "POST", f.actors.assistant.authId, {})).status, 200);
      await f.pool.query("UPDATE public.league_memberships SET status='inactive' WHERE id='co-commissioner'");
      assert.equal((await request("/api/league-memberships/old-request/reject", "POST", f.actors.assistant.authId, {})).status, 403);
      assert.equal((await request("/api/league-memberships/old-request/reject", "POST", f.actors.league.authId, {})).status, 200);
      await policy.teamCreation("youth", f.actors.league.authId);
      await policy.teamCreation("adult", f.actors.applicant.authId);
      await policy.teamAssignment("youth", "youth-team");
      assert.equal(writes, 3);
    });
    await t.test("classification lookup failures fail closed", async () => {
      const broken = new TeamEntryPolicy({ query: async () => { throw new Error("Simulated unavailable database"); } });
      const middleware = enforceTeamEntry(() => broken.publicLeagueJoin("youth"));
      let nextCalled = false, status = 0;
      await middleware({} as any, { status(value: number) { status = value;return this; }, json() {} } as any,
        () => { nextCalled = true; });
      assert.equal(status, 503);assert.equal(nextCalled, false);
    });
  } finally {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    await f.close();
  }
});

test("existing-school staff entry requires a real, current, recipient-bound invitation", async () => {
  const f = await createStaffFixture();
  try {
    const intake = new HighSchoolOnboarding(f.pool, {} as HighSchoolParentSecurity);
    intake.staffDecisions = { installed: async () => true, decide: f.staff.decide.bind(f.staff) };
    const actor = f.actors.applicant;
    const countBefore = (await f.pool.query("SELECT count(*)::int AS count FROM hs_onboarding.staff_requests")).rows[0].count;
    for (const role of ["head_coach", "assistant_coach", "athletic_director", "team_manager"]) {
      await assert.rejects(intake.save(actor, { kind: "staff", revision: 0, role, programId: f.ids.program, teamId: f.ids.varsity }),
        (error: any) => error.code === "INVITATION_REQUIRED" && error.status === 403);
    }
    assert.equal((await f.pool.query("SELECT count(*)::int AS count FROM hs_onboarding.staff_requests")).rows[0].count, countBefore);
    const programsBefore = (await f.pool.query("SELECT count(*)::int AS count FROM hs_onboarding.programs")).rows[0].count;
    await assert.rejects(intake.save(actor, { kind: "staff", revision: 0, role: "head_coach", teamId: f.ids.varsity,
      newSchool: { leagueId: f.ids.league, name: "New school fixture", town: "Fixture Town" } }),
      (error: any) => error.code === "NEW_SCHOOL_TEAM_NOT_ALLOWED");
    assert.equal((await f.pool.query("SELECT count(*)::int AS count FROM hs_onboarding.programs")).rows[0].count, programsBefore);
    const token = "SyntheticStaffInvitationOnlyForTesting123456789";
    await f.pool.query(`INSERT INTO hs_onboarding.invitations(token_digest,team_id,kind,recipient_email,staff_role,created_by)
      VALUES($1,$2,'staff',$3,'assistant_coach',$4)`, [parentDigest(token), f.ids.varsity, actor.email, f.actors.head.authId]);
    await assert.rejects(intake.lookup(f.actors.assistant, token, 0), (error: any) => error.code === "INVALID_INVITATION");
    await f.pool.query("UPDATE hs_onboarding.invitations SET expires_at=now()-interval '1 minute' WHERE token_digest=$1", [parentDigest(token)]);
    await assert.rejects(intake.lookup(actor, token, 0), (error: any) => error.code === "INVALID_INVITATION");
    await f.pool.query("UPDATE hs_onboarding.invitations SET expires_at=now()+interval '1 day' WHERE token_digest=$1", [parentDigest(token)]);
    await f.pool.query("UPDATE public.team_memberships SET status='pending' WHERE user_id=$1", [f.actors.head.authId]);
    await assert.rejects(intake.lookup(actor, token, 0), (error: any) => error.code === "INVALID_INVITATION");
    await f.pool.query("UPDATE public.team_memberships SET status='approved' WHERE user_id=$1", [f.actors.head.authId]);
    await intake.lookup(actor, token, 0);
    const [request] = (await f.pool.query("SELECT role,status,team_id FROM hs_onboarding.staff_requests WHERE auth_id=$1", [actor.authId])).rows;
    assert.equal(request.role, "assistant_coach");assert.equal(request.status, "pending");assert.equal(request.team_id, f.ids.varsity);
    assert.equal((await f.pool.query("SELECT count(*)::int AS count FROM public.team_memberships WHERE user_id=$1", [actor.authId])).rows[0].count, 0);
    // New-school provisioning remains a pending school request, never a way to
    // attach an existing team or activate the requesting account.
    await intake.save(f.actors.revoked, { kind: "staff", revision: 0, role: "head_coach",
      newSchool: { leagueId: f.ids.league, name: "New school fixture", town: "Fixture Town" } });
    const [schoolRequest] = (await f.pool.query("SELECT status,team_id FROM hs_onboarding.staff_requests WHERE auth_id=$1", [f.actors.revoked.authId])).rows;
    assert.equal(schoolRequest.status, "pending");assert.equal(schoolRequest.team_id, null);
  } finally { await f.close(); }
});

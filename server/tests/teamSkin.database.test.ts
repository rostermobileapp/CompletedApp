import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import { Pool } from "pg";
import express from "express";
import { TeamSkinService } from "../teamSkinService";
import { registerTeamSkinRoutes } from "../teamSkinHttp";
import { HighSchoolChildDevices } from "../highSchoolChildDevices";
import { ParentSecurityError } from "../highSchoolParentSecurity";
import { getSkin } from "../../shared/teamSkin";

test("actual DEV migration and HTTP context enforce canonical roles, child locks, idempotency and approved-only import", async () => {
  const connection = process.env.TEST_DATABASE_URL;
  assert.ok(connection, "TEST_DATABASE_URL required");
  const url = new URL(connection);
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "56439"); assert.equal(url.pathname, "/hs_skin_test");
  const pool = new Pool({ connectionString: connection });
  const c = await pool.connect();
  const ids = Object.fromEntries(["head", "assistant", "ad", "mixed", "pending", "nonfixture", "overlimit",
    "program", "varsity", "jv", "adult", "child1", "child2", "request1", "request2"].map(k => [k, randomUUID()]));
  try {
    assert.equal((await c.query("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public'")).rows[0].count, 0);
    await c.query(`CREATE SCHEMA auth; CREATE SCHEMA hs_onboarding;
      DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['anon','authenticated','service_role','supabase_auth_admin'] LOOP
        IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=n) THEN EXECUTE format('CREATE ROLE %I',n); END IF;
      END LOOP; END $$;
      CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,
        raw_app_meta_data jsonb,raw_user_meta_data jsonb DEFAULT '{}');
      CREATE TABLE public.users(id varchar PRIMARY KEY,email text UNIQUE,first_name text,last_name text,role text DEFAULT 'free_tier');
      CREATE TABLE public.teams(id varchar PRIMARY KEY,name text NOT NULL);
      CREATE TABLE public.team_memberships(id varchar PRIMARY KEY DEFAULT gen_random_uuid(),user_id varchar NOT NULL REFERENCES public.users(id),
        team_id varchar REFERENCES public.teams(id),status text DEFAULT 'pending',is_captain boolean DEFAULT false);
      CREATE TABLE hs_onboarding.programs(id uuid PRIMARY KEY,status text);
      CREATE TABLE hs_onboarding.teams(id uuid PRIMARY KEY,name text,program_id uuid REFERENCES hs_onboarding.programs(id));
      CREATE TABLE hs_onboarding.flows(auth_id uuid PRIMARY KEY,block_legacy boolean);
      CREATE TABLE hs_onboarding.staff_requests(id uuid PRIMARY KEY,auth_id uuid,program_id uuid,team_id uuid,role text,status text);
      CREATE TABLE hs_onboarding.player_requests(id uuid PRIMARY KEY,auth_id uuid,player_key uuid,team_id uuid,status text,
        consent_version text,consented_at timestamptz);
      CREATE TABLE hs_onboarding.children(id uuid PRIMARY KEY,parent_auth_id uuid,player_request_id uuid,
        revoked_at timestamptz,enabled boolean DEFAULT false);`);
    for (const name of ["head", "assistant", "ad", "mixed", "pending", "nonfixture", "overlimit"]) {
      await c.query("INSERT INTO auth.users(id,email,email_confirmed_at,raw_app_meta_data) VALUES($1,$2,now(),$3)",
        [ids[name], `${name}@example.com`, JSON.stringify({ synthetic_high_school_onboarding_dev: name !== "nonfixture" })]);
    }
    await c.query("INSERT INTO hs_onboarding.programs VALUES($1,'approved')", [ids.program]);
    for (const name of ["varsity", "jv"]) await c.query("INSERT INTO hs_onboarding.teams VALUES($1,$2,$3)", [ids[name], name, ids.program]);
    for (const [actor, role, team, status] of [
      ["head", "head_coach", "varsity", "approved"], ["assistant", "assistant_coach", "varsity", "approved"],
      ["ad", "athletic_director", null, "approved"], ["mixed", "team_manager", "jv", "approved"],
      ["pending", "head_coach", "varsity", "pending"], ["nonfixture", "head_coach", "varsity", "approved"],
    ]) await c.query("INSERT INTO hs_onboarding.staff_requests VALUES($1,$2,$3,$4,$5,$6)",
      [randomUUID(), ids[actor!], ids.program, team ? ids[team] : null, role, status]);
    for (const n of [1, 2]) {
      await c.query("INSERT INTO hs_onboarding.player_requests VALUES($1,$2,$3,$4,'approved','dev-draft-2026-11-19',now())",
        [ids[`request${n}`], ids.mixed, randomUUID(), ids.varsity]);
      await c.query("INSERT INTO hs_onboarding.children(id,parent_auth_id,player_request_id) VALUES($1,$2,$3)",
        [ids[`child${n}`], ids.mixed, ids[`request${n}`]]);
    }
    for (let n = 0; n < 3; n++) await c.query(
      "INSERT INTO hs_onboarding.player_requests VALUES($1,$2,$3,$4,'approved','dev-draft-2026-11-19',now())",
      [randomUUID(), ids.overlimit, randomUUID(), ids.varsity]);
    await c.query("INSERT INTO public.users(id,email) VALUES($1,'mixed@example.com');", [ids.mixed]);
    await c.query("INSERT INTO public.teams VALUES($1,'Unchanged adult team')", [ids.adult]);
    await c.query("INSERT INTO public.team_memberships(user_id,team_id,status) VALUES($1,$2,'approved')", [ids.mixed, ids.adult]);
    await c.query("SELECT set_config('roster.hs_skin_dev','phase1',false)");
    const sql = await readFile("scripts/dev-only/high-school-team-skins.sql", "utf8");
    await c.query(sql);
    const service = new TeamSkinService(c);
    const context = await service.context({ id: ids.mixed, type: "adult" });
    assert.equal(context.teams.length, 3);
    assert.equal(getSkin(context.actor, context.teams.find(t => t.id === ids.varsity)!), "parent");
    assert.equal(getSkin(context.actor, context.teams.find(t => t.id === ids.jv)!), "coach");
    assert.equal(getSkin(context.actor, context.teams.find(t => t.id === ids.adult)!), "adult");
    const leagueOnly = randomUUID();
    await c.query("INSERT INTO public.teams(id,name) VALUES($1,'Existing league-assigned adult team')", [leagueOnly]);
    const legacyAware = new TeamSkinService(c, async () => [{ id: leagueOnly }]);
    const legacyContext = await legacyAware.context({ id: ids.mixed, type: "adult" });
    assert.equal(legacyContext.teams.some(t => t.id === leagueOnly && t.program_type === "adult"), true);
    assert.equal(legacyContext.teams.some(t => t.id === ids.adult), false, "the existing adult selector remains authoritative");
    assert.equal((await service.context({ id: ids.ad, type: "adult" })).teams.length, 2);
    assert.equal((await service.context({ id: ids.pending, type: "adult" })).teams.length, 0);
    assert.equal((await service.context({ id: ids.nonfixture, type: "adult" })).teams.length, 0);
    assert.equal((await service.context({ id: ids.overlimit, type: "adult" })).teams.length, 0);
    for (const id of [ids.child1, ids.child2]) {
      const child = await service.context({ id, type: "child" });
      assert.equal(child.teams.length, 1);
      assert.equal(getSkin(child.actor, child.teams[0]), "player");
      assert.equal(child.teams[0].program_type, "high_school");
    }
    assert.equal((await c.query("SELECT count(*)::int AS count FROM hs_onboarding.children WHERE enabled")).rows[0].count, 0);
    const count = (await c.query("SELECT count(*)::int AS count FROM public.team_memberships")).rows[0].count;
    await c.query(sql);
    assert.equal((await c.query("SELECT count(*)::int AS count FROM public.team_memberships")).rows[0].count, count);
    assert.deepEqual((await c.query("SELECT role FROM public.users WHERE id=$1", [ids.mixed])).rows, [{ role: "free_tier" }]);
    assert.equal((await c.query("SELECT program_type FROM public.teams WHERE id=$1", [ids.adult])).rows[0].program_type, "adult");
    // Canonical mutations take effect without re-reading onboarding drafts.
    await c.query("UPDATE public.team_memberships SET role='assistant_coach' WHERE user_id=$1 AND team_id=$2", [ids.mixed, ids.varsity]);
    assert.equal((await service.context({ id: ids.mixed, type: "adult" })).teams.find(t => t.id === ids.varsity)!.role, "assistant_coach");
    await c.query("UPDATE public.team_memberships SET status='pending' WHERE user_id=$1 AND team_id=$2", [ids.mixed, ids.varsity]);
    assert.equal((await service.context({ id: ids.mixed, type: "adult" })).teams.some(t => t.id === ids.varsity), false);

    const saved: Record<string, string | undefined> = {
      NODE_ENV: process.env.NODE_ENV, NONPRODUCTION_ISOLATED: process.env.NONPRODUCTION_ISOLATED,
      PREVIEW_USE_LIVE_SECRETS: process.env.PREVIEW_USE_LIVE_SECRETS,
    };
    process.env.NODE_ENV = "development"; process.env.NONPRODUCTION_ISOLATED = "1"; delete process.env.PREVIEW_USE_LIVE_SECRETS;
    let verified = false;
    const parent: any = { async enrolled() { return true; }, async authorized() { return verified; } };
    const children = new HighSchoolChildDevices(c as any, parent, false);
    const app = express();
    registerTeamSkinRoutes(app, service, parent, children, async req => {
      if (req.get("authorization") !== "Bearer synthetic-fixture") throw new ParentSecurityError("INVALID_SESSION", 401);
      return { authId: ids.mixed, sessionId: randomUUID(), email: "mixed@example.com", emailVerified: true, fixture: true };
    });
    const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const base = `http://127.0.0.1:${(server.address() as any).port}`;
    try {
      assert.equal((await fetch(`${base}/api/high-school/skin-context`)).status, 401);
      const headers = { Authorization: "Bearer synthetic-fixture" };
      assert.equal((await fetch(`${base}/api/high-school/skin-context`, { headers })).status, 403);
      verified = true;
      const response = await fetch(`${base}/api/high-school/skin-context?role=athletic_director&userId=${ids.ad}`, { headers });
      assert.equal(response.status, 200);
      const json = await response.json();
      assert.equal(json.actor.id, ids.mixed);
      assert.equal(json.teams.some((t: any) => t.role === "athletic_director"), false);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal((await fetch(`${base}/api/high-school/child-device/skin-context`, { headers })).status, 403);
      process.env.NODE_ENV = "production";
      assert.equal((await fetch(`${base}/api/high-school/skin-context`, { headers })).status, 404);
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
      for (const key of ["NODE_ENV", "NONPRODUCTION_ISOLATED", "PREVIEW_USE_LIVE_SECRETS"]) {
        if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
      }
    }
  } finally { c.release(); await pool.end(); }
});

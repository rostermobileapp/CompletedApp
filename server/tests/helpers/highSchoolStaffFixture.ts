import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { HighSchoolStaffOperations } from "../../highSchoolStaffOperations";
import { HighSchoolStaffEvents } from "../../highSchoolStaffEvents";
import { HighSchoolStaffChat } from "../../highSchoolStaffChat";
import type { OnboardingActor } from "../../highSchoolOnboarding";
import type { StaffDispatch } from "../../highSchoolStaffBase";
import { HS_CONSENT_VERSION } from "../../../shared/highSchoolOnboarding";

/** Disposable, loopback-only real SQL fixtures. Never imports the application's
 * DB module or uses a workspace/hosted connection or credential. */
export async function createStaffFixture(dispatch?: StaffDispatch) {
  const admin = new Pool({ host: "127.0.0.1", port: 56439, user: "runner", database: "postgres" });
  const database = `hs_staff_test_${randomUUID().replace(/-/g, "")}`;
  assert.match(database, /^hs_staff_test_[a-f0-9]{32}$/);
  await admin.query(`CREATE DATABASE "${database}"`);
  const pool = new Pool({ host: "127.0.0.1", port: 56439, user: "runner", database, max: 6 });
  const db = await pool.connect();
  try {
    await db.query(`CREATE SCHEMA auth; CREATE SCHEMA hs_parent_security;
      DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['anon','authenticated','service_role','supabase_auth_admin'] LOOP
        IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=n) THEN EXECUTE format('CREATE ROLE %I',n); END IF;
      END LOOP; END $$;
      CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,
        raw_app_meta_data jsonb,raw_user_meta_data jsonb DEFAULT '{}');
      CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id),not_after timestamptz);
      CREATE TABLE hs_parent_security.accounts(auth_id uuid PRIMARY KEY,parent_email text);
      CREATE TABLE public.users(id varchar PRIMARY KEY,email text UNIQUE,first_name text,last_name text,role text DEFAULT 'free_tier');
      CREATE TABLE public.teams(id varchar PRIMARY KEY,name text NOT NULL);
      CREATE TABLE public.team_memberships(id varchar PRIMARY KEY DEFAULT gen_random_uuid(),user_id varchar NOT NULL REFERENCES public.users(id),
        team_id varchar REFERENCES public.teams(id),status text DEFAULT 'pending',is_captain boolean DEFAULT false);
      CREATE TABLE public.league_memberships(user_id varchar,league_id varchar,status text);
      CREATE TABLE public.payment_requests(id varchar PRIMARY KEY,creator_id varchar REFERENCES public.users(id),title text,amount_per_person numeric(10,2),created_at timestamptz DEFAULT now());
      CREATE TABLE public.payment_request_recipients(id varchar PRIMARY KEY,payment_request_id varchar REFERENCES public.payment_requests(id),user_id varchar REFERENCES public.users(id),
        is_paid boolean DEFAULT false,is_confirmed boolean DEFAULT false,confirmed_at timestamptz,updated_at timestamptz DEFAULT now());`);
    await db.query(await readFile("scripts/dev-only/high-school-onboarding.sql", "utf8"));
    await db.query(await readFile("scripts/dev-only/high-school-youth-onboarding.sql", "utf8"));
    await db.query("SELECT set_config('roster.hs_skin_dev','phase1',false)");
    await db.query(await readFile("scripts/dev-only/high-school-team-skins.sql", "utf8"));
    await db.query("SELECT set_config('roster.hs_staff_dev','phase2',false)");
    await db.query(await readFile("scripts/dev-only/high-school-staff-operations.sql", "utf8"));
    // Repeat installation must preserve existing data and constraints.
    await db.query(await readFile("scripts/dev-only/high-school-staff-operations.sql", "utf8"));
  } finally { db.release(); }
  const ids = Object.fromEntries(["league", "program", "foreignProgram", "varsity", "jv", "foreign", "child1", "child2", "child3", "req1", "req2", "req3"].map(k => [k, randomUUID()]));
  const actors: Record<string, OnboardingActor> = {};
  for (const name of ["head", "assistant", "manager", "ad", "parent", "otherParent", "pending", "revoked", "outsider", "applicant", "league"]) {
    const authId = randomUUID(), sessionId = randomUUID();
    actors[name] = { authId, sessionId, email: `${name}@example.com`, fixture: true, emailVerified: true };
    await pool.query("INSERT INTO auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) VALUES($1,$2,now(),$3,$4)",
      [authId, `${name}@example.com`, { synthetic_high_school_onboarding_dev: true }, { first_name: name, last_name: "Fixture" }]);
    await pool.query("INSERT INTO auth.sessions VALUES($1,$2,NULL)", [sessionId, authId]);
    await pool.query("INSERT INTO public.users(id,email,first_name,last_name,role) VALUES($1,$2,$3,'Fixture',$4)",
      [authId, `${name}@example.com`, name, name === "pending" ? "commissioner" : "free_tier"]);
    await pool.query("INSERT INTO hs_onboarding.flows(auth_id,path,block_legacy) VALUES($1,$2,true)", [authId, /Parent|parent/.test(name) ? "parent" : "staff"]);
  }
  await pool.query("INSERT INTO hs_onboarding.leagues VALUES($1,'Fixture League')", [ids.league]);
  for (const key of ["program", "foreignProgram"]) await pool.query(`INSERT INTO hs_onboarding.programs(id,league_id,name,town,status,requested_by)
    VALUES($1,$2,$3,'Fixture Town','approved',$4)`, [ids[key], ids.league, key, actors.ad.authId]);
  for (const [key, program] of [["varsity", "program"], ["jv", "program"], ["foreign", "foreignProgram"]]) {
    await pool.query("INSERT INTO hs_onboarding.teams VALUES($1,$2,$3,$4)", [ids[key], ids[program], key, `code-${key}`]);
    await pool.query("INSERT INTO public.teams(id,name,program_type,program_id) VALUES($1,$2,'high_school',$3)", [ids[key], key, ids[program]]);
  }
  for (const [name, role, team, status] of [
    ["head", "head_coach", "varsity", "approved"], ["assistant", "assistant_coach", "varsity", "approved"],
    ["manager", "team_manager", "varsity", "approved"], ["ad", "athletic_director", "varsity", "approved"],
    ["parent", "parent", "varsity", "approved"], ["otherParent", "parent", "jv", "approved"],
    ["pending", "head_coach", "varsity", "pending"], ["revoked", "head_coach", "varsity", "pending"],
    ["outsider", "athletic_director", "foreign", "approved"],
  ]) {
    await pool.query("INSERT INTO public.team_memberships(user_id,team_id,role,status) VALUES($1,$2,$3,$4)",
      [actors[name].authId, ids[team], role, status]);
  }
  // A stale APPROVED source request must NEVER grant pending canonical access.
  await pool.query(`INSERT INTO hs_onboarding.staff_requests(id,auth_id,program_id,team_id,role,status)
    VALUES($1,$2,$3,$4,'head_coach','approved')`, [randomUUID(), actors.pending.authId, ids.program, ids.varsity]);
  for (const [child, parent, team, req, consent] of [
    ["child1", "parent", "varsity", "req1", HS_CONSENT_VERSION], ["child2", "otherParent", "jv", "req2", HS_CONSENT_VERSION],
    ["child3", "parent", "varsity", "req3", "expired-consent"],
  ]) {
    const details = { firstName: child, lastName: "Synthetic", gradYear: 2027, position: "F", jerseyNumber: "12" };
    await pool.query("INSERT INTO hs_parent_security.accounts VALUES($1,$2) ON CONFLICT DO NOTHING", [actors[parent].authId, actors[parent].email]);
    await pool.query(`INSERT INTO hs_onboarding.player_requests(id,auth_id,team_id,player_key,details,consent_version,status)
      VALUES($1,$2,$3,$4,$5,$6,'approved')`, [ids[req], actors[parent].authId, ids[team], randomUUID(), details, consent]);
    await pool.query(`INSERT INTO hs_onboarding.children(id,parent_auth_id,player_request_id,first_name,last_name)
      VALUES($1,$2,$3,$4,'Synthetic')`, [ids[child], actors[parent].authId, ids[req], child]);
    await pool.query("INSERT INTO public.team_memberships(user_id,child_profile_id,team_id,role,status) VALUES(NULL,$1,$2,'player','approved')",
      [ids[child], ids[team]]);
  }
  await pool.query("INSERT INTO public.league_memberships VALUES($1,$2,'approved'),($3,$2,'approved')",
    [actors.head.authId, ids.league, actors.parent.authId]);
  await pool.query("INSERT INTO hs_onboarding.league_approvers VALUES($1,$2)", [ids.league, actors.league.authId]);
  let paymentsAllowed = false;
  const staff = new HighSchoolStaffOperations(pool, async () => paymentsAllowed);
  const events = new HighSchoolStaffEvents(pool, undefined, dispatch);
  const chat = new HighSchoolStaffChat(pool);
  const close = async () => {
    await pool.end();
    await admin.query(`DROP DATABASE "${database}"`);
    await admin.end();
  };
  return { pool, ids, actors, staff, events, chat, close, setPaymentsAllowed(value: boolean) { paymentsAllowed = value; } };
}

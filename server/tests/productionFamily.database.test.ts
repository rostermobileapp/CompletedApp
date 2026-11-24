import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { HighSchoolParentSecurity, parentDigest } from "../highSchoolParentSecurity";
import { HighSchoolFamilySetup, HighSchoolFamilyReview } from "../highSchoolFamilySetup";
import { productionFamilyInstalled } from "../productionFamilyRuntime";
import { HS_CONSENT_VERSION } from "../../shared/highSchoolOnboarding";

test("the production package preserves adults, stages email enrollment and closes direct data access", async t => {
  const database = `family_live_test_${randomUUID().replace(/-/g, "")}`;
  assert.match(database, /^family_live_test_[a-f0-9]{32}$/);
  const admin = new Pool({ host: "127.0.0.1", port: 56439, user: "runner", database: "postgres" });
  await admin.query(`CREATE DATABASE "${database}"`);
  const pool = new Pool({ host: "127.0.0.1", port: 56439, user: "runner", database });
  const actor = { authId: randomUUID(), sessionId: randomUUID(), email: "parent@example.com", emailVerified: true, fixture: false };
  const ordinary = randomUUID(), originalTeam = randomUUID(), originalMembership = randomUUID(),
    head = { ...actor, authId: randomUUID(), sessionId: randomUUID(), email: "coach@example.com" };
  let code = "";
  const parent = new HighSchoolParentSecurity(pool, async mail => { code = mail.code; }, true);
  const family = new HighSchoolFamilySetup(pool, parent, undefined, true);
  try {
    await pool.query(`DO $$ DECLARE r text; BEGIN FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role','supabase_auth_admin','authenticator'] LOOP
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('CREATE ROLE %I',r); END IF; END LOOP; END $$;
      CREATE SCHEMA auth; CREATE SCHEMA storage;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
      GRANT USAGE ON SCHEMA auth,storage TO anon,authenticated,service_role;
      CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,encrypted_password text,
        email_change text,phone text,phone_change text,deleted_at timestamptz,recovery_token text,updated_at timestamptz,
        raw_app_meta_data jsonb DEFAULT '{}');
      CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,not_after timestamptz);
      CREATE TABLE auth.refresh_tokens(user_id text);
      CREATE TABLE auth.identities(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
        provider_id text,provider text,identity_data jsonb,last_sign_in_at timestamptz,updated_at timestamptz);
      CREATE TABLE auth.mfa_factors(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,status text,
        secret text,last_challenged_at timestamptz,updated_at timestamptz);
      CREATE TABLE public.users(id varchar PRIMARY KEY,email text,date_of_birth varchar,onboarding_completed boolean DEFAULT false);
      CREATE TABLE public.teams(id varchar PRIMARY KEY,name text NOT NULL);
      CREATE TABLE public.team_memberships(id varchar PRIMARY KEY,user_id varchar NOT NULL REFERENCES public.users(id),
        team_id varchar REFERENCES public.teams(id),status text,is_captain boolean);
      CREATE TABLE storage.objects(id uuid PRIMARY KEY,value text);
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      CREATE POLICY original_storage ON storage.objects TO authenticated USING(true) WITH CHECK(true);
      GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated,service_role;
      DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['users','teams','team_memberships'] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
        EXECUTE format('CREATE POLICY original_access ON public.%I TO anon,authenticated,service_role USING(true) WITH CHECK(true)',t);
        EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO anon,authenticated,service_role',t);
      END LOOP; END $$;`);
    const originalPassword = await bcrypt.hash("OriginalFamily1!password", 4);
    for (const person of [actor, head, { ...actor, authId: ordinary, sessionId: randomUUID(), email: "ordinary@example.com" }]) {
      await pool.query("INSERT INTO auth.users(id,email,email_confirmed_at,encrypted_password) VALUES($1,$2,now(),$3)", [person.authId, person.email, originalPassword]);
      await pool.query("INSERT INTO auth.sessions VALUES($1,$2,NULL)", [person.sessionId, person.authId]);
      await pool.query("INSERT INTO public.users(id,email,date_of_birth) VALUES($1,$2,'1990-01-01')", [person.authId, person.email]);
    }
    const before = (await pool.query("SELECT * FROM public.users ORDER BY id")).rows;
    await pool.query("INSERT INTO public.teams VALUES($1,'Existing adult team')", [originalTeam]);
    await pool.query("INSERT INTO public.team_memberships VALUES($1,$2,$3,'approved',true)", [originalMembership, actor.authId, originalTeam]);
    const originalTeamRow = (await pool.query("SELECT * FROM public.teams WHERE id=$1", [originalTeam])).rows;
    const originalMembershipRow = (await pool.query("SELECT * FROM public.team_memberships WHERE id=$1", [originalMembership])).rows;
    const sql = await readFile("scripts/production/high-school-family.sql", "utf8");
    const guards = await readFile("scripts/sql/family-account-guards.sql", "utf8");
    const manifest = createHash("sha256").update(sql).update(guards).digest("hex");
    const db = await pool.connect();
    try {
      await db.query("SELECT set_config('roster.family_production','approved-rollout',false)");
      const installation = sql.replace("-- ACCOUNT_GUARDS", guards)
        .replace("-- LIVE_MANIFEST", `INSERT INTO hs_parent_security.live_version VALUES(1,'${manifest}');`);
      await db.query("CREATE TABLE public.unsafe_test_table(id int)");
      await assert.rejects(() => db.query(installation));
      await db.query("ROLLBACK");
      assert.equal((await db.query("SELECT to_regnamespace('hs_parent_security') AS schema")).rows[0].schema, null);
      assert.equal((await db.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND table_name='teams' AND column_name='program_type'")).rows[0].n, 0);
      await db.query("DROP TABLE public.unsafe_test_table");
      await db.query(installation);
      assert.equal(await productionFamilyInstalled(db), true);
      await db.query("COMMIT");
    } catch (e) { await db.query("ROLLBACK"); throw e; } finally { db.release(); }
    assert.deepEqual((await pool.query("SELECT * FROM public.users ORDER BY id")).rows, before);
    assert.deepEqual((await pool.query("SELECT id,name FROM public.teams WHERE id=$1", [originalTeam])).rows, originalTeamRow);
    assert.deepEqual((await pool.query("SELECT id,user_id,team_id,status,is_captain FROM public.team_memberships WHERE id=$1", [originalMembership])).rows, originalMembershipRow);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM hs_parent_security.accounts")).rows[0].n, 0);
    let grant = "";
    await t.test("real-account composition stages protection until a delivered code is verified", async () => {
      await family.begin(actor);
      assert.equal(await parent.enrolled(actor.authId), false);
      assert.equal((await family.state(actor)).verified, false);
      await pool.query("UPDATE auth.users SET recovery_token='pending-recovery' WHERE id=$1", [actor.authId]);
      const challenge = await parent.challenge(actor, "parent_action");
      grant = (await parent.verify(actor, challenge.challengeId, code)).verificationToken;
      assert.equal(await parent.enrolled(actor.authId), true);
      assert.equal((await family.state(actor, grant)).verified, true);
    });
    await t.test("failed mail never activates protection or changes the ordinary adult's password", async () => {
      await family.begin(head);
      const failed = new HighSchoolParentSecurity(pool, async () => { throw new Error("private unavailable transport"); }, true);
      await assert.rejects(() => failed.challenge(head, "parent_action"), (e: any) => e.code === "PARENT_EMAIL_DELIVERY_UNAVAILABLE");
      assert.equal(await parent.enrolled(head.authId), false);
      assert.equal((await pool.query("SELECT encrypted_password FROM auth.users WHERE id=$1", [head.authId])).rows[0].encrypted_password, originalPassword);
      await pool.query("UPDATE auth.users SET recovery_token='ordinary-head-recovery' WHERE id=$1", [head.authId]);
    });
    await t.test("recovery remains possible while unapproved password and email mutations stay blocked", async () => {
      await pool.query("UPDATE auth.users SET recovery_token='email-owned-recovery' WHERE id=$1", [actor.authId]);
      await assert.rejects(() => pool.query("UPDATE auth.users SET encrypted_password='unapproved' WHERE id=$1", [actor.authId]), (e: any) => e.code === "42501");
      await assert.rejects(() => pool.query("UPDATE auth.users SET email='replacement@example.com' WHERE id=$1", [actor.authId]), (e: any) => e.code === "42501");
      await pool.query("UPDATE auth.users SET recovery_token='ordinary-change' WHERE id=$1", [ordinary]);
    });
    await t.test("RLS, RPC pre-request and Storage reject enrolled shared-login data access, not ordinary adults", async () => {
      const client = await pool.connect();
      try {
        await client.query("SET ROLE authenticated");
        await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [ordinary]);
        assert.equal((await client.query("SELECT id FROM public.users")).rows.length, 3);
        await client.query("SELECT public.roster_family_api_guard()");
        await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [actor.authId]);
        assert.equal((await client.query("SELECT id FROM public.users")).rows.length, 0);
        await assert.rejects(() => client.query("SELECT public.roster_family_api_guard()"), (e: any) => e.code === "42501");
        await assert.rejects(() => client.query("SELECT * FROM hs_parent_security.accounts"), (e: any) => e.code === "42501");
        await assert.rejects(() => client.query("INSERT INTO storage.objects VALUES($1,'blocked')", [randomUUID()]), (e: any) => e.code === "42501");
      } finally { await client.query("RESET ROLE"); client.release(); }
    });
    await t.test("existing-provider profile refresh and MFA verification preserve immutable login authority", async () => {
      const identity = randomUUID(), factor = randomUUID();
      // Administrative fixture setup happens before enrollment for a separate
      // ordinary identity, then points its account at the protected test user.
      await pool.query("INSERT INTO auth.identities VALUES($1,$2,'stable-subject','google',$3,NULL,NULL)",
        [identity, ordinary, { sub: "stable-subject", email: actor.email, name: "Original" }]);
      await pool.query("INSERT INTO auth.mfa_factors VALUES($1,$2,'verified','private-test-factor',NULL,NULL)", [factor, ordinary]);
      // Simulate factors that predate activation without relaxing the guards.
      await pool.query("UPDATE hs_parent_security.accounts SET activated_at=NULL WHERE auth_id=$1", [actor.authId]);
      await pool.query("UPDATE auth.identities SET user_id=$2 WHERE id=$1", [identity, actor.authId]);
      await pool.query("UPDATE auth.mfa_factors SET user_id=$2 WHERE id=$1", [factor, actor.authId]);
      await pool.query("UPDATE hs_parent_security.accounts SET activated_at=now() WHERE auth_id=$1", [actor.authId]);
      await pool.query("UPDATE auth.identities SET identity_data=identity_data||'{\"name\":\"Updated\"}',last_sign_in_at=now() WHERE id=$1", [identity]);
      await pool.query("UPDATE auth.mfa_factors SET last_challenged_at=now(),updated_at=now() WHERE id=$1", [factor]);
      await assert.rejects(() => pool.query("UPDATE auth.identities SET provider_id='different' WHERE id=$1", [identity]), (e: any) => e.code === "42501");
      await assert.rejects(() => pool.query("UPDATE auth.mfa_factors SET secret='different' WHERE id=$1", [factor]), (e: any) => e.code === "42501");
    });
    await t.test("consent and canonical review create only disabled children for real-account mode", async () => {
      const league = randomUUID(), program = randomUUID(), team = randomUUID();
      await pool.query("INSERT INTO hs_onboarding.leagues VALUES($1,'Owned test league')", [league]);
      await pool.query("INSERT INTO hs_onboarding.programs VALUES($1,$2,'School','Town','approved',$3,$3)", [program, league, head.authId]);
      await pool.query("INSERT INTO hs_onboarding.teams VALUES($1,$2,'Varsity',$3)", [team, program, parentDigest("SAFE1234")]);
      await pool.query("INSERT INTO public.teams VALUES($1,'Varsity','high_school',$2)", [team, program]);
      await pool.query("INSERT INTO public.team_memberships VALUES($1,$2,$3,'approved',false,'head_coach',NULL)", [randomUUID(), head.authId, team]);
      const player = { id: randomUUID(), firstName: "Child", lastName: "Synthetic", gradYear: 2030, position: "D",
        jerseyNumber: "", consent: true, consentVersion: HS_CONSENT_VERSION, photoConsent: false, publicNameConsent: false };
      await family.draft(actor, { revision: 0, players: [player] }, grant);
      await family.consent(actor, { revision: 1, players: [player], guardianConfirmed: true }, grant);
      await family.intake.join(actor, { revision: 2, teamCode: "SAFE1234" }, grant);
      const state = await family.state(actor, grant);
      const review = new HighSchoolFamilyReview(pool, undefined, undefined, true);
      assert.deepEqual((await review.teams(head)).teams, [{ id: team, name: "Varsity" }]);
      assert.deepEqual((await review.teams(actor)).teams, []);
      await review.decide(head, team, state.requests[0].id, { approve: true });
      assert.equal((await family.state(actor, grant)).requests[0].deviceActivation, "disabled");
      assert.deepEqual((await family.adultTeamIds(actor)).teamIds, [originalTeam]);
      const adultTeam = randomUUID();
      await pool.query("INSERT INTO public.teams(id,name) VALUES($1,'Original adult team')", [adultTeam]);
      await pool.query("INSERT INTO public.team_memberships(id,user_id,team_id,status,is_captain) VALUES($1,$2,$3,'approved',true)",
        [randomUUID(), actor.authId, adultTeam]);
      assert.deepEqual((await family.adultTeamIds(actor)).teamIds.sort(), [originalTeam, adultTeam].sort());
      await assert.rejects(() => pool.query("UPDATE hs_onboarding.children SET enabled=true"), (e: any) => e.code === "23514");
    });
    await t.test("protected password recovery consumes email approval and revokes every session", async () => {
      await pool.query("UPDATE hs_parent_security.challenges SET created_at=now()-interval '2 minutes' WHERE auth_id=$1", [actor.authId]);
      const challenge = await parent.challenge(actor, "password_change");
      const approved = await parent.verify(actor, challenge.challengeId, code);
      await parent.changePassword(actor, approved.verificationToken, "RecoveredFamily2!password");
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM auth.sessions WHERE user_id=$1", [actor.authId])).rows[0].n, 0);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM hs_parent_security.writes")).rows[0].n, 0);
      await pool.query("DELETE FROM auth.users WHERE id=$1", [actor.authId]);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM hs_onboarding.children")).rows[0].n, 0);
    });
  } finally {
    await pool.end();
    await admin.query(`DROP DATABASE "${database}"`);
    await admin.end();
  }
});

/**
 * Requires a disposable local postgres cluster created with initdb -U award_test.
 * NEVER imports app db.ts, dotenv, or any workspace database environment variable.
 * Run: npx tsx --test server/tests/teamAwards.database.test.ts
 * All connections explicitly target 127.0.0.1:55442 as award_test.
 */
import test from "node:test";
import assert from "node:assert/strict";
import postgres from "postgres";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { TEAM_AWARD_LIMITS } from "../../shared/teamAwards";
import { deliverTeamAwardPushBatch } from "../teamAwardPushDelivery";

const options = { host:"127.0.0.1",port:55442,username:"award_test",password:"",ssl:false as const,max:10 };
const admin = postgres({ ...options,database:"postgres" });
const dbName = `team_awards_test_${randomUUID().replaceAll("-","")}`;
const captain="00000000-0000-4000-8000-000000000001";
const player="00000000-0000-4000-8000-000000000002";
const stranger="00000000-0000-4000-8000-000000000003";
test("team awards isolated database behavior", async t => {
  const [who] = await admin`SELECT current_user AS name`;
  assert.equal(who.name,"award_test","Refusing to use a non-fixture PostgreSQL role");
  await admin.unsafe(`CREATE DATABASE ${dbName}`);
  const db = postgres({ ...options,database:dbName });
  async function actor<T>(user: string, work: (sql: any) => Promise<T>): Promise<T> {
    return db.begin(async tx => {
      await tx.unsafe("SET LOCAL ROLE authenticated");
      await tx`SELECT set_config('request.jwt.claims',${JSON.stringify({sub:user})},true)`;
      return work(tx);
    }) as Promise<T>;
  }
  const save = (user: string, team="team-a",name="Team spark") => actor(user,async tx => {
    const [r] = await tx`SELECT team_award_save(${team},${name},'Description','week','star') AS id`; return r.id as string;
  });
  try {
    await db.unsafe(`
      DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
      GRANT USAGE ON SCHEMA auth TO authenticated,anon,service_role;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon,service_role;
      CREATE TABLE users(id varchar PRIMARY KEY,first_name text,last_name text,deleted_at timestamp);
      CREATE TABLE leagues(id varchar PRIMARY KEY,timezone text);
      CREATE TABLE seasons(id varchar PRIMARY KEY,league_id varchar,start_date timestamp,end_date timestamp);
      CREATE TABLE teams(id varchar PRIMARY KEY,name text,captain_id varchar,league_id varchar,season_id varchar);
      CREATE TABLE team_memberships(id varchar PRIMARY KEY,team_id varchar,user_id varchar,status text,is_captain boolean);
      CREATE TABLE league_memberships(id varchar PRIMARY KEY,assigned_team_id varchar,user_id varchar,status text);
      CREATE TABLE games(id varchar PRIMARY KEY,home_team_id varchar,away_team_id varchar,league_id varchar,season_id varchar,scheduled_at timestamp,is_scrimmage boolean DEFAULT false);
      INSERT INTO users VALUES('${captain}','Captain','One',null),('${player}','Player','Two',null),('${stranger}','Other','Team',null);
      INSERT INTO leagues VALUES('league-a','America/New_York');
      INSERT INTO teams VALUES('team-a','Ice Owls','${captain}','league-a',null),('team-b','Other Owls','${stranger}','league-a',null);
      INSERT INTO team_memberships VALUES('m1','team-a','${captain}','approved',true),('m2','team-a','${player}','approved',false),('m3','team-b','${stranger}','approved',true);
    `);
    const migrationConnection = await db.reserve();
    try { await migrationConnection.unsafe(await readFile("migrations/0044_custom_team_awards.sql","utf8")); }
    catch(e) { await migrationConnection.unsafe("ROLLBACK"); throw e; }
    finally { migrationConnection.release(); }
    // Minimal Supabase Storage fixture, to test the real object policies too.
    await db.unsafe(`
      CREATE SCHEMA storage;
      CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text);
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA storage TO authenticated,anon;
      GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated,anon;
    `);
    const storageConnection = await db.reserve();
    try { await storageConnection.unsafe(await readFile("migrations/0044_custom_team_award_storage.sql","utf8")); }
    catch(e) { await storageConnection.unsafe("ROLLBACK"); throw e; }
    finally { storageConnection.release(); }
    await t.test("feature flag denies RPC changes while disabled",async () => {
      await assert.rejects(save(captain),/not enabled/);
      await db`UPDATE team_award_config SET enabled=true`;
      const [c] = await db`SELECT * FROM team_award_config`;
      assert.equal(c.active_limit,TEAM_AWARD_LIMITS.active);
      assert.equal(c.removal_limit,TEAM_AWARD_LIMITS.removalsPerMonth);
    });
    const award = await save(captain);
    let originalRecognition: any, firstReassignment: any;
    await t.test("members read their team only; anonymous and noncaptain writes denied",async () => {
      await assert.rejects(save(player),/authorized/);
      await assert.rejects(save(stranger),/authorized/);
      const list:any = await actor(player,async tx => (await tx`SELECT team_award_list('team-a') AS data`)[0].data);
      assert.equal(list.awards[0].id,award); assert.equal(list.canManage,false);
      const rows = await actor(stranger,tx => tx`SELECT * FROM team_awards`);
      assert.equal((rows as any[]).length,0);
      await assert.rejects(actor(stranger,tx => tx`SELECT team_award_list('team-a')`),/authorized/);
      await assert.rejects(actor(player,tx => tx`INSERT INTO award_grants(award_id,player_id,period_key) VALUES(${award},${player},'bogus')`),/permission denied/);
      await assert.rejects(db.begin(async tx => { await tx.unsafe("SET LOCAL ROLE anon"); return tx`SELECT team_award_list('team-a')`; }),/permission denied/);
    });
    await t.test("five active awards enforced under concurrent creation",async () => {
      const results = await Promise.allSettled(Array.from({length:8},(_,i) => save(captain,"team-a",`Award ${i}`)));
      assert.equal(results.filter(r => r.status==="fulfilled").length,4);
      const [r] = await db`SELECT count(*)::int AS n FROM team_awards WHERE NOT archived`;
      assert.equal(r.n,5);
    });
    await t.test("authoritative weekly/monthly windows handle DST and ISO year boundaries",async () => {
      const [r] = await db`SELECT team_award_window('team-a','week','2027-01-04T05:00:00Z') AS w,
        team_award_window('team-a','month','2026-11-01T04:00:00Z') AS m,
        team_award_window('team-a','week','2026-03-09T04:00:00Z') AS dst`;
      assert.equal(r.w.periodKey,"2026-W53");
      assert.equal(r.m.periodKey,"2026-10");
      assert.equal(new Date(r.dst.opensAt).toISOString(),"2026-03-09T04:00:00.000Z");
      assert.equal(new Date(r.dst.closesAt).toISOString(),"2026-03-16T04:00:00.000Z");
      await actor(captain,tx => tx`SELECT team_award_set_timezone('team-a','America/Los_Angeles')`);
      const [pacific] = await db`SELECT team_award_window('team-a','month','2026-11-01T06:59:59Z') AS w`;
      assert.equal(pacific.w.periodKey,"2026-09");
      await assert.rejects(actor(captain,tx => tx`SELECT team_award_set_timezone('team-a','Invalid/Zone')`),/valid IANA/);
      await actor(captain,tx => tx`SELECT team_award_set_timezone('team-a','America/New_York')`);
    });
    await t.test("per-game starts at +30m, next opening closes previous, no next expires at 14 days",async () => {
      await db`INSERT INTO games(id,home_team_id,league_id,scheduled_at) VALUES
        ('g1','team-a','league-a','2026-11-01 01:30'),('g2','team-a','league-a','2026-11-08 12:00')`;
      const [r] = await db`SELECT team_award_window('team-a','game','2026-11-01T06:59:59Z') AS before,
        team_award_window('team-a','game','2026-11-01T07:00:00Z') AS opened,
        team_award_window('team-a','game','2026-11-08T17:30:00Z') AS next,
        team_award_window('team-a','game','2026-11-22T17:30:00Z') AS expired`;
      assert.equal(r.before.periodKey,null); assert.equal(r.opened.periodKey,"g1");
      assert.equal(new Date(r.opened.closesAt).toISOString(),"2026-11-08T17:30:00.000Z");
      assert.equal(r.next.periodKey,"g2"); assert.equal(r.expired.periodKey,null);
    });
    await t.test("season explicit end date overrides schedule; scrimmages do not delay regular-season fallback",async () => {
      await db`INSERT INTO seasons VALUES('s1','league-a','2026-01-01','2026-04-30'),('s2','league-a','2026-05-01',null)`;
      await db`INSERT INTO games(id,home_team_id,league_id,season_id,scheduled_at,is_scrimmage) VALUES
        ('s2g1','team-a','league-a','s2','2026-08-31 19:00',false),('s2scrim','team-a','league-a','s2','2026-09-12 19:00',true)`;
      const [r] = await db`SELECT team_award_window('team-a','season','2026-05-01T04:00:00Z') AS explicit,
        team_award_window('team-a','season','2026-08-31T23:00:00Z') AS fallback`;
      assert.equal(r.explicit.periodKey,"s1"); assert.equal(r.fallback.periodKey,"s2");
    });
    await t.test("duplicate grants, stale period, nonroster and cross-team recipients cannot slip through",async () => {
      const [w] = await db`SELECT team_award_window('team-a','week')->>'periodKey' AS key`;
      const grant=() => actor(captain,tx => tx`SELECT team_award_grant('team-a',${award},${player},${w.key}) AS g`);
      const results = await Promise.allSettled([grant(),grant(),grant()]);
      assert.equal(results.filter(r => r.status==="fulfilled").length,1);
      [originalRecognition] = await db`SELECT * FROM award_grant_events WHERE award_id=${award}`;
      await assert.rejects(grant(),/Already awarded/);
      await assert.rejects(actor(captain,tx => tx`SELECT team_award_grant('team-a',${award},${stranger},${w.key},true)`),/active roster/);
      await assert.rejects(actor(captain,tx => tx`SELECT team_award_grant('team-a',${award},${player},'stale',true)`),/window/);
      const [pushes] = await db`SELECT count(*)::int AS n FROM team_award_pushes`; assert.equal(pushes.n,1);
      await actor(captain,tx => tx`SELECT team_award_grant('team-a',${award},${player},${w.key},true)`);
      const [noDuplicate] = await db`SELECT count(*)::int AS n FROM team_award_pushes`; assert.equal(noDuplicate.n,1);
      const [noDuplicateEvent] = await db`SELECT count(*)::int AS n FROM award_grant_events WHERE award_id=${award}`;
      assert.equal(noDuplicateEvent.n,1,"A no-op reassignment does not add a historical event");
      await actor(captain,tx => tx`SELECT team_award_grant('team-a',${award},${captain},${w.key},true)`);
      [firstReassignment] = await db`SELECT * FROM award_grant_events WHERE award_id=${award} AND id<>${originalRecognition.id}`;
      assert.equal(firstReassignment.player_id,captain);
      assert.equal(originalRecognition.player_id,player);
      assert.equal(firstReassignment.granted_by,captain);
      assert.equal(originalRecognition.granted_by,captain);
      assert.ok(firstReassignment.granted_at.getTime()>=originalRecognition.granted_at.getTime());
      assert.notEqual(firstReassignment.id,originalRecognition.id);
      const ownHistory=await actor(player,tx=>tx`SELECT * FROM award_grant_events`);
      assert.equal((ownHistory as any[]).length,2);
      assert.equal((await actor(stranger,tx=>tx`SELECT * FROM award_grant_events`) as any[]).length,0);
      await assert.rejects(actor(captain,tx=>tx`UPDATE award_grant_events SET player_id=${captain}`),/permission denied/);
      await assert.rejects(actor(captain,tx=>tx`DELETE FROM award_grant_events`),/permission denied/);
      const [grants] = await db`SELECT count(*)::int AS n FROM award_grants WHERE award_id=${award}`; assert.equal(grants.n,1);
      const [changed] = await db`SELECT count(*)::int AS n FROM team_award_pushes`; assert.equal(changed.n,2);
      const sent: string[] = [];
      const query = { query: async (text:string,values:any[]=[]) => {
        const rows=await db.unsafe(text,values); return { rows, rowCount:rows.count };
      }};
      await deliverTeamAwardPushBatch(query,async p => { sent.push(p.idempotencyKey); assert.equal(p.userId,captain); return true; });
      await deliverTeamAwardPushBatch(query,async p => { sent.push(p.idempotencyKey); return true; });
      assert.equal(sent.length,1,"Only current revision is sent, never repeated after persistence");
      const reassignments=await Promise.allSettled([player,captain].map(p=>
        actor(captain,tx => tx`SELECT team_award_grant('team-a',${award},${p},${w.key},true)`)));
      assert.equal(reassignments.filter(r=>r.status==="fulfilled").length,2);
      const [single]=await db`SELECT count(*)::int AS n FROM award_grants WHERE award_id=${award}`;
      assert.equal(single.n,1,"Concurrent reassignments update the one period row");
      await actor(captain,tx => tx`SELECT team_award_grant('team-a',${award},${captain},${w.key},true)`);
    });
    await t.test("holder removal is unassigned even after rejoining; archive keeps history",async () => {
      await db`DELETE FROM team_memberships WHERE id='m1'`;
      let list:any = await actor(captain,async tx => (await tx`SELECT team_award_list('team-a') AS d`)[0].d);
      assert.equal(list.awards.find((a:any) => a.id===award).holder,null);
      await db`INSERT INTO team_memberships VALUES('m1','team-a',${captain},'approved',true)`;
      list=await actor(captain,async tx => (await tx`SELECT team_award_list('team-a') AS d`)[0].d);
      assert.equal(list.awards.find((a:any) => a.id===award).holder,null);
      await actor(captain,tx => tx`SELECT team_award_archive('team-a',${award})`);
      list=await actor(captain,async tx => (await tx`SELECT team_award_list('team-a') AS d`)[0].d);
      const archivedHistory=list.awards.find((a:any) => a.id===award).history;
      assert.ok(archivedHistory.length>=2);
      for (const event of [originalRecognition,firstReassignment]) {
        const visible=archivedHistory.find((e:any)=>e.id===event.id);
        assert.ok(visible,"Each original recognition event remains visible after roster removal, reassignment and archive");
        assert.equal(visible.playerId,event.player_id);
        assert.equal(visible.grantedById,event.granted_by);
        assert.equal(visible.grantedByName,"Captain One");
        assert.equal(new Date(visible.grantedAt).toISOString(),event.granted_at.toISOString());
      }
      assert.equal(list.awards.find((a:any) => a.id===award).archived,true);
      assert.equal((await save(captain)).length,36,"Archiving frees one active slot");
    });
    await t.test("private storage permits team reads and captain writes only to their award path",async () => {
      const [a] = await db`SELECT id FROM team_awards WHERE NOT archived LIMIT 1`;
      const path=`team-a/${a.id}.png`;
      await actor(captain,tx => tx`INSERT INTO storage.objects(bucket_id,name) VALUES('team-award-images',${path})`);
      assert.equal((await actor(player,tx => tx`SELECT * FROM storage.objects`) as any[]).length,1);
      assert.equal((await actor(stranger,tx => tx`SELECT * FROM storage.objects`) as any[]).length,0);
      await assert.rejects(actor(player,tx => tx`INSERT INTO storage.objects(bucket_id,name) VALUES('team-award-images',${path})`),/row-level security/);
      await assert.rejects(actor(captain,tx => tx`INSERT INTO storage.objects(bucket_id,name) VALUES('team-award-images','team-b/bogus.png')`),/row-level security/);
    });
    await t.test("recipient celebrations persist independently, skip history, and reject stale or foreign recognition",async () => {
      const [a]=await db`SELECT id FROM team_awards WHERE NOT archived LIMIT 1`;
      const [w]=await db`SELECT team_award_window('team-a','week')->>'periodKey' AS key`;
      const grant=(recipient:string)=>actor(captain,tx=>tx`SELECT team_award_grant('team-a',${a.id},${recipient},${w.key},true)`);
      await grant(player);
      const migration=await db.reserve();
      try { await migration.unsafe(await readFile("migrations/0045_team_award_celebrations.sql","utf8")); }
      catch(error) { await migration.unsafe("ROLLBACK");throw error; }
      finally { migration.release(); }
      const pending=(who:string):Promise<any[]>=>actor(who,async tx=>(await tx`SELECT team_award_pending_celebrations() AS events`)[0].events);
      assert.deepEqual(await pending(player),[],"Installing does not replay historical recognition");
      await grant(captain);
      let events=await pending(captain);
      assert.equal(events.length,1);
      assert.equal(events[0].awardId,a.id);
      assert.equal(events[0].teamName,"Ice Owls");
      assert.equal(events[0].grantedByName,"Captain One");
      assert.deepEqual(await pending(player),[]);
      assert.deepEqual(await pending(stranger),[]);
      await assert.rejects(actor(stranger,tx=>tx`SELECT team_award_acknowledge_celebration(${events[0].id})`),/not found/);
      await assert.rejects(actor(captain,tx=>tx`UPDATE award_grant_events SET celebration_acknowledged_at=now()`),/permission denied/);
      await assert.rejects(db.begin(async tx=>{
        await tx.unsafe("SET LOCAL ROLE anon");return tx`SELECT team_award_pending_celebrations()`;
      }),/permission denied/);
      await grant(captain);
      assert.equal((await pending(captain)).length,1,"No-op reassignment never repeats recognition");
      const eventId=events[0].id;
      const [pushBefore]=await db`SELECT count(*)::int AS n FROM team_award_pushes`;
      await actor(captain,tx=>tx`SELECT team_award_acknowledge_celebration(${eventId})`);
      await actor(captain,tx=>tx`SELECT team_award_acknowledge_celebration(${eventId})`);
      assert.deepEqual(await pending(captain),[],"Ack persists across fresh caller transactions and can be retried");
      const [pushAfter]=await db`SELECT count(*)::int AS n FROM team_award_pushes`;
      assert.equal(pushAfter.n,pushBefore.n,"Celebration acknowledgement never changes push delivery");
      await grant(player);
      assert.equal((await pending(player)).length,1);
      await grant(captain);
      assert.deepEqual(await pending(player),[],"A previous holder cannot celebrate a replaced grant");
      assert.equal((await pending(captain)).length,1);
      await db`UPDATE team_award_config SET enabled=false`;
      assert.deepEqual(await pending(captain),[]);
      await db`UPDATE team_award_config SET enabled=true`;
      await db`DELETE FROM team_memberships WHERE id='m1'`;
      assert.deepEqual(await pending(captain),[],"Roster removal cancels pending celebration eligibility");
      await db`INSERT INTO team_memberships VALUES('m1','team-a',${captain},'approved',true)`;
      assert.deepEqual(await pending(captain),[],"Rejoining does not restore invalidated recognition");
      await grant(player);
      assert.equal((await pending(player)).length,1);
      await actor(captain,tx=>tx`SELECT team_award_archive('team-a',${a.id})`);
      assert.deepEqual(await pending(player),[],"Archived awards never interrupt a recipient");
    });
    await t.test("background quota is atomic and restricted to service-only authorized reservations",async () => {
      const [a] = await db`SELECT id FROM team_awards WHERE NOT archived LIMIT 1`;
      await assert.rejects(actor(captain,tx => tx`SELECT team_award_reserve_removal('team-a',${a.id},${captain})`),/permission denied/);
      await assert.rejects(db`SELECT team_award_reserve_removal('team-a',${a.id},${stranger})`,/captain/);
      const results = await Promise.allSettled(Array.from({length:16},() =>
        db`SELECT team_award_reserve_removal('team-a',${a.id},${captain})`));
      assert.equal(results.filter(r => r.status==="fulfilled").length,10);
      const [usage] = await db`SELECT used FROM bg_removal_usage`; assert.equal(usage.used,10);
    });
  } finally {
    await db.end();
    await admin.unsafe(`DROP DATABASE ${dbName}`);
    await admin.end();
  }
});

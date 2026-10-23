import test from "node:test";
import assert from "node:assert/strict";
import { ensureTeamAwardDatabaseUpdates } from "../teamAwardDbInit";

function fixture({ base = true, recorded = false, fail = false } = {}) {
  const calls: { text: string; values?: any[] }[] = [];
  let released = 0;
  const client = {
    query: async (text: string, values?: any[]) => {
      calls.push({ text, values });
      if (text.includes("to_regclass")) return { rows: [{ ready: base }] };
      if (text.startsWith("SELECT 1 FROM public.team_award_schema_updates")) {
        return { rows: recorded ? [{ exists: 1 }] : [] };
      }
      if (fail && text.includes("ADD COLUMN")) throw Object.assign(new Error("fixture failure"), { code: "XX000" });
      return { rows: [] };
    },
    release: () => { released++; },
  };
  return { pool: { connect: async () => client }, calls, released: () => released };
}

test("startup skips missing original setup without enabling awards or creating tables",async () => {
  const f=fixture({base:false});
  assert.deepEqual(await ensureTeamAwardDatabaseUpdates(f.pool),{installed:false,applied:[]});
  assert.equal(f.calls.some(c=>c.text.includes("CREATE TABLE")),false);
  assert.equal(f.calls.at(-1)?.text,"COMMIT");
  assert.equal(f.released(),1);
});

test("already applied updates skip migration DDL but release their pinned connection",async () => {
  const f=fixture({recorded:true});
  assert.deepEqual(await ensureTeamAwardDatabaseUpdates(f.pool),{installed:true,applied:[]});
  assert.equal(f.calls.some(c=>c.text.includes("ADD COLUMN")),false);
  assert.equal(f.calls.filter(c=>c.text.includes("pg_advisory_xact_lock")).length,1);
  assert.equal(f.released(),1);
});

test("startup uses one outer transaction and only records a successfully applied update",async () => {
  const f=fixture();
  const result=await ensureTeamAwardDatabaseUpdates(f.pool);
  assert.deepEqual(result.applied,["team-award-celebrations"]);
  const migration=f.calls.find(c=>c.text.includes("ADD COLUMN"))!.text;
  assert.equal(/^BEGIN;\r?$/m.test(migration),false);
  assert.equal(/^COMMIT;\s*$/m.test(migration),false);
  const record=f.calls.findIndex(c=>c.text.startsWith("INSERT INTO public.team_award_schema_updates"));
  assert.ok(record>f.calls.findIndex(c=>c.text===migration));
  assert.equal(f.calls.at(-1)?.text,"COMMIT");
  assert.equal(f.released(),1);
});

test("failed schema changes roll back, do not mark applied, and remain retryable",async () => {
  const f=fixture({fail:true});
  await assert.rejects(ensureTeamAwardDatabaseUpdates(f.pool),/fixture failure/);
  assert.equal(f.calls.at(-1)?.text,"ROLLBACK");
  assert.equal(f.calls.some(c=>c.text.startsWith("INSERT INTO public.team_award_schema_updates")),false);
  assert.equal(f.released(),1);
  assert.deepEqual((await ensureTeamAwardDatabaseUpdates(fixture().pool)).applied,["team-award-celebrations"]);
});

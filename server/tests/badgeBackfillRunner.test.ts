import { test } from "node:test";
import assert from "node:assert/strict";
import { runBadgeBackfillJobs } from "../badgeBackfillRunner.js";

test("one failed historical badge backfill does not prevent later badges", async () => {
  const completed: string[] = [];
  const errors: string[] = [];
  await runBadgeBackfillJobs([
    { name: "broken history", run: async () => { throw new Error("missing user"); } },
    { name: "healthy history", run: async () => { completed.push("healthy history"); } },
  ], (name, error) => {
    errors.push(name);
    assert.match(String(error), /missing user/);
  });
  assert.deepEqual(errors, ["broken history"]);
  assert.deepEqual(completed, ["healthy history"]);
});
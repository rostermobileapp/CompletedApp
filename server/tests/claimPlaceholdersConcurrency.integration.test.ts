import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "../db";
import { storage } from "../storage";

test("concurrent placeholder claims create only one team and league membership", async () => {
  const run = randomUUID().replace(/-/g, "");
  const userId = `test_${run}_user`;
  const leagueId = `test_${run}_league`;
  const teamId = `test_${run}_team`;
  const placeholderId = `test_${run}_placeholder`;
  const email = `claim_${run}@example.com`;
  const q = (text: string, params: unknown[] = []) => pool.query(text, params);
  try {
    await q(
      "INSERT INTO users (id,email,first_name,last_name,role,onboarding_completed,last_updated,created_at,updated_at,fee_exempt) VALUES ($1,$2,'Test','Claim','free_tier',false,NOW(),NOW(),NOW(),false)",
      [userId, email],
    );
    await q(
      "INSERT INTO leagues (id,name,unique_league_id,sport,commissioner_id,is_active,playoff_started,sub_approval_workflow,created_at,updated_at) VALUES ($1,'Claim Test',$2,'hockey',$3,true,false,'captain_and_commissioner',NOW(),NOW())",
      [leagueId, `Z${run.slice(0, 5)}`.toUpperCase(), userId],
    );
    await q("INSERT INTO teams (id,name,league_id,created_at,updated_at) VALUES ($1,'Claim Test Team',$2,NOW(),NOW())", [teamId, leagueId]);
    await q(
      "INSERT INTO placeholder_players (id,team_id,league_id,first_name,last_name,email,created_at) VALUES ($1,$2,$3,'Test','Claim',$4,NOW())",
      [placeholderId, teamId, leagueId, email],
    );

    const results = await Promise.all(Array.from({ length: 8 }, () => storage.claimPlaceholdersForUser(userId)));
    assert.equal(results.reduce((sum, result) => sum + result.claimedCount, 0), 1);
    assert.equal((await q("SELECT count(*)::int AS count FROM team_memberships WHERE team_id=$1 AND user_id=$2", [teamId, userId])).rows[0].count, 1);
    assert.equal((await q("SELECT count(*)::int AS count FROM league_memberships WHERE league_id=$1 AND user_id=$2", [leagueId, userId])).rows[0].count, 1);
    assert.equal((await q("SELECT count(*)::int AS count FROM placeholder_players WHERE id=$1", [placeholderId])).rows[0].count, 0);
  } finally {
    await q("DELETE FROM team_memberships WHERE team_id=$1", [teamId]);
    await q("DELETE FROM league_memberships WHERE league_id=$1", [leagueId]);
    await q("DELETE FROM placeholder_players WHERE id=$1", [placeholderId]);
    await q("DELETE FROM teams WHERE id=$1", [teamId]);
    await q("DELETE FROM leagues WHERE id=$1", [leagueId]);
    await q("DELETE FROM users WHERE id=$1", [userId]);
  }
});
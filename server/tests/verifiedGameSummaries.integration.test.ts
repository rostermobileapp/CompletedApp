import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { storage } from "../storage.js";
import { getTeamStreaks } from "../teamStreaks.js";
import { currentCenturyClubYear, ensureDefaultBadges, getTrophyCase } from "../badges.js";

function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

test("standings, streaks, and Trophy Case summaries match raw reads and invalidate on corrections", async () => {
  const run = randomUUID().replace(/-/g, "");
  const userId = `summary_${run}_player`;
  const otherUserId = `summary_${run}_other`;
  const fixturePattern = `summary_${run}_%`;
  const leagueId = `summary_${run}_league`;
  const otherLeagueId = `summary_${run}_league2`;
  const seasonId = `summary_${run}_season`;
  const otherSeasonId = `summary_${run}_season2`;
  const teamIds = [`summary_${run}_team1`, `summary_${run}_team2`, `summary_${run}_team3`, `summary_${run}_team4`];
  const gameIds = [0, 1, 2].map(i => `summary_${run}_game${i}`);
  const gameYear = currentCenturyClubYear();
  const previousMode = process.env.GAME_SUMMARY_READ_MODE;
  const leagueShortId = `S${run.slice(0, 5)}`.toUpperCase();
  const otherLeagueShortId = `O${run.slice(5, 10)}`.toUpperCase();

  try {
    await ensureDefaultBadges();
    await db.execute(sql`
      INSERT INTO users (id, email, first_name, last_name, role, onboarding_completed)
      VALUES
        (${userId}, ${`${run}_player@example.test`}, 'Summary', 'Player', 'free_tier', true),
        (${otherUserId}, ${`${run}_other@example.test`}, 'Other', 'Player', 'free_tier', true)
    `);
    await db.execute(sql`
      INSERT INTO leagues (id, name, unique_league_id, sport, commissioner_id)
      VALUES
        (${leagueId}, 'Summary fixture', ${leagueShortId}, 'hockey', ${userId}),
        (${otherLeagueId}, 'Unrelated fixture', ${otherLeagueShortId}, 'hockey', ${otherUserId})
    `);
    await db.execute(sql`
      INSERT INTO seasons (id, name, league_id, is_active)
      VALUES
        (${seasonId}, 'Summary season', ${leagueId}, true),
        (${otherSeasonId}, 'Unrelated season', ${otherLeagueId}, true)
    `);
    await db.execute(sql`
      INSERT INTO teams (id, name, league_id, season_id)
      VALUES
        (${teamIds[0]}, 'Summary home', ${leagueId}, ${seasonId}),
        (${teamIds[1]}, 'Summary away', ${leagueId}, ${seasonId}),
        (${teamIds[2]}, 'Unrelated home', ${otherLeagueId}, ${otherSeasonId}),
        (${teamIds[3]}, 'Unrelated away', ${otherLeagueId}, ${otherSeasonId})
    `);
    await db.execute(sql`
      INSERT INTO team_memberships (user_id, team_id, position, status, joined_at)
      VALUES (${userId}, ${teamIds[0]}, 'Goalie', 'approved', NOW())
    `);
    await db.execute(sql`
      INSERT INTO league_memberships (user_id, league_id, assigned_team_id, status, is_goalie)
      VALUES (${userId}, ${leagueId}, ${teamIds[0]}, 'approved', true)
    `);

    for (const [index, gameId] of gameIds.entries()) {
      const scheduledAt = `${gameYear}-01-${String(10 + index).padStart(2, "0")} 19:00:00`;
      const homeScore = [3, 2, 4][index];
      const awayScore = [0, 1, 0][index];
      await db.execute(sql`
        INSERT INTO games (
          id, league_id, season_id, home_team_id, away_team_id,
          scheduled_at, home_score, away_score, is_completed, result_type
        ) VALUES (
          ${gameId}, ${leagueId}, ${seasonId}, ${teamIds[0]}, ${teamIds[1]},
          ${scheduledAt}::timestamp, ${homeScore}, ${awayScore}, true, 'regulation'
        )
      `);
      await db.execute(sql`
        INSERT INTO game_attendance (game_id, team_id, user_id)
        VALUES (${gameId}, ${teamIds[0]}, ${userId})
      `);
      const goalCount = homeScore;
      for (let goalNumber = 1; goalNumber <= goalCount; goalNumber++) {
        await db.execute(sql`
          INSERT INTO game_goals (
            game_id, team_id, scorer_id, goal_number, is_submitted
          ) VALUES (
            ${gameId}, ${teamIds[0]}, ${userId}, ${goalNumber}, true
          )
        `);
      }
    }
    await db.execute(sql`
      INSERT INTO game_goalies (game_id, team_id, goalie_user_id)
      VALUES (${gameIds[2]}, ${teamIds[0]}, ${userId})
    `);
    await db.execute(sql`
      INSERT INTO game_stars (
        game_id, first_star_user_id, second_star_user_id, third_star_user_id, awarded_by
      ) VALUES (${gameIds[0]}, ${userId}, ${userId}, ${userId}, ${userId})
    `);
    await db.execute(sql`
      INSERT INTO game_beer_counts (user_id, game_id, count)
      VALUES (${userId}, ${gameIds[0]}, 4)
    `);

    process.env.GAME_SUMMARY_READ_MODE = "off";
    const rawStandings = await storage.getLeagueStandings(leagueId, seasonId);
    const rawStreaks = await getTeamStreaks(teamIds[0], leagueId, seasonId);
    const rawTrophyCase = await getTrophyCase(userId, seasonId);
    assert.equal(rawStandings[0]?.teamId, teamIds[0]);
    assert.equal(rawStreaks[userId], "HOT");
    assert.ok(rawTrophyCase.hatTrickSeasons.some(season => season.id === seasonId));

    process.env.GAME_SUMMARY_READ_MODE = "verify";
    for (let pass = 0; pass < 3; pass++) {
      assert.deepEqual(jsonValue(await storage.getLeagueStandings(leagueId, seasonId)), jsonValue(rawStandings));
      assert.deepEqual(jsonValue(await getTeamStreaks(teamIds[0], leagueId, seasonId)), jsonValue(rawStreaks));
      assert.deepEqual(jsonValue(await getTrophyCase(userId, seasonId)), jsonValue(rawTrophyCase));
    }

    const verifiedRows = await db.execute(sql`
      SELECT summary_type, entity_id, is_verified, matching_reads
      FROM verified_game_summary_cache
      WHERE (summary_type = 'league_standings' AND entity_id = ${leagueId})
         OR (summary_type = 'team_streaks' AND entity_id = ${teamIds[0]})
         OR (summary_type = 'trophy_case' AND entity_id = ${userId})
    `);
    assert.equal(verifiedRows.rows.length, 3);
    assert.ok(verifiedRows.rows.every(row => row.is_verified === true && Number(row.matching_reads) >= 2));

    process.env.GAME_SUMMARY_READ_MODE = "off";
    const unrelatedRaw = await storage.getLeagueStandings(otherLeagueId, otherSeasonId);
    const unrelatedTrophyRaw = await getTrophyCase(otherUserId);
    process.env.GAME_SUMMARY_READ_MODE = "verify";
    for (let pass = 0; pass < 3; pass++) {
      await storage.getLeagueStandings(otherLeagueId, otherSeasonId);
      await getTrophyCase(otherUserId);
    }
    const unrelatedRevisionBefore = await db.execute(sql`
      SELECT revision::text AS revision FROM game_summary_source_revisions
      WHERE summary_type = 'league_standings' AND entity_id = ${otherLeagueId}
    `);
    const unrelatedTrophyRevisionBefore = await db.execute(sql`
      SELECT revision::text AS revision FROM game_summary_source_revisions
      WHERE summary_type = 'trophy_case' AND entity_id = ${otherUserId}
    `);

    await db.execute(sql`UPDATE games SET home_score = 5 WHERE id = ${gameIds[2]}`);
    process.env.GAME_SUMMARY_READ_MODE = "summary";
    const correctedStandings = await storage.getLeagueStandings(leagueId, seasonId);
    const correctedStreaks = await getTeamStreaks(teamIds[0], leagueId, seasonId);
    const correctedTrophyCase = await getTrophyCase(userId, seasonId);
    process.env.GAME_SUMMARY_READ_MODE = "off";
    assert.deepEqual(jsonValue(correctedStandings), jsonValue(await storage.getLeagueStandings(leagueId, seasonId)));
    assert.deepEqual(jsonValue(correctedStreaks), jsonValue(await getTeamStreaks(teamIds[0], leagueId, seasonId)));
    assert.deepEqual(jsonValue(correctedTrophyCase), jsonValue(await getTrophyCase(userId, seasonId)));

    const correctedRows = await db.execute(sql`
      SELECT summary_type, entity_id, is_verified, matching_reads
      FROM verified_game_summary_cache
      WHERE (summary_type = 'league_standings' AND entity_id = ${leagueId})
         OR (summary_type = 'team_streaks' AND entity_id = ${teamIds[0]})
         OR (summary_type = 'trophy_case' AND entity_id = ${userId})
    `);
    assert.ok(correctedRows.rows.every(row => row.is_verified === false && Number(row.matching_reads) === 0));
    process.env.GAME_SUMMARY_READ_MODE = "verify";
    for (let pass = 0; pass < 3; pass++) {
      await storage.getLeagueStandings(leagueId, seasonId);
      await getTeamStreaks(teamIds[0], leagueId, seasonId);
      await getTrophyCase(userId, seasonId);
    }
    await db.execute(sql`
      UPDATE game_goals SET scorer_id = NULL
      WHERE game_id = ${gameIds[2]} AND goal_number = 1
    `);
    process.env.GAME_SUMMARY_READ_MODE = "summary";
    const goalCorrectedStandings = await storage.getLeagueStandings(leagueId, seasonId);
    const goalCorrectedStreaks = await getTeamStreaks(teamIds[0], leagueId, seasonId);
    const goalCorrectedTrophyCase = await getTrophyCase(userId, seasonId);
    process.env.GAME_SUMMARY_READ_MODE = "off";
    assert.deepEqual(jsonValue(goalCorrectedStandings), jsonValue(await storage.getLeagueStandings(leagueId, seasonId)));
    assert.deepEqual(jsonValue(goalCorrectedStreaks), jsonValue(await getTeamStreaks(teamIds[0], leagueId, seasonId)));
    assert.deepEqual(jsonValue(goalCorrectedTrophyCase), jsonValue(await getTrophyCase(userId, seasonId)));

    const afterGoalCorrection = await db.execute(sql`
      SELECT summary_type, entity_id, is_verified, matching_reads
      FROM verified_game_summary_cache
      WHERE (summary_type = 'league_standings' AND entity_id = ${leagueId})
         OR (summary_type = 'team_streaks' AND entity_id = ${teamIds[0]})
         OR (summary_type = 'trophy_case' AND entity_id = ${userId})
    `);
    const afterGoalByType = new Map(afterGoalCorrection.rows.map(row => [row.summary_type, row]));
    assert.equal(afterGoalByType.get("league_standings")?.is_verified, true);
    assert.equal(afterGoalByType.get("team_streaks")?.is_verified, false);
    assert.equal(afterGoalByType.get("trophy_case")?.is_verified, false);

    process.env.GAME_SUMMARY_READ_MODE = "summary";
    assert.deepEqual(jsonValue(await storage.getLeagueStandings(otherLeagueId, otherSeasonId)), jsonValue(unrelatedRaw));
    assert.deepEqual(jsonValue(await getTrophyCase(otherUserId)), jsonValue(unrelatedTrophyRaw));
    const unrelatedRevisionAfter = await db.execute(sql`
      SELECT revision::text AS revision FROM game_summary_source_revisions
      WHERE summary_type = 'league_standings' AND entity_id = ${otherLeagueId}
    `);
    const unrelatedTrophyRevisionAfter = await db.execute(sql`
      SELECT revision::text AS revision FROM game_summary_source_revisions
      WHERE summary_type = 'trophy_case' AND entity_id = ${otherUserId}
    `);
    assert.equal(unrelatedRevisionAfter.rows[0]?.revision, unrelatedRevisionBefore.rows[0]?.revision);
    assert.equal(unrelatedTrophyRevisionAfter.rows[0]?.revision, unrelatedTrophyRevisionBefore.rows[0]?.revision);

    const mismatches = await db.execute(sql`
      SELECT count(*)::int AS count
      FROM game_summary_parity_reports
      WHERE entity_id IN (${leagueId}, ${teamIds[0]}, ${userId}, ${otherLeagueId}, ${otherUserId})
        AND matched = false
    `);
    assert.equal(Number(mismatches.rows[0]?.count ?? 0), 0);
  } finally {
    if (previousMode === undefined) delete process.env.GAME_SUMMARY_READ_MODE;
    else process.env.GAME_SUMMARY_READ_MODE = previousMode;
    await db.execute(sql`DELETE FROM game_goals WHERE game_id LIKE ${fixturePattern}`);
    await db.execute(sql`DELETE FROM game_penalties WHERE game_id LIKE ${fixturePattern}`);
    await db.execute(sql`DELETE FROM game_goalies WHERE game_id LIKE ${fixturePattern}`);
    await db.execute(sql`DELETE FROM game_stars WHERE game_id LIKE ${fixturePattern}`);
    await db.execute(sql`DELETE FROM game_beer_counts WHERE game_id LIKE ${fixturePattern}`);
    await db.execute(sql`DELETE FROM game_rsvps WHERE game_id LIKE ${fixturePattern}`);
    await db.execute(sql`DELETE FROM game_attendance WHERE game_id LIKE ${fixturePattern}`);
    await db.execute(sql`DELETE FROM games WHERE id LIKE ${fixturePattern}`);
    await db.execute(sql`DELETE FROM team_memberships WHERE team_id LIKE ${fixturePattern}`);
    await db.execute(sql`DELETE FROM league_memberships WHERE league_id LIKE ${fixturePattern}`);
    await db.execute(sql`DELETE FROM teams WHERE id LIKE ${fixturePattern}`);
    await db.execute(sql`DELETE FROM seasons WHERE id LIKE ${fixturePattern}`);
    await db.execute(sql`DELETE FROM leagues WHERE id LIKE ${fixturePattern}`);
    await db.execute(sql`DELETE FROM users WHERE id LIKE ${fixturePattern}`);
    await db.execute(sql`
      DELETE FROM game_summary_parity_reports
      WHERE entity_id LIKE ${fixturePattern}
    `);
    await db.execute(sql`
      DELETE FROM verified_game_summary_cache
      WHERE entity_id LIKE ${fixturePattern}
    `);
    await db.execute(sql`
      DELETE FROM game_summary_source_revisions
      WHERE entity_id LIKE ${fixturePattern}
    `);
  }
});

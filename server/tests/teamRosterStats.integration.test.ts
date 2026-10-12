import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { getTeamRosterStats } from "../teamRosterStats.js";

test("team roster stats use completed-game attendance for each registered player", async () => {
  const run = randomUUID().replaceAll("-", "");
  const leagueId = `test_${run}_league`;
  const commissionerId = `test_${run}_commissioner`;
  const teamId = `test_${run}_team`;
  const playerIds = [`test_${run}_player_1`, `test_${run}_player_2`];
  const completedGameIds = [0, 1, 2].map((index) => `test_${run}_completed_${index}`);
  const incompleteGameId = `test_${run}_incomplete`;
  const uniqueLeagueId = `T${run.slice(0, 5)}`.toUpperCase();

  try {
    await db.execute(sql`
      INSERT INTO users (id, email, first_name, last_name)
      VALUES
        (${commissionerId}, ${`commissioner_${run}@example.com`}, 'Test', 'Commissioner'),
        (${playerIds[0]}, ${`first_${run}@example.com`}, 'First', 'Player'),
        (${playerIds[1]}, ${`second_${run}@example.com`}, 'Second', 'Player')
    `);
    await db.execute(sql`
      INSERT INTO leagues (id, name, unique_league_id, sport, commissioner_id)
      VALUES (${leagueId}, 'Roster Stats Test League', ${uniqueLeagueId}, 'hockey', ${commissionerId})
    `);
    await db.execute(sql`
      INSERT INTO teams (id, name, league_id)
      VALUES (${teamId}, 'Roster Stats Test Team', ${leagueId})
    `);
    await db.execute(sql`
      INSERT INTO team_memberships (user_id, team_id, status)
      VALUES
        (${playerIds[0]}, ${teamId}, 'approved'),
        (${playerIds[1]}, ${teamId}, 'approved')
    `);
    await db.execute(sql`
      INSERT INTO league_memberships (user_id, league_id, status, assigned_team_id)
      VALUES
        (${playerIds[0]}, ${leagueId}, 'approved', ${teamId}),
        (${playerIds[1]}, ${leagueId}, 'approved', ${teamId})
    `);
    await db.execute(sql`
      INSERT INTO games (id, league_id, home_team_id, scheduled_at, is_completed)
      VALUES
        ${sql.join(
          [...completedGameIds, incompleteGameId].map((gameId, index) => sql`(
            ${gameId}, ${leagueId}, ${teamId}, NOW() - (${index + 1} * INTERVAL '1 day'),
            ${gameId !== incompleteGameId}
          )`),
          sql`, `,
        )}
    `);
    await db.execute(sql`
      INSERT INTO game_attendance (game_id, team_id, user_id)
      VALUES
        (${completedGameIds[0]}, ${teamId}, ${playerIds[0]}),
        (${completedGameIds[1]}, ${teamId}, ${playerIds[0]}),
        (${completedGameIds[2]}, ${teamId}, ${playerIds[0]}),
        (${completedGameIds[1]}, ${teamId}, ${playerIds[1]}),
        (${incompleteGameId}, ${teamId}, ${playerIds[1]})
    `);
    await db.execute(sql`
      INSERT INTO player_stats (user_id, league_id, games_played, goals, assists, penalty_minutes)
      VALUES
        (${playerIds[0]}, ${leagueId}, 1, 0, 0, 0),
        (${playerIds[1]}, ${leagueId}, 0, 0, 0, 0)
    `);

    const stats = await getTeamRosterStats(teamId, leagueId);
    assert.deepEqual(
      stats.map(({ userId, user, gamesPlayed }) => [userId, user.id, gamesPlayed]),
      [
        [playerIds[0], playerIds[0], 3],
        [playerIds[1], playerIds[1], 1],
      ],
    );
  } finally {
    await db.execute(sql`
      DELETE FROM game_attendance WHERE game_id IN (
        ${sql.join([...completedGameIds, incompleteGameId].map((id) => sql`${id}`), sql`, `)}
      )
    `);
    await db.execute(sql`
      DELETE FROM player_stats WHERE league_id = ${leagueId}
    `);
    await db.execute(sql`
      DELETE FROM games WHERE id IN (
        ${sql.join([...completedGameIds, incompleteGameId].map((id) => sql`${id}`), sql`, `)}
      )
    `);
    await db.execute(sql`DELETE FROM team_memberships WHERE team_id = ${teamId}`);
    await db.execute(sql`DELETE FROM league_memberships WHERE league_id = ${leagueId}`);
    await db.execute(sql`DELETE FROM teams WHERE id = ${teamId}`);
    await db.execute(sql`DELETE FROM leagues WHERE id = ${leagueId}`);
    await db.execute(sql`DELETE FROM users WHERE id IN (${sql.join(
      [commissionerId, ...playerIds].map((id) => sql`${id}`),
      sql`, `,
    )})`);
  }
});

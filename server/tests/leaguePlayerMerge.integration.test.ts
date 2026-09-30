import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pool } from '../db';
import { findLeagueMergeCandidates, leagueMergeDialogPreviewSchema, leagueMergeDialogConfirmSchema, mergeLeaguePlayer, previewLeaguePlayerMerge } from '../leaguePlayerMerge';

test('commissioner merge transfers different-email league history and preserves other leagues', async () => {
  const key = randomUUID().replaceAll('-', '');
  const ids = Object.fromEntries(['commissioner', 'old', 'new', 'other', 'legacy', 'league', 'outside', 'season', 'team', 'game', 'otherGame', 'placeholderGame', 'placeholder', 'import', 'batch', 'grant', 'teamEvent', 'subRequest']
    .map(name => [name, `merge_${key}_${name}`]));
  const q = (text: string, params: unknown[] = []) => pool.query(text, params);
  const l = ids.league, old = ids.old, target = ids.new, team = ids.team, game = ids.game;
  try {
    for (const name of ['commissioner', 'old', 'new', 'other', 'legacy'])
      await q('INSERT INTO users (id,email,first_name) VALUES ($1,$2,$3)',
        [ids[name], name === 'legacy' ? `${key}@placeholder.roster` : `${name}_${key}@example.com`, name]);
    const displayBase = 10000 + (parseInt(key.slice(0, 7), 16) % 80000);
    await q(`UPDATE users SET display_id=CASE id WHEN $1 THEN $3 WHEN $2 THEN $4 END
      WHERE id IN ($1,$2)`, [old, target, `U${displayBase}`, `U${displayBase + 1}`]);
    for (const name of ['league', 'outside'])
      await q(`INSERT INTO leagues (id,name,unique_league_id,sport,commissioner_id)
        VALUES ($1,'Merge test',$2,'hockey',$3)`, [ids[name], `Z${key.slice(name === 'league' ? 0 : 5, name === 'league' ? 5 : 10)}`.toUpperCase(), ids.commissioner]);
    await q('INSERT INTO seasons (id,name,league_id) VALUES ($1,$2,$3)', [ids.season, 'Test season', l]);
    await q('INSERT INTO teams (id,name,league_id) VALUES ($1,$2,$3)', [team, 'Test team', l]);
    await q(`INSERT INTO team_events (id,team_id,creator_id,event_type,title,scheduled_at)
      VALUES ($1,$2,$3,'practice','Merge test practice',NOW())`, [ids.teamEvent, team, ids.commissioner]);
    await q(`INSERT INTO substitute_requests (id,team_event_id,original_player_id,substitute_player_id,requesting_team_id,requested_by)
      VALUES ($1,$2,$3,$4,$5,$3)`, [ids.subRequest, ids.teamEvent, old, ids.other, team]);
    for (const userId of [old, target])
      await q(`INSERT INTO league_memberships (user_id,league_id,status) VALUES ($1,$2,'approved')`, [userId, l]);
    await q(`INSERT INTO league_pro_grants
      (id,league_id,seat_count,start_month,end_month,months_count,per_player_monthly_cents,
       individual_total_cents,discounted_total_cents,savings_cents,discount_percent,status)
      VALUES ($1,$2,1,'2026-09','2026-10',2,100,200,150,50,25,'paid')`, [ids.grant, l]);
    await q('INSERT INTO league_pro_seats (grant_id,league_id,user_id) VALUES ($1,$2,$3)',
      [ids.grant, l, old]);
    await q(`INSERT INTO league_memberships (user_id,league_id,status) VALUES ($1,$2,'approved')`, [old, ids.outside]);
    for (const gameId of [game, ids.otherGame, ids.placeholderGame])
      await q('INSERT INTO games (id,league_id,season_id,home_team_id,scheduled_at) VALUES ($1,$2,$3,$4,NOW())',
        [gameId, gameId === ids.otherGame ? ids.outside : l, gameId === ids.otherGame ? null : ids.season, team]);
    await q(`INSERT INTO player_stats (user_id,league_id,season_id,games_played,goals,assists,penalty_minutes)
      VALUES ($1,$2,$3,2,1,1,2),($4,$2,$3,3,2,2,4)`, [old, l, ids.season, target]);
    await q(`INSERT INTO player_stats (user_id,league_id,games_played,goals,assists,penalty_minutes)
      VALUES ($1,$2,4,5,6,7)`, [old, ids.outside]);
    await q('INSERT INTO game_attendance (game_id,team_id,user_id) VALUES ($1,$2,$3),($1,$2,$4)', [game, team, old, target]);
    await q(`INSERT INTO game_rsvps (game_id,team_id,user_id,status) VALUES
      ($1,$2,$3,'attending'),($1,$2,$4,'not_attending')`, [game, team, old, target]);
    await q('INSERT INTO game_goals (game_id,team_id,scorer_id,primary_assist_id,goal_number) VALUES ($1,$2,$3,$3,1)',
      [game, team, old]);
    await q('INSERT INTO game_goals (game_id,team_id,scorer_id,goal_number) VALUES ($1,$2,$3,2)',
      [game, team, target]);
    await q('INSERT INTO game_penalties (game_id,team_id,player_id,penalty_number) VALUES ($1,$2,$3,1)', [game, team, old]);
    await q('INSERT INTO game_penalties (game_id,team_id,player_id,penalty_number) VALUES ($1,$2,$3,2)', [game, team, target]);
    await q('INSERT INTO game_goalies (game_id,team_id,goalie_user_id) VALUES ($1,$2,$3)', [game, team, old]);
    await q('INSERT INTO game_goalies (game_id,team_id,goalie_user_id) VALUES ($1,$2,$3)', [ids.placeholderGame, team, target]);
    await q(`INSERT INTO game_stars (game_id,first_star_user_id,second_star_user_id,third_star_user_id,awarded_by)
      VALUES ($1,$2,$3,$3,$4)`, [game, old, ids.other, ids.commissioner]);
    await q('INSERT INTO game_goals (game_id,team_id,scorer_id,goal_number) VALUES ($1,$2,$3,1)',
      [ids.otherGame, team, old]);

    const candidates = await findLeagueMergeCandidates(l, `${key.slice(0, 6)}@no-match`);
    assert.equal(candidates.length, 0);
    const preview = await previewLeaguePlayerMerge(l, { type: 'user', id: old });
    assert.equal(preview.history.goalie, 1);
    await assert.rejects(mergeLeaguePlayer(l, ids.other, { type: 'user', id: old }, target), /commissioner/);
    await assert.rejects(mergeLeaguePlayer(l, ids.commissioner, { type: 'user', id: old }, target), /conflicting RSVPs/);
    assert.equal((await q('SELECT goals FROM player_stats WHERE user_id=$1 AND league_id=$2', [old, l])).rows[0].goals, 1);
    assert.equal((await q('SELECT original_player_id FROM substitute_requests WHERE id=$1', [ids.subRequest])).rows[0].original_player_id, old);
    await q(`UPDATE game_rsvps SET status='no_response' WHERE game_id=$1 AND user_id=$2`, [game, target]);
    await q(`INSERT INTO league_invites_sent (league_id,user_id,method) VALUES ($1,$2,'email')`, [l, old]);
    await assert.rejects(mergeLeaguePlayer(l, ids.commissioner, { type: 'user', id: old }, target), /approvals, announcements, invites, duties, reminders or badges/);
    assert.equal((await q('SELECT user_id FROM league_pro_seats WHERE grant_id=$1', [ids.grant])).rows[0].user_id, old);
    await q('DELETE FROM league_invites_sent WHERE league_id=$1 AND user_id=$2', [l, old]);
    await mergeLeaguePlayer(l, ids.commissioner, { type: 'user', id: old }, target);
    const request = (await q('SELECT original_player_id,substitute_player_id,requested_by FROM substitute_requests WHERE id=$1', [ids.subRequest])).rows[0];
    assert.equal(request.original_player_id, target);
    assert.equal(request.requested_by, target);
    assert.equal(request.substitute_player_id, ids.other);
    assert.equal((await q('SELECT user_id FROM league_pro_seats WHERE grant_id=$1', [ids.grant])).rows[0].user_id, target);
    const stat = (await q('SELECT * FROM player_stats WHERE league_id=$1 AND user_id=$2', [l, target])).rows[0];
    assert.equal(stat.games_played, 4); // Two + three, minus the shared attended game.
    assert.equal(stat.goals, 3);
    assert.equal((await q('SELECT count(*)::int AS n FROM league_memberships WHERE league_id=$1 AND user_id=$2', [l, old])).rows[0].n, 0);
    assert.equal((await q('SELECT count(*)::int AS n FROM league_memberships WHERE league_id=$1 AND user_id=$2', [l, target])).rows[0].n, 1);
    assert.equal((await q('SELECT count(*)::int AS n FROM game_attendance WHERE game_id=$1', [game])).rows[0].n, 1);
    assert.equal((await q('SELECT status FROM game_rsvps WHERE game_id=$1', [game])).rows[0].status, 'attending');
    for (const [table, column] of [
      ['game_goals', 'scorer_id'], ['game_goals', 'primary_assist_id'],
      ['game_penalties', 'player_id'], ['game_goalies', 'goalie_user_id'], ['game_stars', 'first_star_user_id'],
    ]) assert.equal((await q(`SELECT count(*)::int AS n FROM ${table} WHERE game_id=$1 AND ${column}=$2`, [game, target])).rows[0].n,
      column === 'scorer_id' || column === 'player_id' ? 2 : 1);
    assert.equal((await q('SELECT scorer_id FROM game_goals WHERE game_id=$1', [ids.otherGame])).rows[0].scorer_id, old);
    assert.equal((await q('SELECT games_played FROM player_stats WHERE league_id=$1 AND user_id=$2', [ids.outside, old])).rows[0].games_played, 4);
    await assert.rejects(mergeLeaguePlayer(l, ids.commissioner, { type: 'user', id: old }, target), /already been merged/);

    // Older imports were backed by a users row with a placeholder email.
    await q(`INSERT INTO league_memberships (user_id,league_id,status) VALUES ($1,$2,'approved')`, [ids.legacy, l]);
    await q(`INSERT INTO player_stats (user_id,league_id,games_played,goals,assists,penalty_minutes)
      VALUES ($1,$2,1,0,1,0)`, [ids.legacy, l]);
    await mergeLeaguePlayer(l, ids.commissioner, { type: 'user', id: ids.legacy }, target);
    assert.equal((await q('SELECT assists FROM player_stats WHERE league_id=$1 AND season_id IS NULL AND user_id=$2', [l, target])).rows[0].assists, 1);
    assert.equal((await q('SELECT email FROM users WHERE id=$1', [ids.legacy])).rows[0].email, `${key}@placeholder.roster`);

    // Modern roster placeholder: attendance is claimed once, no cascade loss.
    await q('INSERT INTO placeholder_players (id,league_id,team_id,first_name,last_name) VALUES ($1,$2,$3,$4,$5)',
      [ids.placeholder, l, team, 'Roster', 'Entry']);
    await q('INSERT INTO game_attendance (game_id,team_id,placeholder_player_id) VALUES ($1,$2,$3)',
      [ids.placeholderGame, team, ids.placeholder]);
    await mergeLeaguePlayer(l, ids.commissioner, { type: 'placeholder', id: ids.placeholder }, target);
    assert.equal((await q('SELECT user_id FROM game_attendance WHERE game_id=$1', [ids.placeholderGame])).rows[0].user_id, target);

    // Spreadsheet entry: imported stats become user stats, import row stays as provenance.
    await q(`INSERT INTO player_imports (id,league_id,imported_by,file_name,total_records,successful_records,failed_records)
      VALUES ($1,$2,$3,'test.csv',1,1,0)`, [ids.batch, l, ids.commissioner]);
    await q(`INSERT INTO imported_players (id,import_id,league_id,first_name,team_id)
      VALUES ($1,$2,$3,'Imported',$4)`, [ids.import, ids.batch, l, team]);
    await q(`INSERT INTO player_stats (imported_player_id,league_id,games_played,goals,assists,penalty_minutes)
      VALUES ($1,$2,1,1,0,0)`, [ids.import, l]);
    await mergeLeaguePlayer(l, ids.commissioner, { type: 'imported', id: ids.import }, target);
    assert.equal((await q('SELECT merged_with_user_id FROM imported_players WHERE id=$1', [ids.import])).rows[0].merged_with_user_id, target);
    assert.equal((await q('SELECT goals FROM player_stats WHERE league_id=$1 AND season_id IS NULL AND user_id=$2', [l, target])).rows[0].goals, 1);
  } finally {
    await q('DELETE FROM substitute_requests WHERE id=$1', [ids.subRequest]);
    await q('DELETE FROM team_events WHERE id=$1', [ids.teamEvent]);
    for (const table of ['game_stars','game_goalies','game_penalties','game_goals','game_rsvps','game_attendance','games'])
      await q(`DELETE FROM ${table} WHERE ${table === 'games' ? 'id' : 'game_id'} IN ($1,$2,$3)`, [game, ids.otherGame, ids.placeholderGame]);
    await q('DELETE FROM player_stats WHERE league_id IN ($1,$2)', [l, ids.outside]);
    await q('DELETE FROM league_invites_sent WHERE league_id=$1', [l]);
    await q('DELETE FROM league_pro_seats WHERE grant_id=$1', [ids.grant]);
    await q('DELETE FROM league_pro_grants WHERE id=$1', [ids.grant]);
    await q('DELETE FROM team_memberships WHERE team_id=$1', [team]);
    await q('DELETE FROM league_memberships WHERE league_id IN ($1,$2)', [l, ids.outside]);
    await q('DELETE FROM placeholder_players WHERE id=$1', [ids.placeholder]);
    await q('DELETE FROM imported_players WHERE id=$1', [ids.import]);
    await q('DELETE FROM player_imports WHERE id=$1', [ids.batch]);
    await q('DELETE FROM teams WHERE id=$1', [team]);
    await q('DELETE FROM seasons WHERE id=$1', [ids.season]);
    await q('DELETE FROM leagues WHERE id IN ($1,$2)', [l, ids.outside]);
    await q('DELETE FROM users WHERE id IN ($1,$2,$3,$4,$5)', [ids.commissioner, old, target, ids.other, ids.legacy]);
  }
});

test('dialog searches only eligible league U accounts and rejects roster identities at both API boundaries', async () => {
  const key = randomUUID().replaceAll('-', '');
  const ids = Object.fromEntries(['commissioner', 'first', 'second', 'legacy', 'nonmember', 'league', 'batch', 'import1', 'import2', 'placeholder1', 'placeholder2']
    .map(name => [name, `merge_picker_${key}_${name}`]));
  const q = (text: string, params: unknown[] = []) => pool.query(text, params);
  const base = 10000 + (parseInt(key.slice(0, 7), 16) % 80000);
  const firstDisplay = `U${base}`, secondDisplay = `U${base + 1}`;
  try {
    for (const name of ['commissioner', 'first', 'second', 'legacy', 'nonmember'])
      await q(`INSERT INTO users (id,email,first_name,last_name,display_id)
        VALUES ($1,$2,'Brad','Edwards',$3)`, [
        ids[name],
        name === 'legacy' ? `${key}@placeholder.roster` : `brad_${name}_${key}@example.com`,
        name === 'first' ? firstDisplay : name === 'second' ? secondDisplay : null,
      ]);
    await q(`INSERT INTO leagues (id,name,unique_league_id,sport,commissioner_id)
      VALUES ($1,'Picker test',$2,'hockey',$3)`, [ids.league, `Z${key.slice(0, 5)}`.toUpperCase(), ids.commissioner]);
    for (const name of ['first', 'second', 'legacy'])
      await q(`INSERT INTO league_memberships (user_id,league_id,status) VALUES ($1,$2,'approved')`, [ids[name], ids.league]);
    for (const name of ['placeholder1', 'placeholder2'])
      await q(`INSERT INTO placeholder_players (id,league_id,first_name,last_name,email)
        VALUES ($1,$2,'Brad','Edwards',$3)`, [ids[name], ids.league, `brad_${key}@example.com`]);
    await q(`INSERT INTO player_imports (id,league_id,imported_by,file_name,total_records,successful_records,failed_records)
      VALUES ($1,$2,$3,'test.csv',2,2,0)`, [ids.batch, ids.league, ids.commissioner]);
    for (const name of ['import1', 'import2'])
      await q(`INSERT INTO imported_players (id,import_id,league_id,first_name,last_name,email)
        VALUES ($1,$2,$3,'Brad','Edwards',$4)`, [ids[name], ids.batch, ids.league, `brad_${key}@example.com`]);

    for (const search of ['Brad Edwards', 'brad_first_', firstDisplay, secondDisplay]) {
      const found = await findLeagueMergeCandidates(ids.league, search);
      assert.deepEqual(found.map(c => c.id).sort(), search === 'Brad Edwards'
        ? [ids.first, ids.second].sort()
        : [search === secondDisplay ? ids.second : ids.first]);
      for (const c of found) {
        assert.equal(c.type, 'user');
        assert.match(c.displayId, /^U[0-9]{5}$/);
        assert.match(c.email, /@example.com$/);
        assert.equal(c.canSurvive, true);
      }
    }
    assert.deepEqual(await findLeagueMergeCandidates(ids.league, ids.import1), []);
    assert.deepEqual(await findLeagueMergeCandidates(ids.league, ids.nonmember), []);

    // Both pickers use the same candidate endpoint. The route's shared schema rejects
    // non-user identities before preview/confirm, and the service checks eligibility again.
    for (const type of ['placeholder', 'imported'] as const) {
      const sourceId = type === 'placeholder' ? ids.placeholder1 : ids.import1;
      assert.throws(() => leagueMergeDialogPreviewSchema.parse({
        source: { type, id: sourceId }, survivor: { type: 'user', id: ids.second },
      }));
      assert.throws(() => leagueMergeDialogPreviewSchema.parse({
        source: { type: 'user', id: ids.first }, survivor: { type, id: sourceId },
      }));
      assert.throws(() => leagueMergeDialogConfirmSchema.parse({
        source: { type, id: sourceId }, survivorId: ids.second, acknowledgeIdentity: true,
      }));
      await assert.rejects(previewLeaguePlayerMerge(ids.league, { type, id: sourceId }), /user account with a U ID/);
      await assert.rejects(previewLeaguePlayerMerge(ids.league, { type: 'user', id: sourceId }), /no longer available/);
      await assert.rejects(mergeLeaguePlayer(ids.league, ids.commissioner, { type, id: sourceId }, ids.second, false, true), /user account with a U ID/);
      await assert.rejects(mergeLeaguePlayer(ids.league, ids.commissioner, { type: 'user', id: sourceId }, ids.second, false, true), /not in this league/);
    }
    await assert.rejects(previewLeaguePlayerMerge(ids.league, { type: 'user', id: ids.legacy }), /no longer available/);
    const legacyReplacementPreview = await previewLeaguePlayerMerge(ids.league, { type: 'user', id: ids.legacy }, true);
    assert.equal(legacyReplacementPreview.id, ids.legacy);
    await assert.rejects(mergeLeaguePlayer(ids.league, ids.commissioner, { type: 'user', id: ids.legacy }, ids.second, false, true), /no longer active/);
    await assert.rejects(mergeLeaguePlayer(ids.league, ids.commissioner, { type: 'user', id: ids.first }, ids.legacy, false, true), /surviving profile/);
    const from = await previewLeaguePlayerMerge(ids.league, { type: 'user', id: ids.first });
    const to = await previewLeaguePlayerMerge(ids.league, { type: 'user', id: ids.second });
    assert.equal(from.displayId, firstDisplay);
    assert.equal(to.displayId, secondDisplay);
    await mergeLeaguePlayer(ids.league, ids.commissioner, { type: 'user', id: ids.first }, ids.second, false, true);
    assert.equal((await q('SELECT count(*)::int AS n FROM league_memberships WHERE league_id=$1 AND user_id=$2',
      [ids.league, ids.first])).rows[0].n, 0);
    assert.equal((await q('SELECT count(*)::int AS n FROM imported_players WHERE league_id=$1', [ids.league])).rows[0].n, 2);
    assert.equal((await q('SELECT count(*)::int AS n FROM placeholder_players WHERE league_id=$1', [ids.league])).rows[0].n, 2);
  } finally {
    await q('DELETE FROM imported_players WHERE import_id=$1', [ids.batch]);
    await q('DELETE FROM player_imports WHERE id=$1', [ids.batch]);
    await q('DELETE FROM placeholder_players WHERE league_id=$1', [ids.league]);
    await q('DELETE FROM league_memberships WHERE league_id=$1', [ids.league]);
    await q('DELETE FROM leagues WHERE id=$1', [ids.league]);
    await q('DELETE FROM users WHERE id IN ($1,$2,$3,$4,$5)',
      [ids.commissioner, ids.first, ids.second, ids.legacy, ids.nonmember]);
  }
});
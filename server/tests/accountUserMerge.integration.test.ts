import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pool } from '../db';
import { isRetiredAccount } from '../supabaseAuth';
import {
  AccountUserMergeConflict,
  confirmAccountUserMerge,
  previewAccountUserMerge,
  searchAccountUsers,
} from '../accountUserMerge';

test('account merge searches registered accounts, retires atomically, and safely replays', async () => {
  const key = randomUUID().replaceAll('-', '');
  const ids = {
    source: `merge_source_${key}`,
    survivor: `merge_survivor_${key}`,
    operator: `merge_operator_${key}`,
    leagueOne: `merge_league_${key}`,
    leagueTwo: `merge_league2_${key}`,
    season: `merge_season_${key}`,
    scrimmage: `merge_scrimmage_${key}`,
    tournament: `merge_tournament_${key}`,
    tournamentTeam: `merge_tournament_team_${key}`,
    standaloneTournament: `merge_standalone_tournament_${key}`,
    standaloneTournamentTeam: `merge_standalone_tournament_team_${key}`,
    paymentRequest: `merge_payment_${key}`,
    conversation: `merge_conversation_${key}`,
  };
  const q = (sql: string, params: unknown[] = []) => pool.query(sql, params);
  try {
    for (const [id, email, name] of [
      [ids.source, `${key}_source@example.test`, 'Source'],
      [ids.survivor, `${key}_survivor@example.test`, 'Survivor'],
      [ids.operator, `${key}_operator@example.test`, 'Operator'],
    ]) {
      await q('INSERT INTO users (id,email,first_name) VALUES ($1,$2,$3)', [id, email, name]);
    }
    for (const [id, suffix] of [[ids.leagueOne, 'A'], [ids.leagueTwo, 'B']]) {
      await q(`INSERT INTO leagues (id,name,unique_league_id,sport,commissioner_id)
        VALUES ($1,$2,$3,'hockey',$4)`, [id, `Merge league ${suffix}`, `${key.slice(0, 5)}${suffix}`, ids.operator]);
      await q(`INSERT INTO league_memberships (user_id,league_id,status) VALUES ($1,$2,'approved')`,
        [ids.source, id]);
    }
    await q(`INSERT INTO seasons (id,name,league_id) VALUES ($1,'Merge season',$2)`,
      [ids.season, ids.leagueOne]);
    await q(`INSERT INTO birthday_greetings (user_id,birthday_date,popup_dismissed_at)
      VALUES ($1,'2000-01-02',NOW())`, [ids.source]);
    await q(`INSERT INTO personal_reminders (user_id,title,scheduled_at)
      VALUES ($1,'Merge reminder',NOW())`, [ids.source]);
    await q(`INSERT INTO league_photos (league_id,uploaded_by,file_url,file_name)
      VALUES ($1,$2,'https://example.test/photo.jpg','merge-photo.jpg')`, [ids.leagueOne, ids.source]);
    await q(`INSERT INTO scrimmages
      (id,league_id,creator_id,title,date_time,location,max_players)
      VALUES ($1,$2,$3,'Merge scrimmage',NOW(),'Test rink',10)`,
    [ids.scrimmage, ids.leagueOne, ids.operator]);
    await q(`INSERT INTO scrimmage_requests (scrimmage_id,player_id) VALUES ($1,$2)`,
      [ids.scrimmage, ids.source]);
    await q(`INSERT INTO tournaments (id,name,league_id,season_id,type,format,num_teams,created_by)
      VALUES ($1,'Merge tournament',$2,$3,'season_playoff','single_elimination',1,$4)`,
    [ids.tournament, ids.leagueOne, ids.season, ids.operator]);
    await q(`INSERT INTO tournament_teams (id,tournament_id,team_name,seed)
      VALUES ($1,$2,'Merge tournament team',1)`, [ids.tournamentTeam, ids.tournament]);
    await q(`INSERT INTO tournament_stats (tournament_id,user_id,team_id,games_played)
      VALUES ($1,$2,$3,1)`, [ids.tournament, ids.source, ids.tournamentTeam]);
    await q(`INSERT INTO tournaments (id,name,type,format,num_teams,created_by)
      VALUES ($1,'Unlinked tournament','standalone','single_elimination',1,$2)`,
    [ids.standaloneTournament, ids.operator]);
    await q(`INSERT INTO tournament_teams (id,tournament_id,team_name,seed)
      VALUES ($1,$2,'Unlinked tournament team',1)`, [ids.standaloneTournamentTeam, ids.standaloneTournament]);
    await q(`INSERT INTO tournament_stats (tournament_id,user_id,team_id,games_played)
      VALUES ($1,$2,$3,1)`, [ids.standaloneTournament, ids.source, ids.standaloneTournamentTeam]);
    await q(`INSERT INTO payment_requests (id,creator_id,title,amount_per_person)
      VALUES ($1,$2,'Unpaid merge invoice',10)`, [ids.paymentRequest, ids.operator]);
    await q(`INSERT INTO payment_request_recipients (payment_request_id,user_id)
      VALUES ($1,$2)`, [ids.paymentRequest, ids.source]);
    await q(`INSERT INTO conversations (id,type,created_by) VALUES ($1,'direct',$2)`,
      [ids.conversation, ids.operator]);
    await q(`INSERT INTO conversation_participants (conversation_id,user_id)
      VALUES ($1,$2)`, [ids.conversation, ids.source]);
    await q(`INSERT INTO messages (conversation_id,sender_id,content)
      VALUES ($1,$2,'Preserve this message')`, [ids.conversation, ids.source]);

    const found = await searchAccountUsers(ids.source);
    assert.deepEqual(found.map(user => user.id), [ids.source]);
    const preview = await previewAccountUserMerge(ids.source, ids.survivor);
    assert.equal(preview.source.id, ids.source);
    assert.equal(preview.survivor.id, ids.survivor);
    assert.deepEqual(preview.blockers, []);
    assert.deepEqual(preview.leagues.map(league => league.id).sort(), [ids.leagueOne, ids.leagueTwo].sort());
    const leagueOneRecords = preview.leagues.find(league => league.id === ids.leagueOne)!.records;
    assert.ok(leagueOneRecords.some(record => record.domain === 'scrimmage_requests.player_id'));
    assert.ok(leagueOneRecords.some(record => record.domain === 'tournament_stats.user_id'));
    assert.ok(leagueOneRecords.some(record => record.domain === 'league_photos.uploaded_by'));
    assert.ok(!preview.other.some(record => record.domain === 'scrimmage_requests.player_id'));
    assert.ok(preview.other.some(record => record.domain === 'tournament_stats.user_id' && record.count === 1));
    assert.ok(preview.other.some(record => record.domain === 'birthday_greetings.user_id' && record.count === 1));
    assert.ok(preview.other.some(record => record.domain === 'payment_request_recipients.user_id' && record.count === 1));
    assert.ok(preview.other.some(record => record.domain === 'personal_reminders.user_id' && record.count === 1));

    const concurrentResults = await Promise.all([
      confirmAccountUserMerge(ids.source, ids.survivor, ids.operator, preview.fingerprint),
      confirmAccountUserMerge(ids.source, ids.survivor, ids.operator, preview.fingerprint),
    ]);
    assert.equal(concurrentResults.filter(result => !result.alreadyMerged).length, 1);
    assert.equal(concurrentResults.filter(result => result.alreadyMerged).length, 1);
    assert.equal((await q('SELECT deleted_at FROM users WHERE id=$1', [ids.source])).rows[0].deleted_at !== null, true);
    assert.equal(await isRetiredAccount(ids.source), true);
    assert.equal(await isRetiredAccount(ids.survivor), false);
    const audit = (await q(`SELECT source_user_id,survivor_user_id,operator_user_id,
      source_display_id,source_email FROM account_user_merges WHERE source_user_id=$1`, [ids.source])).rows[0];
    assert.equal(audit.survivor_user_id, ids.survivor);
    assert.equal(audit.operator_user_id, ids.operator);
    assert.equal(audit.source_email, `${key}_source@example.test`);
    assert.equal((await q('SELECT user_id FROM birthday_greetings WHERE user_id=$1 AND birthday_date=$2',
      [ids.survivor, '2000-01-02'])).rows.length, 1);
    assert.equal((await q('SELECT user_id FROM personal_reminders WHERE user_id=$1 AND title=$2',
      [ids.survivor, 'Merge reminder'])).rows.length, 1);
    assert.equal((await q('SELECT count(*)::int AS count FROM league_memberships WHERE user_id=$1',
      [ids.survivor])).rows[0].count, 2);
    assert.equal((await q('SELECT uploaded_by FROM league_photos WHERE league_id=$1', [ids.leagueOne])).rows[0].uploaded_by,
      ids.survivor);
    assert.equal((await q('SELECT player_id FROM scrimmage_requests WHERE scrimmage_id=$1', [ids.scrimmage])).rows[0].player_id,
      ids.survivor);
    assert.equal((await q('SELECT user_id FROM tournament_stats WHERE tournament_id=$1', [ids.tournament])).rows[0].user_id,
      ids.survivor);
    assert.equal((await q('SELECT user_id FROM tournament_stats WHERE tournament_id=$1',
      [ids.standaloneTournament])).rows[0].user_id, ids.survivor);
    assert.equal((await q('SELECT user_id FROM payment_request_recipients WHERE payment_request_id=$1',
      [ids.paymentRequest])).rows[0].user_id, ids.survivor);
    assert.equal((await q('SELECT sender_id FROM messages WHERE conversation_id=$1', [ids.conversation])).rows[0].sender_id,
      ids.survivor);
    assert.equal((await q('SELECT user_id FROM conversation_participants WHERE conversation_id=$1',
      [ids.conversation])).rows[0].user_id, ids.survivor);
    assert.equal((await searchAccountUsers(ids.source)).length, 0);

    // A network retry of the exact operation must not create another merge.
    assert.deepEqual(await confirmAccountUserMerge(
      ids.source, ids.survivor, ids.operator, preview.fingerprint,
    ), { sourceId: ids.source, survivorId: ids.survivor, alreadyMerged: true });
    await assert.rejects(
      confirmAccountUserMerge(ids.source, ids.operator, ids.survivor, preview.fingerprint),
      AccountUserMergeConflict,
    );
  } finally {
    await q('DELETE FROM account_user_merges WHERE source_user_id=$1', [ids.source]);
    await q('DELETE FROM birthday_greetings WHERE user_id=$1', [ids.source]);
    await q('DELETE FROM birthday_greetings WHERE user_id=$1', [ids.survivor]);
    await q('DELETE FROM personal_reminders WHERE user_id IN ($1,$2)', [ids.source, ids.survivor]);
    await q('DELETE FROM payment_request_recipients WHERE payment_request_id=$1', [ids.paymentRequest]);
    await q('DELETE FROM payment_requests WHERE id=$1', [ids.paymentRequest]);
    await q('DELETE FROM scrimmage_requests WHERE scrimmage_id=$1', [ids.scrimmage]);
    await q('DELETE FROM scrimmages WHERE id=$1', [ids.scrimmage]);
    await q('DELETE FROM tournament_stats WHERE tournament_id=$1', [ids.tournament]);
    await q('DELETE FROM tournament_teams WHERE id=$1', [ids.tournamentTeam]);
    await q('DELETE FROM tournaments WHERE id=$1', [ids.tournament]);
    await q('DELETE FROM tournament_stats WHERE tournament_id=$1', [ids.standaloneTournament]);
    await q('DELETE FROM tournament_teams WHERE id=$1', [ids.standaloneTournamentTeam]);
    await q('DELETE FROM tournaments WHERE id=$1', [ids.standaloneTournament]);
    await q('DELETE FROM league_photos WHERE league_id=ANY($1::varchar[])', [[ids.leagueOne, ids.leagueTwo]]);
    await q('DELETE FROM messages WHERE conversation_id=$1', [ids.conversation]);
    await q('DELETE FROM conversation_participants WHERE conversation_id=$1', [ids.conversation]);
    await q('DELETE FROM conversations WHERE id=$1', [ids.conversation]);
    await q('DELETE FROM league_memberships WHERE league_id=ANY($1::varchar[])', [[ids.leagueOne, ids.leagueTwo]]);
    await q('DELETE FROM seasons WHERE id=$1', [ids.season]);
    await q('DELETE FROM leagues WHERE id=ANY($1::varchar[])', [[ids.leagueOne, ids.leagueTwo]]);
    await q('DELETE FROM users WHERE id=ANY($1::varchar[])', [[ids.source, ids.survivor, ids.operator]]);
  }
});

test('account merge rejects stale previews without retiring or moving source data', async () => {
  const key = randomUUID().replaceAll('-', '');
  const ids = [`merge_stale_source_${key}`, `merge_stale_target_${key}`, `merge_stale_operator_${key}`];
  const q = (sql: string, params: unknown[] = []) => pool.query(sql, params);
  try {
    for (let i = 0; i < ids.length; i++)
      await q('INSERT INTO users (id,email,first_name) VALUES ($1,$2,$3)',
        [ids[i], `${ids[i]}@example.test`, `User ${i}`]);
    await q(`INSERT INTO birthday_greetings (user_id,birthday_date,popup_dismissed_at)
      VALUES ($1,'2000-02-03',NOW())`, [ids[0]]);
    const preview = await previewAccountUserMerge(ids[0], ids[1]);
    // A column update with the same affected-row count must invalidate review.
    await q(`UPDATE birthday_greetings SET popup_dismissed_at=NULL
      WHERE user_id=$1 AND birthday_date='2000-02-03'`, [ids[0]]);
    await assert.rejects(
      confirmAccountUserMerge(ids[0], ids[1], ids[2], preview.fingerprint),
      /changed after review/,
    );
    assert.equal((await q('SELECT deleted_at FROM users WHERE id=$1', [ids[0]])).rows[0].deleted_at, null);
  } finally {
    await q('DELETE FROM account_user_merges WHERE source_user_id=$1', [ids[0]]);
    await q('DELETE FROM birthday_greetings WHERE user_id=$1', [ids[0]]);
    await q('DELETE FROM users WHERE id=ANY($1::varchar[])', [ids]);
  }
});

test('account merge itemizes overlapping memberships, stats, attendance, and RSVPs and rolls back', async () => {
  const key = randomUUID().replaceAll('-', '');
  const source = `merge_collision_source_${key}`;
  const survivor = `merge_collision_target_${key}`;
  const operator = `merge_collision_operator_${key}`;
  const league = `merge_collision_league_${key}`;
  const team = `merge_collision_team_${key}`;
  const game = `merge_collision_game_${key}`;
  const q = (sql: string, params: unknown[] = []) => pool.query(sql, params);
  try {
    for (const [id, name] of [[source, 'Source'], [survivor, 'Survivor'], [operator, 'Operator']])
      await q('INSERT INTO users (id,email,first_name) VALUES ($1,$2,$3)', [id, `${id}@example.test`, name]);
    await q(`INSERT INTO leagues (id,name,unique_league_id,sport,commissioner_id)
      VALUES ($1,'Collision league',$2,'hockey',$3)`, [league, key.slice(0, 6), operator]);
    await q('INSERT INTO teams (id,name,league_id) VALUES ($1,$2,$3)', [team, 'Collision team', league]);
    await q(`INSERT INTO games (id,league_id,home_team_id,scheduled_at)
      VALUES ($1,$2,$3,NOW())`, [game, league, team]);
    for (const userId of [source, survivor]) {
      await q(`INSERT INTO league_memberships (user_id,league_id,status,requested_at)
        VALUES ($1,$2,'approved','2024-01-01')`, [userId, league]);
      await q(`INSERT INTO player_stats (user_id,league_id,games_played,goals,assists,penalty_minutes)
        VALUES ($1,$2,1,0,0,0)`, [userId, league]);
      await q(`INSERT INTO game_attendance (game_id,team_id,user_id,created_at,updated_at)
        VALUES ($1,$2,$3,'2024-01-01','2024-01-01')`, [game, team, userId]);
      await q(`INSERT INTO game_rsvps (game_id,team_id,user_id,status,created_at,updated_at)
        VALUES ($1,$2,$3,'attending','2024-01-01','2024-01-01')`, [game, team, userId]);
    }
    await q(`INSERT INTO team_memberships (user_id,team_id,status)
      VALUES ($1,$2,'approved')`, [source, team]);
    const preview = await previewAccountUserMerge(source, survivor);
    assert.ok(!preview.blockers.some(blocker => blocker.domain === 'league_memberships'));
    assert.ok(preview.blockers.some(blocker => blocker.domain === 'player_stats'));
    for (const domain of ['league_memberships', 'game_attendance', 'game_rsvps'])
      assert.ok(preview.combinable.some(record => record.domain === domain), `expected ${domain} to be combinable`);
    assert.ok(preview.leagues.some(league => league.records.some(record => record.domain === 'team_memberships.user_id')));
    assert.ok(preview.leagues.some(league => league.records.some(record => record.domain === 'game_attendance.user_id')));
    await assert.rejects(
      confirmAccountUserMerge(source, survivor, operator, preview.fingerprint),
      /Merge blocked/,
    );
    assert.equal((await q('SELECT count(*)::int AS count FROM league_memberships WHERE user_id=$1', [source])).rows[0].count, 1);
    assert.equal((await q('SELECT count(*)::int AS count FROM league_memberships WHERE user_id=$1', [survivor])).rows[0].count, 1);
    assert.equal((await q('SELECT count(*)::int AS count FROM player_stats WHERE user_id IN ($1,$2)', [source, survivor])).rows[0].count, 2);
    assert.equal((await q('SELECT count(*)::int AS count FROM game_attendance WHERE game_id=$1', [game])).rows[0].count, 2);
    assert.equal((await q('SELECT count(*)::int AS count FROM game_rsvps WHERE game_id=$1', [game])).rows[0].count, 2);
    assert.equal((await q('SELECT deleted_at FROM users WHERE id=$1', [source])).rows[0].deleted_at, null);
  } finally {
    await q('DELETE FROM game_rsvps WHERE game_id=$1', [game]);
    await q('DELETE FROM game_attendance WHERE game_id=$1', [game]);
    await q('DELETE FROM team_memberships WHERE team_id=$1', [team]);
    await q('DELETE FROM player_stats WHERE league_id=$1', [league]);
    await q('DELETE FROM league_memberships WHERE league_id=$1', [league]);
    await q('DELETE FROM games WHERE id=$1', [game]);
    await q('DELETE FROM teams WHERE id=$1', [team]);
    await q('DELETE FROM leagues WHERE id=$1', [league]);
    await q('DELETE FROM account_user_merges WHERE source_user_id=$1', [source]);
    await q('DELETE FROM users WHERE id=ANY($1::varchar[])', [[source, survivor, operator]]);
  }
});

test('account merge combines equivalent memberships, attendance, RSVPs, preferences, and badge history', async () => {
  const key = randomUUID().replaceAll('-', '');
  const source = `merge_combine_source_${key}`;
  const survivor = `merge_combine_target_${key}`;
  const operator = `merge_combine_operator_${key}`;
  const league = `merge_combine_league_${key}`;
  const team = `merge_combine_team_${key}`;
  const game = `merge_combine_game_${key}`;
  const badge = `merge_combine_badge_${key}`;
  const eventAt = '2024-01-02T03:04:05.000Z';
  const playerId = `merge-device-${key}`;
  const q = (sql: string, params: unknown[] = []) => pool.query(sql, params);
  try {
    for (const [id, name] of [[source, 'Source'], [survivor, 'Survivor'], [operator, 'Operator']])
      await q('INSERT INTO users (id,email,first_name) VALUES ($1,$2,$3)', [id, `${id}@example.test`, name]);
    await q(`INSERT INTO leagues (id,name,unique_league_id,sport,commissioner_id)
      VALUES ($1,'Combination league',$2,'hockey',$3)`, [league, key.slice(0, 6), operator]);
    await q('INSERT INTO teams (id,name,league_id) VALUES ($1,$2,$3)', [team, 'Combination team', league]);
    await q(`INSERT INTO games (id,league_id,home_team_id,scheduled_at)
      VALUES ($1,$2,$3,NOW())`, [game, league, team]);
    for (const userId of [source, survivor]) {
      await q(`INSERT INTO league_memberships (user_id,league_id,status,requested_at)
        VALUES ($1,$2,'approved',$3)`, [userId, league, eventAt]);
      await q(`INSERT INTO game_attendance (game_id,team_id,user_id,created_at,updated_at)
        VALUES ($1,$2,$3,$4,$4)`, [game, team, userId, eventAt]);
      await q(`INSERT INTO game_rsvps (game_id,team_id,user_id,status,created_at,updated_at)
        VALUES ($1,$2,$3,'attending',$4,$4)`, [game, team, userId, eventAt]);
    }
    await q(`UPDATE league_memberships SET league_role='player_pro'
      WHERE user_id=$1 AND league_id=$2`, [source, league]);
    const changedPermissionPreview = await previewAccountUserMerge(source, survivor);
    assert.ok(changedPermissionPreview.blockers.some(blocker =>
      blocker.domain === 'league_memberships.permissions' || blocker.domain === 'league_memberships'));
    assert.ok(!changedPermissionPreview.combinable.some(record => record.domain === 'league_memberships'));
    await q(`UPDATE league_memberships SET league_role='free_tier'
      WHERE user_id=$1 AND league_id=$2`, [source, league]);
    await q(`INSERT INTO notification_preferences
      (user_id,onesignal_player_id,onesignal_external_id,notification_settings,push_enabled)
      VALUES ($1,$2,$3,'{"upcomingEvents":true}'::jsonb,true)`, [source, playerId, `display-${key}`]);
    await q(`INSERT INTO notification_preferences
      (user_id,onesignal_player_id,onesignal_external_id,notification_settings,push_enabled)
      VALUES ($1,$2,$3,'{"upcomingEvents":true}'::jsonb,true)`, [survivor, playerId, `display-${key}`]);

    await q(`INSERT INTO badge_definitions (id,slug,name,description,category,trigger_type,status)
      VALUES ($1,$2,'Merge badge','Test badge','achievement','manual','published')`,
    [badge, `merge-badge-${key}`]);
    for (const userId of [source, survivor]) {
      await q(`INSERT INTO badge_awards
        (badge_definition_id,user_id,scope_key,tier,count,source,metadata,awarded_at)
        VALUES ($1,$2,'global','bronze',1,'manual','{"proof":"same"}'::jsonb,$3)`,
      [badge, userId, eventAt]);
      await q(`INSERT INTO badge_progress
        (badge_definition_id,user_id,scope_key,progress,count,earned_tiers,current_tier,updated_at)
        VALUES ($1,$2,'global',4,4,ARRAY['bronze']::badge_tier[],'bronze',$3)`,
      [badge, userId, eventAt]);
    }
    await q(`INSERT INTO badge_earned_events
      (user_id,badge_award_id,badge_definition_id,event_type,payload)
      SELECT $1,id,$2,'earned','{"event":"preserve"}'::jsonb
      FROM badge_awards WHERE user_id=$1 AND badge_definition_id=$2`,
    [source, badge]);

    const preview = await previewAccountUserMerge(source, survivor);
    assert.deepEqual(preview.blockers, []);
    for (const domain of [
      'league_memberships', 'game_attendance', 'game_rsvps',
      'notification_preferences', 'badge_awards', 'badge_progress',
    ]) assert.ok(preview.combinable.some(record => record.domain === domain), `expected ${domain} combination`);

    await confirmAccountUserMerge(source, survivor, operator, preview.fingerprint);
    assert.equal((await q('SELECT count(*)::int AS count FROM league_memberships WHERE user_id=$1', [survivor])).rows[0].count, 1);
    assert.equal((await q('SELECT count(*)::int AS count FROM game_attendance WHERE game_id=$1', [game])).rows[0].count, 1);
    assert.equal((await q('SELECT count(*)::int AS count FROM game_rsvps WHERE game_id=$1', [game])).rows[0].count, 1);
    assert.equal((await q('SELECT onesignal_player_id FROM notification_preferences WHERE user_id=$1', [survivor])).rows[0].onesignal_player_id,
      playerId);
    assert.equal((await q('SELECT count(*)::int AS count FROM badge_awards WHERE user_id=$1', [survivor])).rows[0].count, 1);
    assert.equal((await q('SELECT count(*)::int AS count FROM badge_progress WHERE user_id=$1', [survivor])).rows[0].count, 1);
    const earnedEvent = (await q(`SELECT user_id,badge_award_id FROM badge_earned_events
      WHERE badge_definition_id=$1`, [badge])).rows[0];
    assert.equal(earnedEvent.user_id, survivor);
    assert.equal(earnedEvent.badge_award_id,
      (await q('SELECT id FROM badge_awards WHERE user_id=$1 AND badge_definition_id=$2', [survivor, badge])).rows[0].id);
  } finally {
    await q('DELETE FROM account_user_merges WHERE source_user_id=$1', [source]);
    await q('DELETE FROM badge_definitions WHERE id=$1', [badge]);
    await q('DELETE FROM game_rsvps WHERE game_id=$1', [game]);
    await q('DELETE FROM game_attendance WHERE game_id=$1', [game]);
    await q('DELETE FROM notification_preferences WHERE user_id=ANY($1::varchar[])', [[source, survivor]]);
    await q('DELETE FROM league_memberships WHERE league_id=$1', [league]);
    await q('DELETE FROM games WHERE id=$1', [game]);
    await q('DELETE FROM teams WHERE id=$1', [team]);
    await q('DELETE FROM leagues WHERE id=$1', [league]);
    await q('DELETE FROM users WHERE id=ANY($1::varchar[])', [[source, survivor, operator]]);
  }
});

test('account merge blocks notification provider IDs that cannot be relinked to the survivor', async () => {
  const key = randomUUID().replaceAll('-', '');
  const source = `merge_device_source_${key}`;
  const survivor = `merge_device_target_${key}`;
  const operator = `merge_device_operator_${key}`;
  const playerId = `merge-device-${key}`;
  const externalId = `merge-display-${key}`;
  const q = (sql: string, params: unknown[] = []) => pool.query(sql, params);
  try {
    for (const id of [source, survivor, operator])
      await q('INSERT INTO users (id,email) VALUES ($1,$2)', [id, `${id}@example.test`]);
    await q(`INSERT INTO notification_preferences
      (user_id,onesignal_player_id,onesignal_external_id,notification_settings,push_enabled)
      VALUES ($1,$2,$3,'{"upcomingEvents":true}'::jsonb,true)`, [source, playerId, externalId]);
    await q(`INSERT INTO notification_preferences
      (user_id,notification_settings,push_enabled)
      VALUES ($1,'{"upcomingEvents":true}'::jsonb,true)`, [survivor]);

    const preview = await previewAccountUserMerge(source, survivor);
    const blocker = preview.blockers.find(item => item.domain === 'notification_preferences');
    assert.ok(blocker);
    assert.match(blocker.reason, /Relink the provider identity/);
    assert.ok(!preview.combinable.some(record => record.domain === 'notification_preferences'));
    await assert.rejects(
      confirmAccountUserMerge(source, survivor, operator, preview.fingerprint),
      /Relink the provider identity/,
    );
    const retained = (await q(`SELECT onesignal_player_id,onesignal_external_id
      FROM notification_preferences WHERE user_id=$1`, [source])).rows[0];
    assert.equal(retained.onesignal_player_id, playerId);
    assert.equal(retained.onesignal_external_id, externalId);
    assert.equal((await q('SELECT deleted_at FROM users WHERE id=$1', [source])).rows[0].deleted_at, null);
  } finally {
    await q('DELETE FROM account_user_merges WHERE source_user_id=$1', [source]);
    await q('DELETE FROM notification_preferences WHERE user_id=ANY($1::varchar[])', [[source, survivor]]);
    await q('DELETE FROM users WHERE id=ANY($1::varchar[])', [[source, survivor, operator]]);
  }
});

test('account merge preview blocks provider purchase claims and preserves them on rejection', async () => {
  const key = randomUUID().replaceAll('-', '');
  const ids = [`merge_claim_source_${key}`, `merge_claim_target_${key}`, `merge_claim_operator_${key}`];
  const token = key.padEnd(64, 'a').slice(0, 64);
  const paymentRequest = `merge_claim_payment_${key}`;
  const q = (sql: string, params: unknown[] = []) => pool.query(sql, params);
  try {
    for (let i = 0; i < ids.length; i++)
      await q('INSERT INTO users (id,email,first_name) VALUES ($1,$2,$3)',
        [ids[i], `${ids[i]}@example.test`, `User ${i}`]);
    await q('INSERT INTO google_iap_claims (token_hash,user_id) VALUES ($1,$2)', [token, ids[0]]);
    await q(`INSERT INTO payment_requests (id,creator_id,title,amount_per_person)
      VALUES ($1,$2,'Paid merge invoice',10)`, [paymentRequest, ids[2]]);
    await q(`INSERT INTO payment_request_recipients
      (payment_request_id,user_id,is_paid,is_confirmed) VALUES ($1,$2,true,true)`, [paymentRequest, ids[0]]);
    const preview = await previewAccountUserMerge(ids[0], ids[1]);
    assert.ok(preview.blockers.some(blocker => blocker.domain.startsWith('google_iap_claims.')));
    assert.ok(preview.blockers.some(blocker => blocker.domain === 'payment_request_recipients.settled'));
    await assert.rejects(
      confirmAccountUserMerge(ids[0], ids[1], ids[2], preview.fingerprint),
      /Merge blocked/,
    );
    assert.equal((await q('SELECT user_id FROM google_iap_claims WHERE token_hash=$1', [token])).rows[0].user_id, ids[0]);
    assert.equal((await q('SELECT deleted_at FROM users WHERE id=$1', [ids[0]])).rows[0].deleted_at, null);
  } finally {
    await q('DELETE FROM google_iap_claims WHERE token_hash=$1', [token]);
    await q('DELETE FROM payment_request_recipients WHERE payment_request_id=$1', [paymentRequest]);
    await q('DELETE FROM payment_requests WHERE id=$1', [paymentRequest]);
    await q('DELETE FROM account_user_merges WHERE source_user_id=$1', [ids[0]]);
    await q('DELETE FROM users WHERE id=ANY($1::varchar[])', [ids]);
  }
});

test('account merge blocks exact user IDs in non-FK varchar references', async () => {
  const key = randomUUID().replaceAll('-', '');
  const ids = [`merge_text_source_${key}`, `merge_text_target_${key}`, `merge_text_operator_${key}`];
  const q = (sql: string, params: unknown[] = []) => pool.query(sql, params);
  try {
    for (let i = 0; i < ids.length; i++)
      await q('INSERT INTO users (id,email,first_name) VALUES ($1,$2,$3)',
        [ids[i], `${ids[i]}@example.test`, `User ${i}`]);
    // created_by is currently free-form varchar rather than a declared FK.
    await q('UPDATE users SET created_by=$2 WHERE id=$1', [ids[2], ids[0]]);
    const preview = await previewAccountUserMerge(ids[0], ids[1]);
    assert.ok(preview.blockers.some(blocker => blocker.domain === 'users.created_by'));
    await assert.rejects(
      confirmAccountUserMerge(ids[0], ids[1], ids[2], preview.fingerprint),
      /Merge blocked/,
    );
    assert.equal((await q('SELECT created_by FROM users WHERE id=$1', [ids[2]])).rows[0].created_by, ids[0]);
    assert.equal((await q('SELECT deleted_at FROM users WHERE id=$1', [ids[0]])).rows[0].deleted_at, null);
  } finally {
    await q('DELETE FROM account_user_merges WHERE source_user_id=$1', [ids[0]]);
    await q('DELETE FROM users WHERE id=ANY($1::varchar[])', [ids]);
  }
});

test('retired-account trigger rejects auth-style upsert/reactivation while survivor remains usable', async () => {
  const key = randomUUID().replaceAll('-', '');
  const source = `merge_retired_source_${key}`;
  const survivor = `merge_retired_survivor_${key}`;
  const operator = `merge_retired_operator_${key}`;
  const q = (sql: string, params: unknown[] = []) => pool.query(sql, params);
  try {
    for (const [id, name] of [[source, 'Source'], [survivor, 'Survivor'], [operator, 'Operator']])
      await q('INSERT INTO users (id,email,first_name) VALUES ($1,$2,$3)', [id, `${id}@example.test`, name]);
    const preview = await previewAccountUserMerge(source, survivor);
    await confirmAccountUserMerge(source, survivor, operator, preview.fingerprint);

    await assert.rejects(q(`INSERT INTO users (id,email,first_name) VALUES ($1,$2,$3)
      ON CONFLICT (id) DO UPDATE SET deleted_at=NULL,first_name=EXCLUDED.first_name`,
    [source, `${source}@example.test`, 'Attempted resurrection']), /Retired account cannot be reactivated/);
    assert.notEqual((await q('SELECT deleted_at FROM users WHERE id=$1', [source])).rows[0].deleted_at, null);

    // A regular upsert for the live survivor is not rejected by the retirement trigger.
    await q(`INSERT INTO users (id,email,first_name) VALUES ($1,$2,$3)
      ON CONFLICT (id) DO UPDATE SET first_name=EXCLUDED.first_name`,
    [survivor, `${survivor}@example.test`, 'Survivor remains usable']);
    const liveSurvivor = (await q('SELECT first_name,deleted_at FROM users WHERE id=$1', [survivor])).rows[0];
    assert.equal(liveSurvivor.first_name, 'Survivor remains usable');
    assert.equal(liveSurvivor.deleted_at, null);
  } finally {
    await q('DELETE FROM account_user_merges WHERE source_user_id=$1', [source]);
    await q('DELETE FROM users WHERE id=ANY($1::varchar[])', [[source, survivor, operator]]);
  }
});

test('SQL constraint failure after an earlier reference update rolls back the whole merge', async () => {
  const key = randomUUID().replaceAll('-', '');
  const source = `merge_rollback_source_${key}`;
  const survivor = `merge_rollback_target_${key}`;
  const operator = `merge_rollback_operator_${key}`;
  const checkName = `merge_rollback_check_${key}`;
  const escapedSurvivor = survivor.replaceAll("'", "''");
  const q = (sql: string, params: unknown[] = []) => pool.query(sql, params);
  try {
    for (const [id, name] of [[source, 'Source'], [survivor, 'Survivor'], [operator, 'Operator']])
      await q('INSERT INTO users (id,email,first_name) VALUES ($1,$2,$3)', [id, `${id}@example.test`, name]);
    await q(`INSERT INTO birthday_greetings (user_id,birthday_date,popup_dismissed_at)
      VALUES ($1,'2000-03-04',NOW())`, [source]);
    await q(`INSERT INTO personal_reminders (user_id,title,scheduled_at)
      VALUES ($1,'Rollback reminder',NOW())`, [source]);
    const preview = await previewAccountUserMerge(source, survivor);
    assert.deepEqual(preview.blockers, []);

    // This NOT VALID check permits the existing source row, but rejects its
    // reassignment. Catalog ordering updates birthday_greetings first, so this
    // deliberately fails after one merge write and proves transaction rollback.
    await q(`ALTER TABLE personal_reminders ADD CONSTRAINT "${checkName}"
      CHECK (user_id <> '${escapedSurvivor}') NOT VALID`);
    await assert.rejects(
      confirmAccountUserMerge(source, survivor, operator, preview.fingerprint),
      new RegExp(checkName),
    );

    assert.equal((await q(`SELECT user_id FROM birthday_greetings
      WHERE birthday_date='2000-03-04' AND user_id=$1`, [source])).rows.length, 1);
    assert.equal((await q(`SELECT user_id FROM birthday_greetings
      WHERE birthday_date='2000-03-04' AND user_id=$1`, [survivor])).rows.length, 0);
    assert.equal((await q(`SELECT user_id FROM personal_reminders
      WHERE title='Rollback reminder' AND user_id=$1`, [source])).rows.length, 1);
    assert.equal((await q('SELECT deleted_at FROM users WHERE id=$1', [source])).rows[0].deleted_at, null);
    assert.equal((await q('SELECT count(*)::int AS count FROM account_user_merges WHERE source_user_id=$1',
      [source])).rows[0].count, 0);
  } finally {
    await q(`ALTER TABLE personal_reminders DROP CONSTRAINT IF EXISTS "${checkName}"`);
    await q('DELETE FROM birthday_greetings WHERE user_id=ANY($1::varchar[])', [[source, survivor]]);
    await q('DELETE FROM personal_reminders WHERE user_id=ANY($1::varchar[])', [[source, survivor]]);
    await q('DELETE FROM account_user_merges WHERE source_user_id=$1', [source]);
    await q('DELETE FROM users WHERE id=ANY($1::varchar[])', [[source, survivor, operator]]);
  }
});
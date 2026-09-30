import { pool } from './db';
import type { PoolClient } from '@neondatabase/serverless';
import { z } from 'zod';

export type MergeIdentity = { type: 'user' | 'placeholder' | 'imported'; id: string };
export class PlayerMergeConflict extends Error {}
export const leagueMergeDialogIdentitySchema = z.object({ type: z.literal('user'), id: z.string().min(1) });
export const leagueMergeDialogPreviewSchema = z.object({
  source: leagueMergeDialogIdentitySchema, survivor: leagueMergeDialogIdentitySchema,
});
export const leagueMergeDialogConfirmSchema = z.object({
  source: leagueMergeDialogIdentitySchema, survivorId: z.string().min(1), acknowledgeIdentity: z.literal(true),
});

const query = (client: PoolClient, text: string, params: unknown[] = []) => client.query(text, params);

/** Candidates for the commissioner dialog are active U accounts in this league only. */
export async function findLeagueMergeCandidates(leagueId: string, search = '') {
  const term = search.trim().slice(0, 100);
  const { rows } = await pool.query(`
    SELECT 'user' AS type, u.id, u.display_id AS "displayId",
      concat_ws(' ', coalesce(lm.display_first_name, u.first_name), coalesce(lm.display_last_name, u.last_name)) AS name,
      u.email, 'account' AS "identityKind", true AS "canSurvive"
    FROM league_memberships lm JOIN users u ON u.id=lm.user_id
    WHERE lm.league_id=$1 AND u.deleted_at IS NULL AND u.email IS NOT NULL
      AND u.email NOT ILIKE '%@placeholder.roster' AND u.display_id ~ '^U[0-9]{5}$'
      AND ($2='' OR concat_ws(' ', coalesce(lm.display_first_name, u.first_name), coalesce(lm.display_last_name, u.last_name)) ILIKE '%' || $2 || '%'
        OR u.email ILIKE '%' || $2 || '%' OR upper(u.display_id)=upper($2) OR u.id=$2)
    ORDER BY CASE WHEN upper(u.display_id)=upper($2) THEN 0 ELSE 1 END, name, u.id LIMIT 100`, [leagueId, term]);
  return rows;
}

export async function previewLeaguePlayerMerge(leagueId: string, identity: MergeIdentity, allowNonDialogUser = false) {
  if (identity.type !== 'user') throw new PlayerMergeConflict('Select a user account with a U ID in this league.');
  const candidates = await findLeagueMergeCandidates(leagueId);
  // Search by exact ID separately: the capped list should never hide an explicitly selected identity.
  let match = candidates.find(c => c.id === identity.id)
    || (await findLeagueMergeCandidates(leagueId, identity.id)).find(c => c.id === identity.id);
  // The separate replacement workflow may review an older users row without a U ID.
  if (!match && allowNonDialogUser) {
    const { rows } = await pool.query(`
      SELECT 'user' AS type, u.id, u.display_id AS "displayId",
        concat_ws(' ', coalesce(lm.display_first_name, u.first_name), coalesce(lm.display_last_name, u.last_name)) AS name,
        u.email, CASE WHEN u.email ILIKE '%@placeholder.roster' THEN 'legacy' ELSE 'account' END AS "identityKind",
        (u.email IS NOT NULL AND u.email NOT ILIKE '%@placeholder.roster') AS "canSurvive"
      FROM users u JOIN league_memberships lm ON lm.user_id=u.id
      WHERE lm.league_id=$1 AND u.id=$2 AND u.deleted_at IS NULL
      `, [leagueId, identity.id]);
    match = rows[0];
  }
  if (!match) throw new PlayerMergeConflict('This player is no longer available in this league. Refresh the search.');
  const user = identity.id;
  const { rows: seasons } = await pool.query(`
    SELECT s.name, ps.games_played AS games, ps.goals, ps.assists, ps.penalty_minutes AS penalties
    FROM player_stats ps LEFT JOIN seasons s ON s.id=ps.season_id
    WHERE ps.league_id=$1 AND ps.user_id=$2
    ORDER BY s.name`, [leagueId, user]);
  const { rows: teams } = await pool.query(`
    SELECT DISTINCT t.name FROM teams t
    JOIN team_memberships tm ON tm.team_id=t.id AND tm.user_id=$2
    WHERE t.league_id=$1 ORDER BY t.name`, [leagueId, user]);
  const { rows: [history] } = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM game_goals gg JOIN games g ON g.id=gg.game_id WHERE g.league_id=$1 AND $2::text IN (gg.scorer_id, gg.primary_assist_id, gg.secondary_assist_id)) AS goals,
      (SELECT count(*)::int FROM game_penalties gp JOIN games g ON g.id=gp.game_id WHERE g.league_id=$1 AND gp.player_id=$2) AS penalties,
      (SELECT count(*)::int FROM game_goalies gl JOIN games g ON g.id=gl.game_id WHERE g.league_id=$1 AND gl.goalie_user_id=$2) AS goalie,
      (SELECT count(*)::int FROM game_stars gs JOIN games g ON g.id=gs.game_id WHERE g.league_id=$1 AND $2::text IN (gs.first_star_user_id,gs.second_star_user_id,gs.third_star_user_id)) AS stars,
       (SELECT count(*)::int FROM game_attendance a JOIN games g ON g.id=a.game_id WHERE g.league_id=$1 AND a.user_id=$2) AS attendance,
      (SELECT count(*)::int FROM game_rsvps r JOIN games g ON g.id=r.game_id WHERE g.league_id=$1 AND r.user_id=$2) AS rsvps`,
    [leagueId, user]);
  return { ...match, seasons, teams: teams.map(t => t.name), history };
}

/**
 * All changes are made under a per-league transaction lock. Never delete a user:
 * other leagues, authentication, subscriptions and global activity remain theirs.
 */
export async function mergeLeaguePlayer(
  leagueId: string, commissionerId: string, source: MergeIdentity, survivorId: string,
  preserveLeagueDisplayName = false,
  dialogUsersOnly = false,
) {
  if (dialogUsersOnly && source.type !== 'user') throw new PlayerMergeConflict('Select a user account with a U ID in this league.');
  if (source.type === 'user' && source.id === survivorId) throw new PlayerMergeConflict('Select two different player profiles.');
  const client = await pool.connect();
  const run = (sql: string, params: unknown[] = []) => query(client, sql, params);
  const leagueGame = `game_id IN (SELECT id FROM games WHERE league_id=$3)`;
  const move = async (table: string, column: string, scope: string, from: string) =>
    run(`UPDATE ${table} SET ${column}=$2 WHERE ${column}=$1 AND ${scope}`, [from, survivorId, leagueId]);
  try {
    await run('BEGIN');
    await run('SELECT pg_advisory_xact_lock(hashtext($1))', [`league-player-merge:${leagueId}`]);
    const league = await run('SELECT commissioner_id FROM leagues WHERE id=$1 FOR UPDATE', [leagueId]);
    if (league.rows[0]?.commissioner_id !== commissionerId) throw new PlayerMergeConflict('Only the league commissioner can merge players.');
    const target = await run(`SELECT id FROM users WHERE id=$1 AND deleted_at IS NULL AND email IS NOT NULL
      AND email NOT ILIKE '%@placeholder.roster'
      ${dialogUsersOnly ? `AND display_id ~ '^U[0-9]{5}$'
        AND EXISTS (SELECT 1 FROM league_memberships WHERE league_id=$2 AND user_id=users.id)` : ''}
      FOR UPDATE`, dialogUsersOnly ? [survivorId, leagueId] : [survivorId]);
    if (!target.rowCount) throw new PlayerMergeConflict('The surviving profile must be an active registered account.');
    const sourceScope = source.type === 'user'
      ? `EXISTS (SELECT 1 FROM league_memberships WHERE league_id=$2 AND user_id=$1)`
      : source.type === 'placeholder'
        ? `EXISTS (SELECT 1 FROM placeholder_players p LEFT JOIN teams t ON t.id=p.team_id WHERE p.id=$1 AND coalesce(p.league_id,t.league_id)=$2)`
        : `EXISTS (SELECT 1 FROM imported_players WHERE id=$1 AND league_id=$2 AND merged_with_user_id IS NULL)`;
    if (!(await run(`SELECT ${sourceScope} AS valid`, [source.id, leagueId])).rows[0].valid)
      throw new PlayerMergeConflict('The source has already been merged or is not in this league. Refresh the search.');
    if (source.type === 'placeholder') {
      // Match the lock used by sign-in placeholder reconciliation before reading its row.
      await run('SELECT pg_advisory_xact_lock(hashtext($1))', [`claim-placeholders:${survivorId}`]);
      const locked = await run('SELECT id FROM placeholder_players WHERE id=$1 FOR UPDATE', [source.id]);
      if (!locked.rowCount) throw new PlayerMergeConflict('This roster entry was claimed during review. Refresh the search.');
    }
    if (source.type === 'user') {
      const sourceUser = await run(`SELECT id FROM users WHERE id=$1 AND deleted_at IS NULL
        ${dialogUsersOnly ? `AND email IS NOT NULL AND email NOT ILIKE '%@placeholder.roster'
          AND display_id ~ '^U[0-9]{5}$'` : ''} FOR UPDATE`, [source.id]);
      if (!sourceUser.rowCount) throw new PlayerMergeConflict('The source profile is no longer active.');
      const owner = await run('SELECT 1 FROM leagues WHERE id=$1 AND commissioner_id=$2', [leagueId, source.id]);
      if (owner.rowCount) throw new PlayerMergeConflict('Transfer league ownership before merging the commissioner profile.');
      // Non-player activity is not part of a player-history transfer. An audit
      // before any write prevents leaving references on a retired roster entry.
      const unsupported = await run(`SELECT
        (SELECT count(*) FROM substitution_approvals a JOIN substitute_requests r ON r.id=a.substitution_request_id
          LEFT JOIN games g ON g.id=r.game_id LEFT JOIN team_events e ON e.id=r.team_event_id
          LEFT JOIN teams t ON t.id=e.team_id
          WHERE (g.league_id=$2 OR t.league_id=$2) AND a.approver_id=$1)
        +(SELECT count(*) FROM announcement_reactions x JOIN announcements a ON a.id=x.announcement_id WHERE a.league_id=$2 AND x.user_id=$1)
        +(SELECT count(*) FROM announcement_read_status x JOIN announcements a ON a.id=x.announcement_id WHERE a.league_id=$2 AND x.user_id=$1)
        +(SELECT count(*) FROM announcement_visibility x JOIN announcements a ON a.id=x.announcement_id WHERE a.league_id=$2 AND x.user_id=$1)
        +(SELECT count(*) FROM announcement_poll_votes x JOIN announcement_polls p ON p.id=x.poll_id
          JOIN announcements a ON a.id=p.announcement_id WHERE a.league_id=$2 AND x.user_id=$1)
        +(SELECT count(*) FROM announcement_comments x JOIN announcements a ON a.id=x.announcement_id WHERE a.league_id=$2 AND x.author_id=$1)
        +(SELECT count(*) FROM announcements WHERE league_id=$2 AND author_id=$1)
        +(SELECT count(*) FROM league_invites_sent WHERE league_id=$2 AND user_id=$1)
        +(SELECT count(*) FROM badge_awards WHERE league_id=$2 AND user_id=$1)
        +(SELECT count(*) FROM player_merge_requests WHERE league_id=$2 AND existing_user_id=$1)
        +(SELECT count(*) FROM duty_assignments x JOIN teams t ON t.id=x.team_id WHERE t.league_id=$2 AND x.user_id=$1)
        +(SELECT count(*) FROM invite_group_members x JOIN invite_groups g ON g.id=x.group_id WHERE g.league_id=$2 AND x.user_id=$1)
        +(SELECT count(*) FROM scrimmage_co_hosts x JOIN scrimmages s ON s.id=x.scrimmage_id WHERE s.league_id=$2 AND x.user_id=$1)
        +(SELECT count(*) FROM scrimmage_invites x JOIN scrimmages s ON s.id=x.scrimmage_id WHERE s.league_id=$2 AND x.user_id=$1)
        +(SELECT count(*) FROM scrimmage_reminders_sent x JOIN scrimmages s ON s.id=x.scrimmage_id WHERE s.league_id=$2 AND x.player_id=$1)
        AS count`, [source.id, leagueId]);
      if (Number(unsupported.rows[0].count)) throw new PlayerMergeConflict(
        'The source has league approvals, announcements, invites, duties, reminders or badges that cannot safely be combined. Resolve those records before merging.',
      );
      const duplicateSeat = await run(`SELECT 1 FROM league_pro_seats a JOIN league_pro_seats b ON b.grant_id=a.grant_id
        WHERE a.league_id=$3 AND a.user_id=$1 AND b.user_id=$2 LIMIT 1`, [source.id, survivorId, leagueId]);
      if (duplicateSeat.rowCount) throw new PlayerMergeConflict('Both profiles hold a paid Player Pro seat on the same grant. Resolve the duplicate seat before merging.');
    }
    const from = source.id;
    const sourceColumn = source.type === 'user' ? 'user_id' : 'imported_player_id';
    if (source.type !== 'placeholder') {
      const stats = await run(`SELECT * FROM player_stats WHERE ${sourceColumn}=$1 AND league_id=$2 FOR UPDATE`, [from, leagueId]);
      for (const row of stats.rows) {
        const existing = await run(`SELECT * FROM player_stats WHERE user_id=$1 AND league_id=$2
          AND season_id IS NOT DISTINCT FROM $3 FOR UPDATE`, [survivorId, leagueId, row.season_id]);
        if (existing.rows.length > 1) throw new PlayerMergeConflict('The surviving account has duplicate season totals. Reconcile them before merging.');
        if (existing.rowCount) {
          // Goals/assists/penalties represent separate attributed events; GP is
          // de-duplicated for games where both identities have confirmed attendance.
          const overlap = source.type === 'user' ? await run(`SELECT count(DISTINCT game_id)::int AS count FROM (
            SELECT a.game_id FROM game_attendance a JOIN game_attendance b ON b.game_id=a.game_id
              WHERE a.user_id=$1 AND b.user_id=$2
            UNION
            SELECT a.game_id FROM game_rsvps a JOIN game_rsvps b ON b.game_id=a.game_id
              WHERE a.user_id=$1 AND b.user_id=$2 AND a.status='attending' AND b.status='attending'
          ) both JOIN games g ON g.id=both.game_id
          WHERE g.league_id=$3 AND g.season_id IS NOT DISTINCT FROM $4`,
            [from, survivorId, leagueId, row.season_id])
            : { rows: [{ count: 0 }] };
          const dest = existing.rows[0];
          await run(`UPDATE player_stats SET games_played=$2, goals=$3, assists=$4,
            penalty_minutes=$5, updated_at=NOW() WHERE id=$1`, [
            dest.id, Math.max(dest.games_played, dest.games_played + row.games_played - overlap.rows[0].count),
            dest.goals + row.goals, dest.assists + row.assists, dest.penalty_minutes + row.penalty_minutes,
          ]);
          await run('DELETE FROM player_stats WHERE id=$1', [row.id]);
        } else await run('UPDATE player_stats SET user_id=$2, imported_player_id=NULL WHERE id=$1', [row.id, survivorId]);
      }
    }
    if (source.type === 'user') {
      const clashes = await run(`SELECT 1 FROM game_stars s JOIN games g ON g.id=s.game_id
        WHERE g.league_id=$3 AND $1 IN (s.first_star_user_id,s.second_star_user_id,s.third_star_user_id)
          AND $2 IN (s.first_star_user_id,s.second_star_user_id,s.third_star_user_id) LIMIT 1`,
        [from, survivorId, leagueId]);
      if (clashes.rowCount) throw new PlayerMergeConflict('Both profiles received stars in the same game. Review that game before merging.');
      const duplicatedStar = await run(`SELECT 1 FROM game_stars s JOIN games g ON g.id=s.game_id
        WHERE g.league_id=$2 AND
        ((s.first_star_user_id=$1 AND (s.second_star_user_id=$1 OR s.third_star_user_id=$1))
         OR (s.second_star_user_id=$1 AND s.third_star_user_id=$1)) LIMIT 1`, [from, leagueId]);
      if (duplicatedStar.rowCount) throw new PlayerMergeConflict('The source appears in multiple star positions in one game. Fix the stars before merging.');
      const duplicatePositions = await run(`SELECT 1 FROM line_combination_assignments a
        JOIN line_combination_assignments b ON b.line_combination_id=a.line_combination_id
        JOIN line_combinations lc ON lc.id=a.line_combination_id JOIN teams t ON t.id=lc.team_id
        WHERE t.league_id=$3 AND a.player_id=$1 AND b.player_id=$2 LIMIT 1`,
        [from, survivorId, leagueId]);
      if (duplicatePositions.rowCount) throw new PlayerMergeConflict('Both players are assigned to the same line. Resolve the lineup first.');
      const draftClash = await run(`SELECT 1 FROM draft_picks a JOIN draft_picks b ON b.draft_id=a.draft_id
        JOIN drafts d ON d.id=a.draft_id WHERE d.league_id=$3 AND a.player_id=$1 AND b.player_id=$2 LIMIT 1`,
        [from, survivorId, leagueId]);
      if (draftClash.rowCount) throw new PlayerMergeConflict('Both players have picks in the same draft. Resolve the draft first.');
      const keeperClash = await run(`SELECT 1 FROM draft_keepers a JOIN draft_keepers b ON b.draft_id=a.draft_id
        JOIN drafts d ON d.id=a.draft_id WHERE d.league_id=$3 AND a.user_id=$1 AND b.user_id=$2 LIMIT 1`,
        [from, survivorId, leagueId]);
      if (keeperClash.rowCount) throw new PlayerMergeConflict('Both players are keepers in the same draft. Resolve the keepers first.');
      const buddyPair = await run(`SELECT 1 FROM draft_buddy_pairs p JOIN drafts d ON d.id=p.draft_id
        WHERE d.league_id=$2 AND $1=ANY(p.user_ids) LIMIT 1`, [from, leagueId]);
      if (buddyPair.rowCount) throw new PlayerMergeConflict('The source is in a draft buddy pair. Remove or reassign that pair before merging.');
      const draftConfig = await run(`SELECT 1 FROM drafts WHERE league_id=$2 AND
        (coalesce(player_notes,'{}'::jsonb) ? $1 OR coalesce(goalie_assignments,'{}'::jsonb)::text LIKE '%' || $1 || '%'
         OR coalesce(captain_assignments,'{}'::jsonb)::text LIKE '%' || $1 || '%') LIMIT 1`, [from, leagueId]);
      if (draftConfig.rowCount) throw new PlayerMergeConflict('The source appears in draft setup. Resolve the draft setup before merging.');
      const goalieClash = await run(`SELECT 1 FROM game_goalies a JOIN game_goalies b ON b.game_id=a.game_id
        JOIN games g ON g.id=a.game_id WHERE g.league_id=$3 AND a.goalie_user_id=$1 AND b.goalie_user_id=$2 LIMIT 1`,
        [from, survivorId, leagueId]);
      if (goalieClash.rowCount) throw new PlayerMergeConflict('Both profiles played goalie in the same game. Resolve that game first.');
      const rsvpClashes = await run(`SELECT 1 FROM game_rsvps a JOIN game_rsvps b
        ON a.game_id=b.game_id AND a.team_id=b.team_id JOIN games g ON g.id=a.game_id
        WHERE g.league_id=$3 AND a.user_id=$1 AND b.user_id=$2
        AND a.status<>b.status AND a.status<>'no_response' AND b.status<>'no_response' LIMIT 1`,
        [from, survivorId, leagueId]);
      if (rsvpClashes.rowCount) throw new PlayerMergeConflict('The profiles have conflicting RSVPs for a game. Resolve the RSVP before merging.');
      // Existing survivor RSVP wins except when it is an unanswered placeholder.
      await run(`UPDATE game_rsvps b SET status=a.status, updated_at=a.updated_at
        FROM game_rsvps a, games g WHERE a.game_id=g.id AND g.league_id=$3
        AND a.user_id=$1 AND b.user_id=$2 AND b.game_id=a.game_id AND b.team_id=a.team_id
        AND b.status='no_response'`, [from, survivorId, leagueId]);
      await run(`DELETE FROM game_rsvps a USING game_rsvps b, games g WHERE a.game_id=g.id
        AND g.league_id=$3 AND a.user_id=$1 AND b.user_id=$2 AND b.game_id=a.game_id AND b.team_id=a.team_id`,
        [from, survivorId, leagueId]);
      await move('game_rsvps', 'user_id', leagueGame, from);
    }
    if (source.type !== 'imported') {
      const attendanceCol = source.type === 'user' ? 'user_id' : 'placeholder_player_id';
      await run(`DELETE FROM game_attendance a USING game_attendance b, games g
        WHERE a.game_id=g.id AND g.league_id=$3 AND a.${attendanceCol}=$1
        AND b.game_id=a.game_id AND b.user_id=$2`, [from, survivorId, leagueId]);
      await run(`UPDATE game_attendance SET user_id=$2, placeholder_player_id=NULL
        WHERE ${attendanceCol}=$1 AND ${leagueGame}`, [from, survivorId, leagueId]);
    }
    if (source.type === 'user') {
      for (const [table, column] of [
        ['game_goals','scorer_id'], ['game_goals','primary_assist_id'], ['game_goals','secondary_assist_id'],
        ['game_penalties','player_id'], ['game_goalies','goalie_user_id'],
        ['game_stars','first_star_user_id'], ['game_stars','second_star_user_id'], ['game_stars','third_star_user_id'],
      ]) await move(table, column, leagueGame, from);
      for (const [table, column] of [
        ['draft_picks','player_id'], ['draft_keepers','user_id'],
      ]) await move(table, column, 'draft_id IN (SELECT id FROM drafts WHERE league_id=$3)', from);
      await move('line_combination_assignments', 'player_id',
        'line_combination_id IN (SELECT lc.id FROM line_combinations lc JOIN teams t ON t.id=lc.team_id WHERE t.league_id=$3)', from);
      for (const column of ['home_beverage_duty_user_id', 'away_beverage_duty_user_id'])
        await move('games', column, 'league_id=$3', from);
      await move('game_score_submissions', 'submitted_by', leagueGame, from);
      const beerClash = await run(`SELECT 1 FROM game_beer_counts a JOIN game_beer_counts b ON b.game_id=a.game_id
        JOIN games g ON g.id=a.game_id WHERE g.league_id=$3 AND a.user_id=$1 AND b.user_id=$2 LIMIT 1`,
        [from, survivorId, leagueId]);
      if (beerClash.rowCount) throw new PlayerMergeConflict('Both profiles have a beer count for the same game. Resolve it before merging.');
      await move('game_beer_counts', 'user_id', leagueGame, from);
      for (const column of ['original_player_id', 'substitute_player_id', 'requested_by'])
        await move('substitute_requests', column,
          `(game_id IN (SELECT id FROM games WHERE league_id=$3)
            OR team_event_id IN (SELECT e.id FROM team_events e JOIN teams t ON t.id=e.team_id WHERE t.league_id=$3))`, from);
      await move('teams', 'captain_id', 'league_id=$3', from);
      const scrimmageClash = await run(`SELECT 1 FROM scrimmage_requests a JOIN scrimmage_requests b
        ON b.scrimmage_id=a.scrimmage_id JOIN scrimmages s ON s.id=a.scrimmage_id
        WHERE s.league_id=$3 AND a.player_id=$1 AND b.player_id=$2 LIMIT 1`, [from, survivorId, leagueId]);
      if (scrimmageClash.rowCount) throw new PlayerMergeConflict('Both profiles have a request for the same scrimmage. Resolve it before merging.');
      await move('scrimmage_requests', 'player_id', 'scrimmage_id IN (SELECT id FROM scrimmages WHERE league_id=$3)', from);
      const teamEventClash = await run(`SELECT 1 FROM team_event_rsvps a JOIN team_event_rsvps b
        ON b.team_event_id=a.team_event_id JOIN team_events e ON e.id=a.team_event_id
        JOIN teams t ON t.id=e.team_id WHERE t.league_id=$3 AND a.user_id=$1 AND b.user_id=$2
          AND a.status<>b.status AND a.status<>'no_response' AND b.status<>'no_response' LIMIT 1`,
        [from, survivorId, leagueId]);
      if (teamEventClash.rowCount) throw new PlayerMergeConflict('The profiles have conflicting team-event RSVPs. Resolve them first.');
      await run(`DELETE FROM team_event_rsvps a USING team_event_rsvps b, team_events e, teams t
        WHERE a.team_event_id=e.id AND e.team_id=t.id AND t.league_id=$3
          AND a.user_id=$1 AND b.user_id=$2 AND b.team_event_id=a.team_event_id
          AND (b.status<>'no_response' OR a.status='no_response')`, [from, survivorId, leagueId]);
      await run(`DELETE FROM team_event_rsvps b USING team_event_rsvps a, team_events e, teams t
        WHERE a.team_event_id=e.id AND e.team_id=t.id AND t.league_id=$3
          AND a.user_id=$1 AND b.user_id=$2 AND b.team_event_id=a.team_event_id`,
        [from, survivorId, leagueId]);
      await move('team_event_rsvps', 'user_id',
        'team_event_id IN (SELECT e.id FROM team_events e JOIN teams t ON t.id=e.team_id WHERE t.league_id=$3)', from);
    } else if (source.type === 'placeholder') {
      const overlappingDraft = await run(`SELECT 1 FROM draft_picks p JOIN draft_picks b ON b.draft_id=p.draft_id
        JOIN drafts d ON d.id=p.draft_id WHERE d.league_id=$3 AND p.placeholder_player_id=$1 AND b.player_id=$2 LIMIT 1`,
        [from, survivorId, leagueId]);
      if (overlappingDraft.rowCount) throw new PlayerMergeConflict('Both profiles have picks in the same draft. Resolve the draft first.');
      const overlappingKeepers = await run(`SELECT 1 FROM draft_keepers a JOIN draft_keepers b ON b.draft_id=a.draft_id
        JOIN drafts d ON d.id=a.draft_id WHERE d.league_id=$3
          AND a.placeholder_player_id IN ($1, 'placeholder:' || $1) AND b.user_id=$2 LIMIT 1`,
        [from, survivorId, leagueId]);
      if (overlappingKeepers.rowCount) throw new PlayerMergeConflict('Both profiles are keepers in the same draft. Resolve the keepers first.');
      const overlappingLines = await run(`SELECT 1 FROM line_combination_assignments a
        JOIN line_combination_assignments b ON b.line_combination_id=a.line_combination_id
        JOIN line_combinations lc ON lc.id=a.line_combination_id JOIN teams t ON t.id=lc.team_id
        WHERE t.league_id=$3 AND a.placeholder_player_id=$1 AND b.player_id=$2 LIMIT 1`,
        [from, survivorId, leagueId]);
      if (overlappingLines.rowCount) throw new PlayerMergeConflict('Both profiles are assigned to the same line. Resolve the lineup first.');
      await run(`UPDATE draft_picks SET player_id=$2, placeholder_player_id=NULL
        WHERE placeholder_player_id=$1 AND draft_id IN (SELECT id FROM drafts WHERE league_id=$3)`,
        [from, survivorId, leagueId]);
      await run(`UPDATE draft_keepers SET user_id=$2, placeholder_player_id=NULL
        WHERE placeholder_player_id IN ($1, 'placeholder:' || $1)
          AND draft_id IN (SELECT id FROM drafts WHERE league_id=$3)`, [from, survivorId, leagueId]);
      await run(`UPDATE line_combination_assignments SET player_id=$2, placeholder_player_id=NULL
        WHERE placeholder_player_id=$1 AND line_combination_id IN
        (SELECT lc.id FROM line_combinations lc JOIN teams t ON t.id=lc.team_id WHERE t.league_id=$3)`,
        [from, survivorId, leagueId]);
      // An invoice cannot be merged by dropping the duplicate: payment state may
      // differ. Abort rather than losing a paid/confirmed recipient.
      const invoiceClash = await run(`SELECT 1 FROM payment_request_recipients a
        JOIN payment_request_recipients b ON b.payment_request_id=a.payment_request_id
        WHERE a.placeholder_player_id=$1 AND b.user_id=$2 LIMIT 1`, [from, survivorId]);
      if (invoiceClash.rowCount) throw new PlayerMergeConflict('Both profiles are recipients on the same invoice. Resolve that invoice before merging.');
      const outsideInvoice = await run(`SELECT 1 FROM payment_request_recipients a
        JOIN payment_requests p ON p.id=a.payment_request_id
        LEFT JOIN scrimmages s ON s.id=p.related_scrimmage_id
        WHERE a.placeholder_player_id=$1 AND s.league_id IS DISTINCT FROM $2 LIMIT 1`, [from, leagueId]);
      if (outsideInvoice.rowCount) throw new PlayerMergeConflict('This roster entry has an invoice outside this league or with no league. Resolve it before merging.');
      await run(`UPDATE payment_request_recipients SET user_id=$2, placeholder_player_id=NULL
        WHERE placeholder_player_id=$1`, [from, survivorId]);
      const groupClash = await run(`SELECT 1 FROM invite_group_members a JOIN invite_group_members b
        ON b.group_id=a.group_id WHERE a.placeholder_player_id=$1 AND b.user_id=$2 LIMIT 1`,
        [from, survivorId]);
      if (groupClash.rowCount) throw new PlayerMergeConflict('Both profiles belong to the same invite group. Resolve the group before merging.');
      const outsideGroup = await run(`SELECT 1 FROM invite_group_members m JOIN invite_groups g ON g.id=m.group_id
        WHERE m.placeholder_player_id=$1 AND g.league_id IS DISTINCT FROM $2 LIMIT 1`, [from, leagueId]);
      if (outsideGroup.rowCount) throw new PlayerMergeConflict('This roster entry belongs to an invite group outside this league. Resolve it before merging.');
      await run('UPDATE invite_group_members SET user_id=$2, placeholder_player_id=NULL WHERE placeholder_player_id=$1',
        [from, survivorId]);
    }
    // Roster consolidation: retain the survivor's membership details and permissions.
    if (source.type === 'user') {
      await move('league_pro_seats', 'user_id', 'league_id=$3', from);
      const membership = await run('SELECT * FROM league_memberships WHERE league_id=$2 AND user_id=$1 FOR UPDATE', [from, leagueId]);
      const sourceProfile = preserveLeagueDisplayName
        ? (await run('SELECT first_name, last_name FROM users WHERE id=$1', [from])).rows[0]
        : null;
      const displayFirst = preserveLeagueDisplayName
        ? membership.rows[0].display_first_name || sourceProfile?.first_name
        : null;
      const displayLast = preserveLeagueDisplayName
        ? membership.rows[0].display_last_name || sourceProfile?.last_name
        : null;
      const survivor = await run('SELECT * FROM league_memberships WHERE league_id=$2 AND user_id=$1 FOR UPDATE', [survivorId, leagueId]);
      if (!survivor.rowCount) await run(`UPDATE league_memberships SET user_id=$2, league_role='free_tier',
        league_special_permissions=NULL, display_first_name=$3, display_last_name=$4 WHERE id=$1`,
        [membership.rows[0].id, survivorId, displayFirst, displayLast]);
      else {
        const sourceMember = membership.rows[0];
        const targetMember = survivor.rows[0];
        if (sourceMember.assigned_team_id) {
          const sourceTeam = await run('SELECT id FROM teams WHERE id=$1 AND league_id=$2', [sourceMember.assigned_team_id, leagueId]);
          if (!sourceTeam.rowCount) throw new PlayerMergeConflict('The source has a team outside this league. Resolve the assignment before merging.');
        }
        await run(`UPDATE league_memberships SET
          assigned_team_id=coalesce(assigned_team_id,$2), position=coalesce(position,$3),
          jersey_number=coalesce(jersey_number,$4), skill_level=coalesce(skill_level,$5),
          is_goalie=is_goalie OR $6, is_skater=is_skater OR $7,
          status=CASE WHEN status='approved' OR $8::text='approved' THEN 'approved' ELSE status END,
          display_first_name=coalesce($9,display_first_name),
          display_last_name=coalesce($10,display_last_name)
          WHERE id=$1`, [
          targetMember.id, sourceMember.assigned_team_id, sourceMember.position,
          sourceMember.jersey_number, sourceMember.skill_level, sourceMember.is_goalie,
          sourceMember.is_skater, sourceMember.status, displayFirst, displayLast,
        ]);
        await run('DELETE FROM league_memberships WHERE league_id=$2 AND user_id=$1', [from, leagueId]);
      }
      await run(`UPDATE team_memberships tm SET user_id=$2 WHERE user_id=$1 AND team_id IN
        (SELECT id FROM teams WHERE league_id=$3) AND NOT EXISTS
        (SELECT 1 FROM team_memberships other WHERE other.team_id=tm.team_id AND other.user_id=$2)`,
        [from, survivorId, leagueId]);
      await run(`UPDATE team_memberships dest SET
        is_captain=dest.is_captain OR src.is_captain,
        status=CASE WHEN dest.status='approved' OR src.status='approved' THEN 'approved' ELSE dest.status END,
        position=coalesce(dest.position,src.position), jersey_number=coalesce(dest.jersey_number,src.jersey_number),
        skill_level=coalesce(dest.skill_level,src.skill_level)
        FROM team_memberships src JOIN teams t ON t.id=src.team_id
        WHERE t.league_id=$3 AND dest.team_id=src.team_id AND src.user_id=$1 AND dest.user_id=$2`,
        [from, survivorId, leagueId]);
      await run(`DELETE FROM team_memberships WHERE user_id=$1 AND team_id IN (SELECT id FROM teams WHERE league_id=$2)`,
        [from, leagueId]);
      await run('UPDATE imported_players SET merged_with_user_id=$2 WHERE league_id=$3 AND merged_with_user_id=$1', [from, survivorId, leagueId]);
      const remaining = await run(`SELECT
        (SELECT count(*) FROM player_stats WHERE league_id=$2 AND user_id=$1)
        +(SELECT count(*) FROM league_memberships WHERE league_id=$2 AND user_id=$1)
        +(SELECT count(*) FROM team_memberships tm JOIN teams t ON t.id=tm.team_id WHERE t.league_id=$2 AND tm.user_id=$1)
        +(SELECT count(*) FROM game_attendance a JOIN games g ON g.id=a.game_id WHERE g.league_id=$2 AND a.user_id=$1)
        +(SELECT count(*) FROM game_rsvps r JOIN games g ON g.id=r.game_id WHERE g.league_id=$2 AND r.user_id=$1)
        +(SELECT count(*) FROM game_goals x JOIN games g ON g.id=x.game_id WHERE g.league_id=$2
          AND $1 IN (x.scorer_id,x.primary_assist_id,x.secondary_assist_id))
        +(SELECT count(*) FROM game_penalties x JOIN games g ON g.id=x.game_id WHERE g.league_id=$2 AND x.player_id=$1)
        +(SELECT count(*) FROM game_goalies x JOIN games g ON g.id=x.game_id WHERE g.league_id=$2 AND x.goalie_user_id=$1)
        +(SELECT count(*) FROM game_stars x JOIN games g ON g.id=x.game_id WHERE g.league_id=$2
          AND $1 IN (x.first_star_user_id,x.second_star_user_id,x.third_star_user_id))
        +(SELECT count(*) FROM substitute_requests x LEFT JOIN games g ON g.id=x.game_id
          LEFT JOIN team_events e ON e.id=x.team_event_id LEFT JOIN teams t ON t.id=e.team_id
          WHERE (g.league_id=$2 OR t.league_id=$2)
            AND $1 IN (x.original_player_id,x.substitute_player_id,x.requested_by))
        +(SELECT count(*) FROM draft_picks p JOIN drafts d ON d.id=p.draft_id WHERE d.league_id=$2 AND p.player_id=$1)
        +(SELECT count(*) FROM draft_keepers p JOIN drafts d ON d.id=p.draft_id WHERE d.league_id=$2 AND p.user_id=$1)
        +(SELECT count(*) FROM league_pro_seats WHERE league_id=$2 AND user_id=$1)
        +(SELECT count(*) FROM line_combination_assignments a JOIN line_combinations lc ON lc.id=a.line_combination_id
          JOIN teams t ON t.id=lc.team_id WHERE t.league_id=$2 AND a.player_id=$1)
        AS count`, [from, leagueId]);
      if (Number(remaining.rows[0].count)) throw new PlayerMergeConflict('Some source league history could not be transferred. No changes were saved.');
    } else {
      const info = source.type === 'placeholder'
        ? await run('SELECT team_id, position, jersey_number, skill_level FROM placeholder_players WHERE id=$1', [from])
        : await run('SELECT team_id, team_name, position, jersey_number, skill_level FROM imported_players WHERE id=$1', [from]);
      const p = info.rows[0];
      if (source.type === 'imported' && !p?.team_id && p?.team_name) {
        const matchingTeams = await run('SELECT id FROM teams WHERE league_id=$1 AND lower(name)=lower($2)', [leagueId, p.team_name]);
        if (matchingTeams.rows.length !== 1) throw new PlayerMergeConflict('The imported team name does not identify exactly one team in this league. Assign the imported player to a team before merging.');
        p.team_id = matchingTeams.rows[0].id;
      }
      const team = p?.team_id ? await run('SELECT id FROM teams WHERE id=$1 AND league_id=$2', [p.team_id, leagueId]) : null;
      if (p?.team_id && !team?.rowCount) throw new PlayerMergeConflict('The source team does not belong to this league.');
      await run(`INSERT INTO league_memberships (user_id,league_id,status,assigned_team_id,position,jersey_number,skill_level)
        SELECT $1,$2,'approved',$3,$4,$5,$6 WHERE NOT EXISTS
        (SELECT 1 FROM league_memberships WHERE user_id=$1 AND league_id=$2)`,
        [survivorId, leagueId, p?.team_id, p?.position, p?.jersey_number, p?.skill_level]);
      if (p?.team_id) await run(`INSERT INTO team_memberships (user_id,team_id,status,position,jersey_number,skill_level)
        SELECT $1,$2,'approved',$3,$4,$5 WHERE NOT EXISTS
        (SELECT 1 FROM team_memberships WHERE user_id=$1 AND team_id=$2)`,
        [survivorId, p.team_id, p.position, p.jersey_number, p.skill_level]);
      if (source.type === 'placeholder') {
        // FK cascade on delete must never silently erase an unhandled reference.
        const remaining = await run(`SELECT
          (SELECT count(*) FROM game_attendance WHERE placeholder_player_id=$1)
          +(SELECT count(*) FROM draft_picks WHERE placeholder_player_id=$1)
          +(SELECT count(*) FROM line_combination_assignments WHERE placeholder_player_id=$1)
          +(SELECT count(*) FROM draft_keepers WHERE placeholder_player_id IN ($1, 'placeholder:' || $1)) AS count`, [from]);
        if (Number(remaining.rows[0].count)) throw new PlayerMergeConflict('This roster entry has history outside this league. Move or resolve it before merging.');
        await run('DELETE FROM placeholder_players WHERE id=$1', [from]);
      } else await run(`UPDATE imported_players SET merged_with_user_id=$2, merged_at=NOW(), is_placeholder=false
        WHERE id=$1 AND league_id=$3`, [from, survivorId, leagueId]);
    }
    if (source.type === 'imported') {
      const remaining = await run('SELECT count(*)::int AS count FROM player_stats WHERE league_id=$2 AND imported_player_id=$1', [from, leagueId]);
      if (remaining.rows[0].count) throw new PlayerMergeConflict('Imported season history could not be transferred. No changes were saved.');
    }
    await run('COMMIT');
    return { success: true };
  } catch (error) {
    await run('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
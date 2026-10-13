import { createHash } from 'node:crypto';
import type { PoolClient } from '@neondatabase/serverless';
import { pool } from './db';
import { assertAccountMergeAccess } from './accountMergeAuthorization';
import { selectAccountMergeDirection, verifyHistoricalFreeBilling, type AccountMergePolicy } from './accountMergePolicy';
import { collisionDefinitions, collisionScope, collisionEquivalent, additionalTransferableReferences } from './accountMergeRecords';

export class AccountUserMergeConflict extends Error {}

type UserSummary = { id: string; displayId: string | null; name: string; email: string | null; role: string };
type Reference = { schema: string; table: string; column: string; domain: string; count: number; snapshot: string };
type Blocker = { domain: string; reason: string; count: number; recordIds?: string[] };
type Combinable = { domain: string; count: number; label: string };
type MergePreview = {
  source: UserSummary;
  survivor: UserSummary;
  leagues: { id: string; name: string; records: { domain: string; count: number }[] }[];
  other: { domain: string; count: number }[];
  combinable: Combinable[];
  blockers: Blocker[];
  legacy: { id: string; league: string; name: string; kind: string; disposition: string }[];
  lookalikes: { id: string; league: string; name: string; kind: string }[];
  fingerprint: string;
  policy: AccountMergePolicy;
};

const quote = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;
const qualified = (schema: string, table: string) => `${quote(schema)}.${quote(table)}`;
const transferableReferences = new Set([
  ...additionalTransferableReferences,
  'birthday_greetings.user_id',
  'user_notifications.user_id',
  'notification_preferences.user_id',
  'user_online_status.user_id',
  'typing_indicators.user_id',
  'league_memberships.user_id',
  'imported_players.merged_with_user_id',
  'team_memberships.user_id',
  'player_stats.user_id',
  'game_attendance.user_id',
  'game_rsvps.user_id',
  'game_goals.scorer_id',
  'game_goals.primary_assist_id',
  'game_goals.secondary_assist_id',
  'game_penalties.player_id',
  'game_goalies.goalie_user_id',
  'game_stars.first_star_user_id',
  'game_stars.second_star_user_id',
  'game_stars.third_star_user_id',
  'duty_assignments.user_id',
  'personal_reminders.user_id',
  'facility_memberships.user_id',
  'event_participants.user_id',
  'messages.sender_id',
  'conversation_participants.user_id',
  'message_read_receipts.user_id',
  'chat_poll_votes.user_id',
  'message_reactions.user_id',
  'announcements.author_id',
  'announcement_reactions.user_id',
  'announcement_poll_votes.user_id',
  'announcement_read_status.user_id',
  'announcement_comments.author_id',
  'tournament_stats.user_id',
  'tournament_match_rsvps.user_id',
  'tournament_photo_tags.user_id',
  'tournament_photos.uploaded_by',
  'league_photo_tags.user_id',
  'league_photos.uploaded_by',
  'scrimmage_requests.player_id',
  'scrimmage_invites.user_id',
  'scrimmage_reminders_sent.player_id',
  'invite_group_members.user_id',
  'team_event_rsvps.user_id',
  'payment_request_recipients.user_id',
  'game_beer_counts.user_id',
  'draft_chat_messages.user_id',
  'badge_awards.user_id',
  'badge_progress.user_id',
  'badge_earned_events.user_id',
  'event_reminders_sent.player_id',
  'rsvp_reminders_sent.user_id',
  'league_invites_sent.user_id',
  'feedback_submissions.user_id',
  'feature_requests.user_id',
  'feature_request_votes.user_id',
  'feature_request_replies.user_id',
]);

async function rowSnapshot(client: PoolClient, schema: string, table: string, predicate: string, params: unknown[]) {
  const result = await client.query(
    `SELECT (${table === 'users' ? "to_jsonb(x)-ARRAY['updated_at','last_updated']" : 'to_jsonb(x)'})::text AS row
      FROM ${qualified(schema, table)} x WHERE ${predicate} ORDER BY row`,
    params,
  );
  return createHash('sha256').update(JSON.stringify(result.rows.map(row => row.row))).digest('hex');
}

async function identity(client: PoolClient, id: string, lock = false): Promise<UserSummary | null> {
  const result = await client.query(`
    SELECT id, display_id AS "displayId",
      concat_ws(' ', first_name, last_name) AS name, email,
      CASE WHEN role='free_tier' AND is_primary_commissioner THEN 'commissioner' ELSE role::text END AS role
    FROM users
    WHERE id=$1 AND deleted_at IS NULL AND email IS NOT NULL
      AND email NOT ILIKE '%@placeholder.roster'
    ${lock ? 'FOR UPDATE' : ''}`, [id]);
  return result.rows[0] ?? null;
}

/** Search returns registered, active account rows only. Names/emails are display hints, not matching proof. */
export async function searchAccountUsers(search = '', leagueId?: string): Promise<UserSummary[]> {
  const term = search.trim().slice(0, 100);
  const result = await pool.query(`
    SELECT id, display_id AS "displayId",
      concat_ws(' ', first_name, last_name) AS name, email, role
    FROM users
    WHERE deleted_at IS NULL AND email IS NOT NULL
      AND email NOT ILIKE '%@placeholder.roster'
      AND ($2::varchar IS NULL OR (display_id ~ '^U[0-9]{5}$'
        AND EXISTS (SELECT 1 FROM league_memberships lm WHERE lm.user_id=users.id AND lm.league_id=$2)))
      AND ($1='' OR id=$1 OR display_id ILIKE '%' || $1 || '%'
        OR email ILIKE '%' || $1 || '%' OR first_name ILIKE '%' || $1 || '%'
        OR last_name ILIKE '%' || $1 || '%'
        OR concat_ws(' ', first_name, last_name) ILIKE '%' || $1 || '%')
    ORDER BY CASE WHEN upper(display_id)=upper($1) THEN 0 ELSE 1 END,
      display_id NULLS LAST, id LIMIT 100`, [term, leagueId ?? null]);
  return result.rows;
}

async function references(client: PoolClient, sourceId: string, survivorId?: string): Promise<{
  refs: Reference[]; blockers: Blocker[]; evidence: [string, string][];
}> {
  // Foreign keys are the authoritative reference inventory. Inspect the live
  // database rather than relying on a static list which can silently go stale.
  const fkResult = await client.query(`
    SELECT ns.nspname AS schema, t.relname AS table, a.attname AS column
    FROM pg_constraint c
    JOIN pg_class t ON t.oid=c.conrelid
    JOIN pg_namespace ns ON ns.oid=t.relnamespace
    JOIN pg_class rt ON rt.oid=c.confrelid
    JOIN pg_namespace rns ON rns.oid=rt.relnamespace
    JOIN unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
    JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.attnum
    JOIN unnest(c.confkey) WITH ORDINALITY AS rk(attnum, ord) ON rk.ord=k.ord
    JOIN pg_attribute ra ON ra.attrelid=rt.oid AND ra.attnum=rk.attnum
    WHERE c.contype='f' AND rns.nspname='public' AND rt.relname='users'
      AND ra.attname='id' AND ns.nspname='public'
      AND t.relkind IN ('r','p') AND t.relname NOT IN ('users','account_user_merges')
    ORDER BY ns.nspname,t.relname,a.attname`);
  const refs: Reference[] = [];
  const blockers: Blocker[] = [];
  const evidence: [string, string][] = [];
  const fkKeys = new Set<string>();
  for (const { schema, table, column } of fkResult.rows) {
    fkKeys.add(`${schema}.${table}.${column}`);
    const res = await client.query(
      `SELECT count(*)::int AS count FROM ${qualified(schema, table)} WHERE ${quote(column)}::text=$1`,
      [sourceId],
    );
    const count = Number(res.rows[0].count);
    if (!count) continue;
    const domain = `${table}.${column}`;
    const snapshot = await rowSnapshot(client, schema, table, `${quote(column)}::text=$1`, [sourceId]);
    // Retain immutable expired purchase ownership on the source tombstone.
    // Eligibility verifies billing separately; these are never reassigned.
    if (domain === 'apple_purchase_links.user_id') { evidence.push([domain, snapshot]); continue; }
    refs.push({ schema, table, column, domain, count, snapshot });
    evidence.push([domain, snapshot]);
    if (survivorId) {
      const survivorSnapshot = await rowSnapshot(
        client, schema, table, `${quote(column)}::text=$1`, [survivorId],
      );
      evidence.push([`${domain}.survivor`, survivorSnapshot]);
    }
    if (!transferableReferences.has(domain))
      blockers.push({ domain, reason: 'This user reference is not explicitly classified as safely transferable.', count });
  }

  // Find free-text and JSON/array references not represented by a relational FK.
  // Conservative substring matching intentionally prefers a blocker over losing
  // an unmodelled identifier. No matched opaque value is rewritten in place.
  const cols = await client.query(`
    SELECT table_schema AS schema, table_name AS table, column_name AS column, data_type
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name <> 'account_user_merges'
      AND NOT (table_name='users' AND column_name='id')
      AND (data_type IN ('character varying','character','text','json','jsonb')
        OR data_type LIKE '%ARRAY%')
    ORDER BY table_name,column_name`);
  for (const { schema, table, column } of cols.rows) {
    if (fkKeys.has(`${schema}.${table}.${column}`)) continue;
    const excludeMergeIdentities = table === 'users' && survivorId ? ' AND id NOT IN ($2,$3)' : '';
    const params = excludeMergeIdentities ? [sourceId, sourceId, survivorId] : [sourceId];
    const res = await client.query(
      `SELECT count(*)::int AS count FROM ${qualified(schema, table)}
       WHERE ${quote(column)}::text LIKE '%' || $1 || '%'${excludeMergeIdentities}`, params,
    );
    const count = Number(res.rows[0].count);
    if (count) {
      const domain = `${table}.${column}`;
      const snapshot = await rowSnapshot(client, schema, table,
        `${quote(column)}::text LIKE '%' || $1 || '%'${excludeMergeIdentities}`, params);
      evidence.push([domain, snapshot]);
      if (domain === 'google_iap_claims.user_id') continue;
      if (domain === 'scrimmages.invite_user_ids') {
        // This is a typed text[] of explicitly selected identities, not opaque
        // free text. Preserve placeholder IDs and deduplicate the replaced user.
        const exact = await client.query('SELECT count(*)::int AS count FROM scrimmages WHERE $1=ANY(invite_user_ids)', [sourceId]);
        if (Number(exact.rows[0].count) === count) continue;
      }
      if (transferableReferences.has(domain)) {
        const exact = await client.query(`SELECT count(*)::int AS count FROM ${qualified(schema, table)} WHERE ${quote(column)}::text=$1`, [sourceId]);
        if (Number(exact.rows[0].count) === count) {
          refs.push({ schema, table, column, domain, count, snapshot });
          continue;
        }
      }
      blockers.push({ domain, reason: 'Opaque free-text/JSON/array reference cannot be safely classified or rewritten.', count });
    }
  }
  // Provider identities and paid account authority are stored on the source
  // user itself, not in a row referencing users.id.
  const userSnapshot = await rowSnapshot(client, 'public', 'users', 'id=$1', [sourceId]);
  evidence.push(['users.source', userSnapshot]);
  return { refs, blockers, evidence };
}

async function detectUniqueCollisions(client: PoolClient, refs: Reference[], sourceId: string, survivorId: string) {
  const blockers: Blocker[] = [];
  const indexes = await client.query(`
    SELECT ns.nspname AS schema, t.relname AS table, i.indexrelid::regclass::text AS index_name,
      array_agg(a.attname::text ORDER BY keys.ord) FILTER (WHERE a.attname IS NOT NULL) AS columns,
      bool_or(keys.attnum=0) AS has_expression
    FROM pg_index i
    JOIN pg_class t ON t.oid=i.indrelid
    JOIN pg_namespace ns ON ns.oid=t.relnamespace
    JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS keys(attnum,ord) ON keys.ord <= i.indnkeyatts
    LEFT JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=keys.attnum
    WHERE i.indisunique AND ns.nspname='public'
    GROUP BY ns.nspname,t.relname,i.indexrelid`);
  for (const ref of refs) {
    for (const index of indexes.rows.filter((row: any) => row.schema === ref.schema && row.table === ref.table &&
      (row.columns ?? []).includes(ref.column))) {
      const collisionDefinition = collisionDefinitions.find(definition => definition.table === ref.table);
      const uniqueScope = (index.columns ?? []).filter((name: string) => name !== ref.column).sort();
      if (collisionDefinition && ref.column === (collisionDefinition.column ?? 'user_id') &&
        JSON.stringify(uniqueScope) === JSON.stringify([...collisionDefinition.scope].sort()))
        continue; // Explicitly classified and fingerprinted by detectAccountDataCollisions.
      if (index.has_expression) {
        blockers.push({
          domain: ref.domain,
          reason: `A unique expression index (${index.index_name}) prevents safe collision classification.`,
          count: ref.count,
        });
        continue;
      }
      const otherCols = index.columns.filter((name: string) => name !== ref.column);
      const matching = otherCols.length
        ? otherCols.map((name: string) => `s.${quote(name)} IS NOT DISTINCT FROM d.${quote(name)}`).join(' AND ')
        : 'TRUE';
      const result = await client.query(`
        SELECT count(*)::int AS count FROM ${qualified(ref.schema, ref.table)} s
        JOIN ${qualified(ref.schema, ref.table)} d ON ${matching}
        WHERE s.${quote(ref.column)}::text=$1 AND d.${quote(ref.column)}::text=$2`,
      [sourceId, survivorId]);
      const count = Number(result.rows[0].count);
      if (count) blockers.push({
        domain: ref.domain,
        reason: `Would collide with an existing survivor record (${index.index_name}); reconcile both records before merging.`,
        count,
        recordIds: (await client.query(`SELECT coalesce(to_jsonb(s)->>'id',to_jsonb(s)->>'user_id') AS id FROM ${qualified(ref.schema, ref.table)} s
          JOIN ${qualified(ref.schema, ref.table)} d ON ${matching}
          WHERE s.${quote(ref.column)}::text=$1 AND d.${quote(ref.column)}::text=$2 LIMIT 20`, [sourceId, survivorId])).rows.map(r => r.id),
      });
    }
  }
  return blockers;
}

async function detectAccountDataCollisions(client: PoolClient, sourceId: string, survivorId: string) {
  const blockers: Blocker[] = [];
  const combinable: Combinable[] = [];
  for (const definition of collisionDefinitions) {
    const scopeMatch = collisionScope(definition);
    const equivalent = collisionEquivalent(definition);
    const userColumn = quote(definition.column ?? 'user_id');
    const result = await client.query(`
      SELECT count(*)::int AS count,
        (count(*) FILTER (WHERE ${equivalent}))::int AS safe_count
      FROM ${qualified('public', definition.table)} s
      JOIN ${qualified('public', definition.table)} d ON ${scopeMatch}
      WHERE s.${userColumn}=$1 AND d.${userColumn}=$2`, [sourceId, survivorId]);
    const count = Number(result.rows[0].count);
    const safeCount = Number(result.rows[0].safe_count);
    if (safeCount) combinable.push({
      domain: definition.table,
      count: safeCount,
      label: definition.label,
    });
    if (count > safeCount) blockers.push({
      domain: definition.table,
      reason: definition.table === 'notification_preferences'
        ? 'Source notification preferences contain a device or external ID that does not already match the survivor. Relink the provider identity before merging.'
        : definition.table === 'badge_progress'
        ? 'Badge progress differs; progress totals are never added without event provenance.'
        : `Overlapping ${definition.table.replaceAll('_', ' ')} records differ; reconcile their history before merging.`,
      count: count - safeCount,
      recordIds: (await client.query(`SELECT s.id::text AS id FROM ${qualified('public', definition.table)} s
        JOIN ${qualified('public', definition.table)} d ON ${scopeMatch}
        WHERE s.${userColumn}=$1 AND d.${userColumn}=$2 AND NOT (${equivalent}) LIMIT 20`, [sourceId, survivorId])).rows.map(r => r.id),
    });
  }
  // Compare the entire answer set: equal individual options are insufficient
  // for a multi-select poll whose remaining options differ.
  for (const [table, pollColumn, optionColumn] of [['announcement_poll_votes', 'poll_id', 'option_index'], ['chat_poll_votes', 'poll_id', 'option_index']]) {
    const different = await client.query(`SELECT s.${pollColumn} AS id FROM ${table} s
      JOIN ${table} d ON d.${pollColumn}=s.${pollColumn}
      WHERE s.user_id=$1 AND d.user_id=$2 GROUP BY s.${pollColumn}
      HAVING array_agg(DISTINCT s.${optionColumn} ORDER BY s.${optionColumn})
        IS DISTINCT FROM array_agg(DISTINCT d.${optionColumn} ORDER BY d.${optionColumn})`, [sourceId, survivorId]);
    if (different.rowCount) blockers.push({ domain: table, count: different.rowCount,
      reason: 'The accounts chose different poll answers. Review the poll and resolve the votes before merging.', recordIds: different.rows.map(r => r.id) });
  }
  const stats = await client.query(`
    SELECT count(*)::int AS count FROM player_stats s
    JOIN player_stats d ON s.league_id=d.league_id
      AND s.season_id IS NOT DISTINCT FROM d.season_id
    WHERE s.user_id=$1 AND d.user_id=$2`, [sourceId, survivorId]);
  const statsCount = Number(stats.rows[0].count);
  if (statsCount) blockers.push({
    domain: 'player_stats',
    reason: 'Both accounts have statistics in the same league/season. Totals are not summed without event provenance.',
    count: statsCount,
    recordIds: (await client.query(`SELECT s.id FROM player_stats s JOIN player_stats d ON s.league_id=d.league_id
      AND s.season_id IS NOT DISTINCT FROM d.season_id WHERE s.user_id=$1 AND d.user_id=$2 LIMIT 20`, [sourceId, survivorId])).rows.map(r => r.id),
  });
  const facilities = await client.query(`
    SELECT count(*)::int AS count FROM facility_memberships s
    JOIN facility_memberships d ON s.facility_id=d.facility_id
    WHERE s.user_id=$1 AND d.user_id=$2`, [sourceId, survivorId]);
  const facilityCount = Number(facilities.rows[0].count);
  if (facilityCount) blockers.push({
    domain: 'facility_memberships',
    reason: 'Both accounts have a membership at the same facility. Reconcile membership terms first.',
    count: facilityCount,
    recordIds: (await client.query(`SELECT s.id FROM facility_memberships s JOIN facility_memberships d ON s.facility_id=d.facility_id
      WHERE s.user_id=$1 AND d.user_id=$2 LIMIT 20`, [sourceId, survivorId])).rows.map(r => r.id),
  });
  return { blockers, combinable };
}

async function combineSafeCollisions(client: PoolClient, sourceId: string, survivorId: string) {
  for (const definition of collisionDefinitions) {
    const table = qualified('public', definition.table);
    const scopeMatch = collisionScope(definition);
    const equivalent = collisionEquivalent(definition);
    const userColumn = quote(definition.column ?? 'user_id');
    if (definition.table === 'birthday_greetings') {
      await client.query(`UPDATE birthday_greetings d SET
        popup_dismissed_at=coalesce(d.popup_dismissed_at,s.popup_dismissed_at),
        push_sent_at=coalesce(d.push_sent_at,s.push_sent_at), push_claimed_at=coalesce(d.push_claimed_at,s.push_claimed_at)
        FROM birthday_greetings s WHERE s.user_id=$1 AND d.user_id=$2 AND s.birthday_date=d.birthday_date`, [sourceId, survivorId]);
    }
    if (definition.membership) {
      const columns = definition.membership === 'league'
        ? ['assigned_team_id', 'position', 'jersey_number', 'skill_level', 'display_first_name', 'display_last_name', 'notes']
        : ['position', 'jersey_number'];
      const extra = definition.membership === 'league'
        ? `, is_goalie=d.is_goalie OR s.is_goalie, is_skater=d.is_skater OR s.is_skater,
            league_role=CASE WHEN s.league_role='commissioner' OR d.league_role='commissioner' THEN 'commissioner'::user_role
              WHEN s.league_role='secondary_commissioner' OR d.league_role='secondary_commissioner' THEN 'secondary_commissioner'::user_role
              WHEN s.league_role='player_pro' OR d.league_role='player_pro' THEN 'player_pro'::user_role ELSE 'free_tier'::user_role END,
            league_special_permissions=ARRAY(SELECT DISTINCT unnest(coalesce(s.league_special_permissions,'{}') || coalesce(d.league_special_permissions,'{}')))`
        : ', is_captain=d.is_captain OR s.is_captain';
      await client.query(`UPDATE ${table} d SET
        ${columns.map(c => `${quote(c)}=coalesce(d.${quote(c)},s.${quote(c)})`).join(',')},
        status=CASE WHEN s.status='approved' OR d.status='approved' THEN 'approved'::membership_status ELSE d.status END
        ${extra} FROM ${table} s WHERE s.user_id=$1 AND d.user_id=$2 AND ${scopeMatch} AND ${equivalent}`, [sourceId, survivorId]);
    }
    if (definition.table === 'badge_awards') {
      await client.query(`
        UPDATE badge_earned_events e SET badge_award_id=d.id,
          payload=CASE WHEN e.payload ? 'awardId' THEN jsonb_set(e.payload,'{awardId}',to_jsonb(d.id)) ELSE e.payload END,
          acknowledged_at=coalesce(e.acknowledged_at,(SELECT max(seen.acknowledged_at) FROM badge_earned_events seen
            WHERE seen.badge_award_id=d.id AND seen.event_type=e.event_type
              AND seen.payload->>'tier' IS NOT DISTINCT FROM e.payload->>'tier'))
        FROM badge_awards s JOIN badge_awards d
          ON s.badge_definition_id=d.badge_definition_id AND s.scope_key=d.scope_key
        WHERE s.user_id=$1 AND d.user_id=$2
          AND ${equivalent}
          AND e.badge_award_id=s.id`, [sourceId, survivorId]);
    }
    await client.query(`
      DELETE FROM ${table} s USING ${table} d
      WHERE s.${userColumn}=$1 AND d.${userColumn}=$2
        AND ${scopeMatch} AND ${equivalent}`, [sourceId, survivorId]);
  }
}

type LeagueParentLink = { childTable: string; childColumn: string; parentTable: string; parentColumn: string };

async function resolveLeagueParentPath(client: PoolClient) {
  const [leagueColumnResult, linksResult] = await Promise.all([
    client.query(`SELECT table_name FROM information_schema.columns
      WHERE table_schema='public' AND column_name='league_id'`),
    client.query(`
      SELECT child.relname AS "childTable", child_col.attname AS "childColumn",
        parent.relname AS "parentTable", parent_col.attname AS "parentColumn"
      FROM pg_constraint c
      JOIN pg_class child ON child.oid=c.conrelid
      JOIN pg_namespace child_ns ON child_ns.oid=child.relnamespace
      JOIN pg_class parent ON parent.oid=c.confrelid
      JOIN pg_namespace parent_ns ON parent_ns.oid=parent.relnamespace
      JOIN unnest(c.conkey) WITH ORDINALITY child_keys(attnum,ord) ON true
      JOIN pg_attribute child_col ON child_col.attrelid=child.oid AND child_col.attnum=child_keys.attnum
      JOIN unnest(c.confkey) WITH ORDINALITY parent_keys(attnum,ord) ON parent_keys.ord=child_keys.ord
      JOIN pg_attribute parent_col ON parent_col.attrelid=parent.oid AND parent_col.attnum=parent_keys.attnum
      WHERE c.contype='f' AND child_ns.nspname='public' AND parent_ns.nspname='public'
        AND child.relkind IN ('r','p') AND parent.relkind IN ('r','p')
        AND cardinality(c.conkey)=1 AND cardinality(c.confkey)=1
        AND child.relname<>'account_user_merges'
      ORDER BY child.relname,child_col.attname,parent.relname`),
  ]);
  const leagueTables = new Set(leagueColumnResult.rows.map(row => row.table_name as string));
  const links = linksResult.rows as LeagueParentLink[];
  const pathCache = new Map<string, LeagueParentLink[] | null>();
  const parentColumnPriority = (childTable: string, childColumn: string) => {
    if (childTable.startsWith('game_') && childColumn === 'game_id') return 0;
    if (childTable.startsWith('scrimmage_') && childColumn === 'scrimmage_id') return 0;
    if (childTable.startsWith('tournament_')) {
      if (childColumn === 'tournament_id') return 0;
      if (childColumn === 'match_id') return 1;
      if (childColumn === 'photo_id') return 2;
      if (childColumn === 'game_id') return 3;
    }
    if ((childTable.startsWith('team_') || childTable.startsWith('duty_')) && childColumn === 'team_id') return 0;
    if (childColumn === 'game_id') return 1;
    if (childColumn === 'team_id') return 2;
    return 10;
  };
  const findPath = (start: string): LeagueParentLink[] | null => {
    if (pathCache.has(start)) return pathCache.get(start)!;
    if (leagueTables.has(start)) {
      pathCache.set(start, []);
      return [];
    }
    const queue: { table: string; path: LeagueParentLink[]; seen: Set<string> }[] = [
      { table: start, path: [], seen: new Set([start]) },
    ];
    while (queue.length) {
      const current = queue.shift()!;
      const parents = links.filter(link => link.childTable === current.table)
        .sort((a, b) => parentColumnPriority(current.table, a.childColumn) -
          parentColumnPriority(current.table, b.childColumn) || a.childColumn.localeCompare(b.childColumn));
      for (const parent of parents) {
        if (current.seen.has(parent.parentTable) || parent.parentTable === 'users') continue;
        const path = [...current.path, parent];
        if (leagueTables.has(parent.parentTable)) {
          pathCache.set(start, path);
          return path;
        }
        const seen = new Set(current.seen);
        seen.add(parent.parentTable);
        queue.push({ table: parent.parentTable, path, seen });
      }
    }
    pathCache.set(start, null);
    return null;
  };
  return findPath;
}

type MergeAccess = { operatorId: string; leagueId?: string; authIdentities?: [string, string][] };
async function buildPreview(client: PoolClient, sourceId: string, survivorId: string, access?: MergeAccess): Promise<MergePreview> {
  if (!sourceId || !survivorId || sourceId === survivorId)
    throw new AccountUserMergeConflict('Select two different account IDs.');
  if (access) {
    try { await assertAccountMergeAccess(client, access.operatorId, access.leagueId, [sourceId, survivorId]); }
    catch (error) { throw new AccountUserMergeConflict((error as Error).message); }
  }
  const accounts = (await client.query('SELECT * FROM users WHERE id=ANY($1::varchar[]) AND deleted_at IS NULL', [[sourceId, survivorId]])).rows;
  const a = accounts.find(r => r.id === sourceId), b = accounts.find(r => r.id === survivorId);
  if (!a || !b) throw new AccountUserMergeConflict('Both accounts must still be active.');
  const direction = selectAccountMergeDirection(a, b);
  sourceId = direction.sourceId; survivorId = direction.survivorId;
  const policy = direction.policy;
  const billingEvidence: unknown[] = [];
  const billingBlockers: Blocker[] = [];
  for (const account of [...accounts].sort((x, y) => x.id.localeCompare(y.id))) {
    const native = await client.query(`SELECT 'apple' AS provider,to_jsonb(x) AS record FROM apple_purchase_links x WHERE user_id=$1
      UNION ALL SELECT 'google',to_jsonb(x) FROM google_iap_claims x WHERE user_id=$1`, [account.id]);
    billingEvidence.push([account.id, native.rows]);
    if (account.role !== 'free_tier' || account.is_primary_commissioner) continue;
    try {
      const canonicalCustomers = native.rows.filter(r => r.provider === 'apple').map(r => r.record.customer_id);
      const verified = await verifyHistoricalFreeBilling(account, canonicalCustomers.length ? canonicalCustomers : native.rows.length > 0);
      billingEvidence.push([account.id, verified]);
      if (verified.active || native.rows.some(r => r.record.expires_at &&
        Date.parse(r.record.expires_at) > Date.now() && !r.record.revoked_by_apple)) {
        billingBlockers.push({ domain: 'billing.verification', count: 1, recordIds: [account.display_id || account.id],
          reason: 'This free-tier profile has an active purchase. Reconcile its tier and subscription status before merging.' });
      }
    } catch {
      billingBlockers.push({ domain: 'billing.verification', count: 1, recordIds: [account.display_id || account.id],
        reason: 'Could not verify historical billing for this free-tier profile. Retry the review or resolve its subscription status first.' });
    }
  }
  if (billingBlockers.length) { policy.kind = 'verification_required'; policy.message = 'Account billing and tier state must be verified before merging.'; }
  if (direction.policy.kind === 'billing_duplicate') billingBlockers.push({ domain: 'billing.duplicate', count: 2,
    recordIds: accounts.map(r => r.display_id || r.id), reason: policy.message });
  const [source, survivor] = await Promise.all([
    identity(client, sourceId), identity(client, survivorId),
  ]);
  if (!source || !survivor)
    throw new AccountUserMergeConflict('Both selected IDs must be active registered accounts. Refresh the search.');
  const { refs, blockers: refBlockers, evidence } = await references(client, sourceId, survivorId);
  // merged_with_user_id is an explicit relational link. An imported row with
  // only the same name/email is NOT linked and must never be moved implicitly.
  const linkedRows = await client.query(`
    SELECT i.id, coalesce(l.name,'Unknown league') AS league,
      concat_ws(' ',i.first_name,i.last_name) AS name
    FROM imported_players i LEFT JOIN leagues l ON l.id=i.league_id
    WHERE i.merged_with_user_id=$1 ORDER BY i.id`, [sourceId]);
  const legacy = linkedRows.rows.map(row => ({
    ...row, kind: 'Imported', disposition: 'Explicit link transfers to survivor; imported history remains a separate row',
  }));
  const unlinkedRows = await client.query(`
    SELECT kind,id,league,name FROM (
      SELECT 'Imported' AS kind,i.id,coalesce(l.name,'Unknown league') AS league,
        concat_ws(' ',i.first_name,i.last_name) AS name, i.email
      FROM imported_players i LEFT JOIN leagues l ON l.id=i.league_id
      WHERE i.merged_with_user_id IS NULL
      UNION ALL
      SELECT 'Placeholder',p.id,coalesce(l.name,'Unknown league'),
        concat_ws(' ',p.first_name,p.last_name),p.email
      FROM placeholder_players p LEFT JOIN leagues l ON l.id=p.league_id
    ) x
    WHERE (nullif(trim(x.email),'') IS NOT NULL AND
      lower(trim(x.email)) IN (lower(trim($1)),lower(trim($3))))
      OR (nullif(trim(x.name),'') IS NOT NULL AND
        lower(trim(x.name)) IN (lower(trim($2)),lower(trim($4))))
    ORDER BY kind,id`, [source.email, source.name, survivor.email, survivor.name]);
  const lookalikes = unlinkedRows.rows;
  const collisionBlockers = await detectUniqueCollisions(client, refs, sourceId, survivorId);
  const accountDataCollisions = await detectAccountDataCollisions(client, sourceId, survivorId);
  const blockers = [...billingBlockers, ...refBlockers, ...collisionBlockers, ...accountDataCollisions.blockers];
  const combinable = accountDataCollisions.combinable;
  const leagues: MergePreview['leagues'] = [];
  const other: MergePreview['other'] = [];
  const findLeaguePath = await resolveLeagueParentPath(client);
  for (const ref of refs) {
    let leagueRows: { id: string; name: string; count: number }[] = [];
    const leaguePath = findLeaguePath(ref.table);
    if (leaguePath) {
      let joins = '';
      let previousAlias = 'x';
      for (let index = 0; index < leaguePath.length; index++) {
        const link = leaguePath[index];
        const parentAlias = `p${index}`;
        joins += ` JOIN ${qualified('public', link.parentTable)} ${parentAlias}
          ON ${previousAlias}.${quote(link.childColumn)}=${parentAlias}.${quote(link.parentColumn)}`;
        previousAlias = parentAlias;
      }
      const leagueAlias = leaguePath.length ? previousAlias : 'x';
      const rows = await client.query(`
        SELECT l.id,l.name,count(*)::int AS count FROM ${qualified(ref.schema, ref.table)} x
        ${joins}
        JOIN leagues l ON l.id=${leagueAlias}.league_id
        WHERE x.${quote(ref.column)}::text=$1 GROUP BY l.id,l.name ORDER BY l.id`, [sourceId]);
      leagueRows = rows.rows;
    }
    const mapped = new Map<string, number>();
    for (const row of leagueRows) {
      mapped.set(row.id, Number(row.count));
      let item = leagues.find(l => l.id === row.id);
      if (!item) { item = { id: row.id, name: row.name, records: [] }; leagues.push(item); }
      item.records.push({ domain: ref.domain, count: Number(row.count) });
    }
    // Rows with no usable parent path, a NULL league_id, or a missing league
    // remain visible in Other rather than disappearing through an inner join.
    const otherCount = ref.count - Array.from(mapped.values()).reduce((sum, n) => sum + n, 0);
    if (otherCount) other.push({ domain: ref.domain, count: otherCount });
  }
  const fingerprintPayload = {
    authorization: access ? [access.operatorId, access.leagueId ?? null, access.authIdentities ?? null] : null,
    policy: [policy.kind, policy.message],
    billingEvidence,
    source: [source.id, source.displayId, source.name, source.email],
    survivor: [survivor.id, survivor.displayId, survivor.name, survivor.email],
    evidence: evidence.sort(([a], [b]) => a.localeCompare(b)),
    survivorSnapshot: await rowSnapshot(client, 'public', 'users', 'id=$1', [survivorId]),
    leagues: leagues.map(league => [league.id, league.records.map(record => [record.domain, record.count]).sort()]).sort(),
    other: other.map(record => [record.domain, record.count]).sort(),
    combinable: combinable.map(({ domain, count, label }) => [domain, count, label]).sort(),
    blockers: blockers.map(({ domain, reason, count }) => [domain, reason, count]).sort(),
    legacy,
    lookalikes,
  };
  const fingerprint = createHash('sha256').update(JSON.stringify(fingerprintPayload)).digest('hex');
  return { source, survivor, leagues, other, combinable, blockers, legacy, lookalikes, fingerprint, policy };
}

export async function previewAccountUserMerge(sourceId: string, survivorId: string, access?: MergeAccess): Promise<MergePreview> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    return await buildPreview(client, sourceId, survivorId, access);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}

async function confirmAccountUserMergeOnce(
  sourceId: string, survivorId: string, operatorId: string, previewFingerprint: string, leagueId?: string, authIdentities?: [string, string][],
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['account-user-merge']);
    try { await assertAccountMergeAccess(client, operatorId, leagueId); }
    catch (error) { throw new AccountUserMergeConflict((error as Error).message); }
    const prior = await client.query(
      'SELECT survivor_user_id, authorization_league_id FROM account_user_merges WHERE source_user_id=$1 FOR UPDATE', [sourceId],
    );
    if (prior.rowCount) {
      if (prior.rows[0].survivor_user_id === survivorId && (!leagueId || prior.rows[0].authorization_league_id === leagueId)) {
        await client.query('COMMIT');
        return { sourceId, survivorId, alreadyMerged: true };
      }
      throw new AccountUserMergeConflict('This account has already been retired into a different account.');
    }
    const source = await identity(client, sourceId, true);
    const survivor = await identity(client, survivorId, true);
    const operator = await identity(client, operatorId, true);
    if (!source || !survivor) throw new AccountUserMergeConflict('Both selected accounts must still be active.');
    if (!operator) throw new AccountUserMergeConflict('A valid active merge-operator account is required.');
    const preview = await buildPreview(client, sourceId, survivorId, { operatorId, leagueId, authIdentities });
    if (preview.source.id !== sourceId || preview.survivor.id !== survivorId)
      throw new AccountUserMergeConflict('The non-free profile must be the parent. Refresh the review to confirm the paid account’s login.');
    if (!previewFingerprint || preview.fingerprint !== previewFingerprint)
      throw new AccountUserMergeConflict('Account data changed after review. Refresh the preview before confirming.');
    if (preview.blockers.length) {
      const summary = preview.blockers.slice(0, 5).map(b => `${b.domain}: ${b.reason}`).join(' ');
      throw new AccountUserMergeConflict(`Merge blocked; resolve the listed records first. ${summary}`);
    }
    const before = await references(client, sourceId, survivorId);
    const provenance: Record<string, unknown> = {};
    for (const ref of before.refs) {
      provenance[ref.domain] = (await client.query(`SELECT to_jsonb(x) AS original FROM ${qualified(ref.schema, ref.table)} x
        WHERE ${quote(ref.column)}::text IN ($1,$2)`, [sourceId, survivorId])).rows.map(r => r.original);
    }
    // Events and their delivery state are also preserved when duplicate awards
    // are combined. Audit the original award references before rewriting them.
    provenance.badge_events = (await client.query('SELECT * FROM badge_earned_events WHERE user_id IN ($1,$2)', [sourceId, survivorId])).rows;
    provenance.account_authority = (await client.query(`SELECT id,special_permissions,is_primary_commissioner,fee_exempt
      FROM users WHERE id IN ($1,$2)`, [sourceId, survivorId])).rows;
    provenance.direct_scrimmage_invites = (await client.query('SELECT id,invite_user_ids FROM scrimmages WHERE $1=ANY(invite_user_ids)', [sourceId])).rows;
    await combineSafeCollisions(client, sourceId, survivorId);
    const { refs } = await references(client, sourceId, survivorId);
    for (const ref of refs) {
      await client.query(
        `UPDATE ${qualified(ref.schema, ref.table)} SET ${quote(ref.column)}=$2 WHERE ${quote(ref.column)}::text=$1`,
        [sourceId, survivorId],
      );
    }
    await client.query(`UPDATE users d SET
      special_permissions=ARRAY(SELECT DISTINCT unnest(coalesce(d.special_permissions,'{}') || coalesce(s.special_permissions,'{}'))),
      fee_exempt=d.fee_exempt OR s.fee_exempt
      FROM users s WHERE s.id=$1 AND d.id=$2`, [sourceId, survivorId]);
    await client.query(`UPDATE scrimmages SET invite_user_ids=ARRAY(SELECT DISTINCT unnest(array_replace(invite_user_ids,$1,$2)))
      WHERE $1=ANY(invite_user_ids)`, [sourceId, survivorId]);
    // Deduplicate identical earned events while preserving the fact that either
    // account already saw/acknowledged the celebration.
    await client.query(`WITH grouped AS (
      SELECT min(id) AS keep_id, array_agg(id) AS ids, max(acknowledged_at) AS acknowledged_at, max(delivered_at) AS delivered_at
      FROM badge_earned_events WHERE user_id=$1 GROUP BY badge_award_id,event_type,(payload-ARRAY['awardId','badgeAwardId'])
      HAVING count(*)>1
    ) UPDATE badge_earned_events e SET acknowledged_at=coalesce(e.acknowledged_at,g.acknowledged_at),
      delivered_at=coalesce(e.delivered_at,g.delivered_at) FROM grouped g WHERE e.id=g.keep_id`, [survivorId]);
    await client.query(`DELETE FROM badge_earned_events e USING badge_earned_events kept
      WHERE e.user_id=$1 AND kept.user_id=$1 AND e.id>kept.id AND e.badge_award_id=kept.badge_award_id
      AND e.event_type=kept.event_type AND (e.payload-ARRAY['awardId','badgeAwardId'])=(kept.payload-ARRAY['awardId','badgeAwardId'])`, [survivorId]);
    // Re-scan relational and opaque references before retiring. Any unexpected
    // or concurrently-created record aborts the complete transaction.
    const remaining = await references(client, sourceId, survivorId);
    if (remaining.refs.length || remaining.blockers.length)
      throw new AccountUserMergeConflict('Source references remain after transfer; the transaction was rolled back.');
    await client.query(`
      INSERT INTO account_user_merges
        (source_user_id,survivor_user_id,operator_user_id,source_display_id,source_email,preview_fingerprint,
          authorization_league_id,activity_provenance,merge_policy)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)`,
    [sourceId, survivorId, operatorId, source.displayId, source.email, previewFingerprint, leagueId ?? null,
      JSON.stringify(provenance), JSON.stringify(preview.policy)]);
    await client.query('UPDATE users SET deleted_at=NOW(), updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL', [sourceId]);
    await client.query('COMMIT');
    return { sourceId, survivorId, alreadyMerged: false };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function confirmAccountUserMerge(
  sourceId: string, survivorId: string, operatorId: string, previewFingerprint: string, leagueId?: string, authIdentities?: [string, string][],
) {
  // A serializable loser in two simultaneous identical confirmations retries
  // from a fresh snapshot and observes the durable audit row as an idempotent
  // replay instead of surfacing a spurious concurrency failure.
  for (let attempt = 0; ; attempt++) {
    try {
      return await confirmAccountUserMergeOnce(sourceId, survivorId, operatorId, previewFingerprint, leagueId, authIdentities);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (attempt >= 2 || (code !== '40001' && code !== '40P01')) throw error;
    }
  }
}
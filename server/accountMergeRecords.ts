export type CollisionDefinition = {
  table: string; scope: readonly string[]; label: string; column?: string;
  fields?: readonly string[]; membership?: 'league' | 'team';
};
export const collisionDefinitions: readonly CollisionDefinition[] = [
  { table: 'league_memberships', scope: ['league_id'], label: 'Compatible league membership', membership: 'league' },
  { table: 'team_memberships', scope: ['team_id'], label: 'Compatible team membership', membership: 'team' },
  { table: 'game_attendance', scope: ['game_id'], label: 'Equivalent attendance', fields: ['team_id', 'placeholder_player_id'] },
  { table: 'line_combination_assignments', column: 'player_id', scope: ['line_combination_id'],
    label: 'Equivalent line assignment', fields: ['position', 'placeholder_player_id'] },
  { table: 'game_rsvps', scope: ['game_id', 'team_id'], label: 'Equivalent game RSVP', fields: ['status'] },
  { table: 'tournament_match_rsvps', scope: ['match_id', 'team_id'], label: 'Equivalent tournament RSVP', fields: ['status'] },
  { table: 'team_event_rsvps', scope: ['team_event_id'], label: 'Equivalent event RSVP', fields: ['status'] },
  { table: 'event_participants', scope: ['event_id'], label: 'Equivalent participation' },
  { table: 'notification_preferences', scope: [], label: 'Compatible notification preferences' },
  { table: 'badge_awards', scope: ['badge_definition_id', 'scope_key'], label: 'Equivalent badge award',
    fields: ['league_id', 'season_id', 'team_id', 'tier', 'count', 'metadata', 'source'] },
  { table: 'badge_progress', scope: ['badge_definition_id', 'scope_key'], label: 'Preserved badge progress (not added)',
    fields: [] },
  { table: 'announcement_reactions', scope: ['announcement_id', 'emoji'], label: 'Duplicate reaction', fields: [] },
  { table: 'announcement_poll_votes', scope: ['poll_id', 'option_index'], label: 'Equivalent poll vote', fields: [] },
  { table: 'announcement_read_status', scope: ['announcement_id'], label: 'Duplicate read receipt', fields: [] },
  { table: 'announcement_visibility', scope: ['announcement_id'], label: 'Duplicate announcement access', fields: [] },
  { table: 'league_invites_sent', scope: ['league_id'], label: 'Duplicate delivered league invite', fields: [] },
  { table: 'invite_group_members', scope: ['group_id'], label: 'Duplicate invite-group membership', fields: [] },
  { table: 'scrimmage_reminders_sent', column: 'player_id', scope: ['scrimmage_id', 'hours_before'], label: 'Duplicate sent reminder', fields: [] },
  { table: 'scrimmage_requests', column: 'player_id', scope: ['scrimmage_id'], label: 'Equivalent scrimmage response',
    fields: ['status', 'team_assignment', 'backup_position', 'backup_notified_at'] },
  { table: 'scrimmage_co_hosts', scope: ['scrimmage_id'], label: 'Equivalent co-host permissions',
    fields: ['can_approve_requests', 'can_send_reminders', 'can_manage_payments'] },
  { table: 'rsvp_reminders_sent', scope: ['event_type', 'event_id'], label: 'Duplicate sent RSVP reminder', fields: [] },
  { table: 'event_reminders_sent', column: 'player_id', scope: ['event_type', 'event_id', 'trigger_key'], label: 'Duplicate sent event reminder', fields: [] },
  { table: 'league_pro_seats', scope: ['grant_id'], label: 'Duplicate league-provided seat', fields: ['league_id'] },
  { table: 'chat_poll_votes', scope: ['poll_id'], label: 'Equivalent chat poll vote', fields: ['option_index'] },
  { table: 'message_reactions', scope: ['message_id', 'emoji'], label: 'Duplicate message reaction', fields: [] },
  { table: 'message_read_receipts', scope: ['message_id'], label: 'Duplicate message receipt', fields: [] },
  { table: 'conversation_participants', scope: ['conversation_id'], label: 'Equivalent conversation participation', fields: [] },
  { table: 'birthday_greetings', scope: ['birthday_date'], label: 'Duplicate birthday delivery history', fields: [] },
];

export const additionalTransferableReferences = [
  'substitution_approvals.approver_id', 'announcement_visibility.user_id',
  'player_merge_requests.existing_user_id', 'player_merge_requests.reviewed_by',
  'leagues.commissioner_id', 'teams.captain_id', 'teams.creator_id',
  'league_memberships.approved_by', 'team_memberships.approved_by',
  'scrimmages.creator_id', 'scrimmage_co_hosts.user_id', 'scrimmage_co_hosts.added_by',
  'invite_groups.creator_id',
  'substitute_requests.original_player_id', 'substitute_requests.substitute_player_id', 'substitute_requests.requested_by',
  'games.home_beverage_duty_user_id', 'games.away_beverage_duty_user_id',
  'game_score_submissions.submitted_by', 'game_stars.awarded_by',
  'badge_awards.awarded_by', 'league_pro_seats.user_id',
  'users.created_by',
  'line_combination_assignments.player_id',
];
const q = (s: string) => `"${s.replaceAll('"', '""')}"`;
export function collisionScope(def: CollisionDefinition) {
  return def.scope.length ? def.scope.map(c => `s.${q(c)} IS NOT DISTINCT FROM d.${q(c)}`).join(' AND ') : 'TRUE';
}
export function collisionEquivalent(def: CollisionDefinition) {
  if (def.table === 'notification_preferences') return `s.notification_settings IS NOT DISTINCT FROM d.notification_settings
    AND s.push_enabled IS NOT DISTINCT FROM d.push_enabled
    AND (s.onesignal_player_id IS NULL OR s.onesignal_player_id=d.onesignal_player_id)
    AND (s.onesignal_external_id IS NULL OR s.onesignal_external_id=d.onesignal_external_id)`;
  if (def.membership) {
    const nullable = def.membership === 'league'
      ? ['assigned_team_id', 'position', 'jersey_number', 'skill_level', 'display_first_name', 'display_last_name', 'notes']
      : ['position', 'jersey_number'];
    return `NOT ((s.status='rejected') IS DISTINCT FROM (d.status='rejected'))
      AND ${nullable.map(c => `(s.${q(c)} IS NULL OR d.${q(c)} IS NULL OR s.${q(c)} IS NOT DISTINCT FROM d.${q(c)})`).join(' AND ')}`;
  }
  if (def.fields) return def.fields.length
    ? def.fields.map(c => `s.${q(c)} IS NOT DISTINCT FROM d.${q(c)}`).join(' AND ') : 'TRUE';
  return `(to_jsonb(s)-ARRAY['id','${def.column ?? 'user_id'}','created_at','updated_at']::text[])
    = (to_jsonb(d)-ARRAY['id','${def.column ?? 'user_id'}','created_at','updated_at']::text[])`;
}

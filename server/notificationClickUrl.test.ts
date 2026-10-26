import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getNotificationClickUrl } from './notificationClickUrl';

const APP_URL = 'https://www.roster-app.com';

describe('push notification click destinations', () => {
  const cases: Array<[string, Record<string, string>, string]> = [
    ['team award selects My Team', { type: 'team_award', teamId: 'team-1' }, `${APP_URL}/teams?awardTeam=team-1`],
    ['message thread', { type: 'message', conversationId: 'conv-1' }, `${APP_URL}/messages/conv-1`],
    ['payment request', { type: 'payment_request', paymentRequestId: 'pay-1' }, `${APP_URL}/payment-requests/pay-1`],
    ['tournament', { type: 'tournament_access_open', tournamentId: 't-1' }, `${APP_URL}/tournaments/t-1`],
    ['changed tournament schedule', { type: 'tournament_schedule_changed', tournamentId: 't-1' }, `${APP_URL}/tournaments/t-1`],
    ['game substitution', { type: 'substitution', gameId: 'g-1' }, `${APP_URL}/game/g-1`],
    ['captain RSVP update', { type: 'player_rsvp', gameId: 'g-1', teamId: 'team-1' }, `${APP_URL}/game/g-1`],
    ['game schedule change', { type: 'game_schedule_changed', gameId: 'g-1' }, `${APP_URL}/game/g-1`],
    ['team join request', { type: 'join_request', entityType: 'team', requestId: 'r-1', entityId: 'l-1' }, `${APP_URL}/league-management/l-1`],
    ['league join request', { type: 'join_request', entityType: 'league', requestId: 'r-1', entityId: 'l-1' }, `${APP_URL}/league-management/l-1`],
    ['league approval', { type: 'membership_approved', leagueId: 'l-1' }, `${APP_URL}/league-list`],
    ['team league approval', { type: 'team_league_approved', leagueId: 'l-1' }, `${APP_URL}/league-list`],
    ['team', { type: 'added_to_team', teamId: 'team-1' }, `${APP_URL}/team/team-1`],
    ['game reminder', { type: 'schedule_reminder', eventType: 'game', eventId: 'g-1' }, `${APP_URL}/game/g-1`],
    ['scrimmage reminder', { type: 'schedule_reminder', eventType: 'scrimmage', eventId: 's-1' }, `${APP_URL}/scrimmage/s-1`],
    ['announcement', { type: 'announcement', announcementId: 'a-1' }, `${APP_URL}/announcements`],
    ['wall reply', { type: 'wall_reply', announcementId: 'a-1' }, `${APP_URL}/announcements`],
    ['scrimmage', { type: 'scrimmage_invite', scrimmageId: 's-1' }, `${APP_URL}/scrimmage/s-1`],
    ['scrimmage open spot', { type: 'scrimmage_open_spot', scrimmageId: 's-1' }, `${APP_URL}/scrimmage/s-1`],
    ['scrimmage approval', { type: 'scrimmage_approved', scrimmageId: 's-1' }, `${APP_URL}/scrimmage/s-1`],
    ['scrimmage update', { type: 'scrimmage_updated', scrimmageId: 's-1' }, `${APP_URL}/scrimmage/s-1`],
    ['scrimmage withdrawal', { type: 'scrimmage_player_withdrawn', scrimmageId: 's-1' }, `${APP_URL}/scrimmage/s-1`],
    ['scrimmage co-host', { type: 'scrimmage_cohost_added', scrimmageId: 's-1' }, `${APP_URL}/scrimmage/s-1`],
    ['scrimmage cancellation', { type: 'scrimmage_canceled', scrimmageId: 's-1' }, `${APP_URL}/scrimmage/s-1`],
    ['co-commissioner management', { type: 'co_commissioner_added', leagueId: 'l-1' }, `${APP_URL}/league-management/l-1`],
    ['commissioner management', { type: 'commissioner_transfer', leagueId: 'l-1' }, `${APP_URL}/league-management/l-1`],
    ['personal reminder', { type: 'personal_reminder', reminderId: 'rem-1' }, `${APP_URL}/calendar`],
    ['team event', { type: 'team_event', teamEventId: 'event-1' }, `${APP_URL}/team-event/event-1`],
    ['game RSVP reminder', { type: 'rsvp_reminder', eventType: 'game', eventId: 'g-1' }, `${APP_URL}/game/g-1`],
    ['team event RSVP reminder', { type: 'rsvp_reminder', eventType: 'team_event', eventId: 'event-1' }, `${APP_URL}/team-event/event-1`],
    ['tournament RSVP reminder', { type: 'rsvp_reminder', eventType: 'tournament_match', eventId: 'match-1' }, `${APP_URL}/tournaments`],
    ['league photo tag', { type: 'photo_tag', entityType: 'league', entityId: 'l-1' }, `${APP_URL}/media/league/l-1`],
    ['tournament photo tag', { type: 'photo_tag', entityType: 'tournament', entityId: 't-1' }, `${APP_URL}/media/tournament/t-1`],
    ['draft', { type: 'draft_starting', draftId: 'draft-1' }, `${APP_URL}/draft/draft-1`],
    ['signup alert', { type: 'admin_new_signup', newUserId: 'u-1' }, `${APP_URL}/user/u-1`],
    ['birthday', { type: 'birthday' }, `${APP_URL}/?notification=1`],
    ['trivia', { type: 'daily_trivia' }, `${APP_URL}/?trivia=1`],
  ];

  for (const [label, data, expectedUrl] of cases) {
    it(`uses a valid app route for ${label}`, () => {
      assert.equal(getNotificationClickUrl(data, APP_URL), expectedUrl);
    });
  }

  it('encodes resource IDs before adding them to a route', () => {
    assert.equal(
      getNotificationClickUrl({ type: 'message', conversationId: 'a/b c' }, APP_URL),
      `${APP_URL}/messages/a%2Fb%20c`,
    );
  });

  it('falls back to the app root when a destination is missing or unknown', () => {
    assert.equal(getNotificationClickUrl({ type: 'message' }, APP_URL), `${APP_URL}/?notification=1`);
    assert.equal(getNotificationClickUrl({ type: 'future_notification' }, APP_URL), `${APP_URL}/?notification=1`);
    assert.equal(getNotificationClickUrl(undefined, APP_URL), `${APP_URL}/?notification=1`);
  });
});

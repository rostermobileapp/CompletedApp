type NotificationData = Record<string, string> | undefined;

/**
 * Give every push an explicit, app-owned destination. OneSignal's configured
 * default URL can otherwise send a valid notification to an obsolete route.
 */
export function getNotificationClickUrl(data: NotificationData, appBaseUrl: string): string {
  const baseUrl = appBaseUrl.replace(/\/+$/, '');
  // Root-targeted pushes must be distinguishable from an ordinary app launch,
  // otherwise last-screen restoration can silently replace the intended Home.
  const urlFor = (path: string) => `${baseUrl}${path === '/' ? '/?notification=1' : path}`;
  const id = (field: string) => {
    const value = data?.[field]?.trim();
    return value ? encodeURIComponent(value) : undefined;
  };
  const resourcePath = (field: string, prefix: string) => {
    const value = id(field);
    return value ? `${prefix}${value}` : '/';
  };

  switch (data?.type) {
    case 'daily_trivia':
      return urlFor('/?trivia=1');
    case 'message':
      return urlFor(resourcePath('conversationId', '/messages/'));
    case 'payment_request':
      return urlFor(resourcePath('paymentRequestId', '/payment-requests/'));
    case 'tournament_access_open':
    case 'tournament_schedule_changed':
      return urlFor(resourcePath('tournamentId', '/tournaments/'));
    case 'substitution':
    case 'player_rsvp':
      return urlFor(resourcePath('gameId', '/game/'));
    case 'join_request':
      return urlFor(resourcePath('entityId', '/league-management/'));
    case 'membership_approved':
    case 'team_league_approved':
      return urlFor('/league-list');
    case 'added_to_team':
      return urlFor(resourcePath('teamId', '/team/'));
    case 'schedule_reminder':
      return urlFor(data.eventType === 'scrimmage'
        ? resourcePath('eventId', '/scrimmage/')
        : data.eventType === 'game'
          ? resourcePath('eventId', '/game/')
          : '/');
    case 'announcement':
    case 'wall_reply':
      return urlFor('/announcements');
    case 'scrimmage_invite':
    case 'scrimmage_open_spot':
    case 'scrimmage_approved':
    case 'scrimmage_updated':
    case 'scrimmage_player_withdrawn':
    case 'scrimmage_cohost_added':
    case 'scrimmage_canceled':
      return urlFor(resourcePath('scrimmageId', '/scrimmage/'));
    case 'co_commissioner_added':
    case 'commissioner_transfer': {
      const leagueId = id('leagueId');
      return leagueId ? urlFor(`/league-management/${leagueId}`) : urlFor('/');
    }
    case 'personal_reminder':
      return urlFor('/calendar');
    case 'team_event':
      return urlFor(resourcePath('teamEventId', '/team-event/'));
    case 'rsvp_reminder':
      if (data.eventType === 'game') return urlFor(resourcePath('eventId', '/game/'));
      if (data.eventType === 'team_event') return urlFor(resourcePath('eventId', '/team-event/'));
      return data.eventType === 'tournament_match' ? urlFor('/tournaments') : urlFor('/');
    case 'photo_tag':
      if (data.entityType === 'league' || data.entityType === 'tournament') {
        return urlFor(resourcePath('entityId', `/media/${data.entityType}/`));
      }
      return urlFor('/');
    case 'draft_starting':
      return urlFor(resourcePath('draftId', '/draft/'));
    case 'admin_new_signup':
      return urlFor(resourcePath('newUserId', '/user/'));
    case 'birthday':
    default:
      return urlFor('/');
  }
}

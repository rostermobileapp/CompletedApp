import { useQuery } from '@tanstack/react-query';

function usePrefetch(queryKey: unknown[], enabled: boolean, staleTime = 30000) {
  return useQuery({ queryKey, enabled, retry: 2, staleTime });
}

export function useAppDataPrefetch(enabled = true) {
  // Account is already available before App enables this hook. Home data goes
  // first; all other screens still query immediately when actually opened.
  const userQuery = usePrefetch(['/api/user'], enabled);
  const userTeamsQuery = usePrefetch(['/api/user/teams'], enabled);
  const upcomingGamesQuery = usePrefetch(['/api/user/games/upcoming'], enabled);
  const leagueMembershipsQuery = usePrefetch(['/api/user/league-memberships'], enabled);
  const userLeaguesQuery = usePrefetch(['/api/user/leagues'], enabled);
  const scrimmageInvitesQuery = usePrefetch(['/api/users/scrimmage-invites'], enabled);
  const notificationsQuery = usePrefetch(['/api/notifications'], enabled, 10000);
  const personalRemindersQuery = usePrefetch(['/api/user/personal-reminders'], enabled);
  const teamEventsQuery = usePrefetch(['/api/user/team-events'], enabled);

  const homeQueries = [
    userQuery, userTeamsQuery, upcomingGamesQuery, leagueMembershipsQuery, userLeaguesQuery,
  ];
  // Errors count as settled so one failed Home endpoint cannot permanently
  // suppress unrelated background data. No added cache or freshness changes.
  const backgroundEnabled = enabled && homeQueries.every(query => !query.isPending);
  const userTeams = (userTeamsQuery.data as any[]) || [];
  const primaryTeamId = userTeams.find((team: any) => team.id)?.id;
  const primaryLeagueId = userTeams.find((team: any) => team.leagueId)?.leagueId;

  const teamMembersQuery = usePrefetch(
    ['/api/teams', primaryTeamId, 'members'], backgroundEnabled && !!primaryTeamId,
  );
  const leagueStandingsQuery = usePrefetch(
    ['/api/leagues', primaryLeagueId, 'standings'], backgroundEnabled && !!primaryLeagueId, 60000,
  );
  const leagueGamesQuery = usePrefetch(
    ['/api/leagues', primaryLeagueId, 'games'], backgroundEnabled && !!primaryLeagueId,
  );
  const conversationsQuery = usePrefetch(['/api/conversations'], backgroundEnabled);
  const unreadMessageCountQuery = usePrefetch(['/api/messages/unread-count'], backgroundEnabled, 5000);
  const unreadCountPerConversationQuery = usePrefetch(
    ['/api/messages/unread-count-per-conversation'], backgroundEnabled, 5000,
  );
  const unpaidCountQuery = usePrefetch(['/api/payment-requests/unpaid-count'], backgroundEnabled, 10000);
  const createdPaymentsQuery = usePrefetch(['/api/payment-requests/created/by-me'], backgroundEnabled);
  const receivedPaymentsQuery = usePrefetch(['/api/payment-requests/received/by-me'], backgroundEnabled);
  const userStatsQuery = usePrefetch(['/api/user/stats/aggregate'], backgroundEnabled, 60000);

  const allQueries = [
    ...homeQueries, conversationsQuery, unreadMessageCountQuery, unreadCountPerConversationQuery,
    unpaidCountQuery, createdPaymentsQuery, receivedPaymentsQuery, userStatsQuery,
    scrimmageInvitesQuery, notificationsQuery, personalRemindersQuery, teamEventsQuery,
    ...(primaryTeamId ? [teamMembersQuery] : []),
    ...(primaryLeagueId ? [leagueStandingsQuery, leagueGamesQuery] : []),
  ];

  return {
    isLoading: enabled && allQueries.some(query => query.isLoading && !query.isError),
    hasError: enabled && allQueries.some(query => query.isError),
    data: enabled ? {
      user: userQuery.data,
      userTeams: userTeamsQuery.data,
      upcomingGames: upcomingGamesQuery.data,
      leagueMemberships: leagueMembershipsQuery.data,
      conversations: conversationsQuery.data,
      userLeagues: userLeaguesQuery.data,
      unreadMessageCount: unreadMessageCountQuery.data,
      unreadCountPerConversation: unreadCountPerConversationQuery.data,
      unpaidCount: unpaidCountQuery.data,
      createdPayments: createdPaymentsQuery.data,
      receivedPayments: receivedPaymentsQuery.data,
      userStats: userStatsQuery.data,
      scrimmageInvites: scrimmageInvitesQuery.data,
      notifications: notificationsQuery.data,
    } : {},
  };
}

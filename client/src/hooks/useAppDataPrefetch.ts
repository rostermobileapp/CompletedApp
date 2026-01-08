import { useQuery, useQueries } from '@tanstack/react-query';

export function useAppDataPrefetch(enabled: boolean = true) {
  // Essential data for Dashboard & Profile
  const userQuery = useQuery({
    queryKey: ['/api/user'],
    enabled,
    retry: 2,
    staleTime: 30000,
  });

  // Essential data for Teams screen
  const userTeamsQuery = useQuery({
    queryKey: ['/api/user/teams'],
    enabled,
    retry: 2,
    staleTime: 30000,
  });

  // Get team IDs and league IDs from user teams for dependent queries
  const userTeams = (userTeamsQuery.data as any[]) || [];
  const teamIds = userTeams.map((t: any) => t.id).filter(Boolean);
  const leagueIdSet = new Set(userTeams.map((t: any) => t.leagueId).filter(Boolean));
  const leagueIds = Array.from(leagueIdSet);
  const primaryTeamId = teamIds[0];
  const primaryLeagueId = leagueIds[0];

  // Prefetch team members for the primary team (Teams screen)
  const teamMembersQuery = useQuery({
    queryKey: ['/api/teams', primaryTeamId, 'members'],
    enabled: enabled && !!primaryTeamId,
    retry: 2,
    staleTime: 30000,
  });

  // Prefetch league standings for the primary league (Teams & Dashboard screens)
  const leagueStandingsQuery = useQuery({
    queryKey: ['/api/leagues', primaryLeagueId, 'standings'],
    enabled: enabled && !!primaryLeagueId,
    retry: 2,
    staleTime: 60000,
  });

  // Prefetch league games for schedule display (Dashboard screen)
  const leagueGamesQuery = useQuery({
    queryKey: ['/api/leagues', primaryLeagueId, 'games'],
    enabled: enabled && !!primaryLeagueId,
    retry: 2,
    staleTime: 30000,
  });

  const upcomingGamesQuery = useQuery({
    queryKey: ['/api/user/games/upcoming'],
    enabled,
    retry: 2,
    staleTime: 30000,
  });

  const leagueMembershipsQuery = useQuery({
    queryKey: ['/api/user/league-memberships'],
    enabled,
    retry: 2,
    staleTime: 30000,
  });

  // Essential data for Messages screen
  const conversationsQuery = useQuery({
    queryKey: ['/api/conversations'],
    enabled,
    retry: 2,
    staleTime: 30000,
  });

  const userLeaguesQuery = useQuery({
    queryKey: ['/api/user/leagues'],
    enabled,
    retry: 2,
    staleTime: 30000,
  });

  const unreadMessageCountQuery = useQuery({
    queryKey: ['/api/messages/unread-count'],
    enabled,
    retry: 2,
    staleTime: 5000,
  });

  const unreadCountPerConversationQuery = useQuery({
    queryKey: ['/api/messages/unread-count-per-conversation'],
    enabled,
    retry: 2,
    staleTime: 5000,
  });

  // Essential data for Payments screen
  const unpaidCountQuery = useQuery({
    queryKey: ['/api/payment-requests/unpaid-count'],
    enabled,
    retry: 2,
    staleTime: 10000,
  });

  const createdPaymentsQuery = useQuery({
    queryKey: ['/api/payment-requests/created/by-me'],
    enabled,
    retry: 2,
    staleTime: 30000,
  });

  const receivedPaymentsQuery = useQuery({
    queryKey: ['/api/payment-requests/received/by-me'],
    enabled,
    retry: 2,
    staleTime: 30000,
  });

  // Essential data for Profile screen
  const userStatsQuery = useQuery({
    queryKey: ['/api/user/stats/aggregate'],
    enabled,
    retry: 2,
    staleTime: 60000,
  });

  // Essential data for Dashboard alerts
  const scrimmageInvitesQuery = useQuery({
    queryKey: ['/api/users/scrimmage-invites'],
    enabled,
    retry: 2,
    staleTime: 30000,
  });

  const notificationsQuery = useQuery({
    queryKey: ['/api/notifications'],
    enabled,
    retry: 2,
    staleTime: 10000,
  });

  // If not enabled, we're not loading
  if (!enabled) {
    return { isLoading: false, hasError: false, data: {} };
  }

  // Check if all critical queries are loaded (isLoading means initial load, not refetch)
  const baseQueries = [
    userQuery,
    userTeamsQuery,
    upcomingGamesQuery,
    leagueMembershipsQuery,
    conversationsQuery,
    userLeaguesQuery,
    unreadMessageCountQuery,
    unreadCountPerConversationQuery,
    unpaidCountQuery,
    createdPaymentsQuery,
    receivedPaymentsQuery,
    userStatsQuery,
    scrimmageInvitesQuery,
    notificationsQuery,
  ];

  // Dependent queries (only check if their preconditions are met)
  const dependentQueries = [];
  if (primaryTeamId) {
    dependentQueries.push(teamMembersQuery);
  }
  if (primaryLeagueId) {
    dependentQueries.push(leagueStandingsQuery);
    dependentQueries.push(leagueGamesQuery);
  }

  const allQueries = [...baseQueries, ...dependentQueries];

  // Consider loading complete if query has finished (success or error)
  // This prevents the app from being stuck on loading screen if an API fails
  const isLoading = allQueries.some(q => q.isLoading && !q.isError);
  const hasError = allQueries.some(q => q.isError);

  return {
    isLoading,
    hasError,
    data: {
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
    },
  };
}

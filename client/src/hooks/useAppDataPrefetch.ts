import { useQuery } from '@tanstack/react-query';

export function useAppDataPrefetch(enabled: boolean = true) {
  // Essential data for Teams screen
  const userTeamsQuery = useQuery({
    queryKey: ['/api/user/teams'],
    enabled,
  });

  const upcomingGamesQuery = useQuery({
    queryKey: ['/api/user/games/upcoming'],
    enabled,
  });

  const leagueMembershipsQuery = useQuery({
    queryKey: ['/api/user/league-memberships'],
    enabled,
  });

  // Essential data for Messages screen
  const conversationsQuery = useQuery({
    queryKey: ['/api/conversations'],
    enabled,
  });

  const userLeaguesQuery = useQuery({
    queryKey: ['/api/user/leagues'],
    enabled,
  });

  // Essential data for Payments screen
  const unpaidCountQuery = useQuery({
    queryKey: ['/api/payment-requests/unpaid-count'],
    enabled,
  });

  const createdPaymentsQuery = useQuery({
    queryKey: ['/api/payment-requests/created/by-me'],
    enabled,
  });

  const receivedPaymentsQuery = useQuery({
    queryKey: ['/api/payment-requests/received/by-me'],
    enabled,
  });

  // Essential data for Profile screen
  const userQuery = useQuery({
    queryKey: ['/api/user'],
    enabled,
  });

  const userStatsQuery = useQuery({
    queryKey: ['/api/user/stats/aggregate'],
    enabled,
  });

  // If not enabled, we're not loading
  if (!enabled) {
    return { isLoading: false, data: {} };
  }

  // Check if all critical queries are loaded
  const isLoading = 
    userTeamsQuery.isLoading ||
    upcomingGamesQuery.isLoading ||
    leagueMembershipsQuery.isLoading ||
    conversationsQuery.isLoading ||
    userLeaguesQuery.isLoading ||
    unpaidCountQuery.isLoading ||
    createdPaymentsQuery.isLoading ||
    receivedPaymentsQuery.isLoading ||
    userQuery.isLoading ||
    userStatsQuery.isLoading;

  return {
    isLoading,
    data: {
      userTeams: userTeamsQuery.data,
      upcomingGames: upcomingGamesQuery.data,
      leagueMemberships: leagueMembershipsQuery.data,
      conversations: conversationsQuery.data,
      userLeagues: userLeaguesQuery.data,
      unpaidCount: unpaidCountQuery.data,
      createdPayments: createdPaymentsQuery.data,
      receivedPayments: receivedPaymentsQuery.data,
      user: userQuery.data,
      userStats: userStatsQuery.data,
    },
  };
}

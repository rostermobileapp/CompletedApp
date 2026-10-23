import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { TeamAwardCelebrations } from '@shared/teamAwards';

export const teamAwardCelebrationKey = (userId?: string) =>
  ['/api/team-awards/events/pending', userId] as const;

export function useTeamAwardCelebrations(userId?: string, enabled = true) {
  return useQuery<TeamAwardCelebrations>({
    queryKey: teamAwardCelebrationKey(userId),
    queryFn: async () => (await apiRequest('GET', '/api/team-awards/events/pending')).json(),
    enabled: !!userId && enabled,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: query => query.state.data?.setupRequired ||
      (typeof document !== 'undefined' && document.hidden) ? false : 15_000,
    retry: 1,
  });
}

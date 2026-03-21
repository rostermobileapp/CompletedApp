import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

/**
 * Returns a map of leagueId → total unread message count across all
 * conversations that belong to that league.
 *
 * Uses already-cached query data so it doesn't issue new network requests.
 */
export function useLeagueUnreadMessages(): Record<string, number> {
  const { data: conversations = [] } = useQuery<any[]>({
    queryKey: ['/api/conversations'],
    staleTime: 30000,
  });

  const { data: unreadData } = useQuery<{ unreadCounts: Record<string, number> }>({
    queryKey: ['/api/messages/unread-count-per-conversation'],
    staleTime: 0,
  });

  return useMemo(() => {
    const map: Record<string, number> = {};
    const unreadCounts = unreadData?.unreadCounts ?? {};

    if (!Array.isArray(conversations)) return map;

    conversations.forEach((conv: any) => {
      const leagueId = conv.leagueId;
      if (!leagueId) return;
      const count = unreadCounts[conv.id] || 0;
      if (count > 0) {
        map[leagueId] = (map[leagueId] || 0) + count;
      }
    });

    return map;
  }, [conversations, unreadData]);
}

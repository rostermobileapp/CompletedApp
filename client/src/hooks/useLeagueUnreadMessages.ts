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

  // Server returns: { unreadCounts: Array<{ conversationId: string; unreadCount: number }> }
  // staleTime is intentionally omitted here — Messages.tsx owns the polling for this key.
  // This hook just reads from the shared TanStack Query cache.
  const { data: unreadData } = useQuery<{
    unreadCounts: Array<{ conversationId: string; unreadCount: number }>;
  }>({
    queryKey: ['/api/messages/unread-count-per-conversation'],
  });

  return useMemo(() => {
    const leagueMap: Record<string, number> = {};
    const unreadArray = unreadData?.unreadCounts ?? [];

    if (!Array.isArray(conversations) || unreadArray.length === 0) return leagueMap;

    // Build a quick conversationId → unreadCount lookup from the array
    const convUnreadMap: Record<string, number> = {};
    unreadArray.forEach((item) => {
      convUnreadMap[item.conversationId] = item.unreadCount;
    });

    // Accumulate unread counts per league
    conversations.forEach((conv: any) => {
      const leagueId = conv.leagueId;
      if (!leagueId) return;
      const count = convUnreadMap[conv.id] || 0;
      if (count > 0) {
        leagueMap[leagueId] = (leagueMap[leagueId] || 0) + count;
      }
    });

    return leagueMap;
  }, [conversations, unreadData]);
}

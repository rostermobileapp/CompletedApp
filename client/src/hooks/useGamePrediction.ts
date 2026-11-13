import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { WinChanceData, WinChanceSummary } from "@/components/WinChanceSheet";

export function shouldRetryGamePrediction(failureCount: number, error: unknown) {
  const status = (error as { status?: number } | null)?.status;
  // Retry transient transport/server failures, never authorization failures.
  return failureCount < 2 && (status == null || status >= 500 || status === 408 || status === 429);
}

export function useGamePrediction(gameId: string, viewerTeamId?: string) {
  return useQuery<WinChanceData | WinChanceSummary | null>({
    queryKey: [`/api/games/${gameId}/prediction`],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/games/${gameId}/prediction`);
      return response.json();
    },
    enabled: !!gameId && !!viewerTeamId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: shouldRetryGamePrediction,
    retryDelay: attempt => Math.min(500 * 2 ** attempt, 2000),
  });
}

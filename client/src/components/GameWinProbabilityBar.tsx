import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { WinChanceData } from "@/components/WinChanceSheet";

interface GameWinProbabilityBarProps {
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  viewerTeamIds: string[];
  className?: string;
}

export function GameWinProbabilityBar({
  gameId,
  homeTeamId,
  awayTeamId,
  homeTeamName,
  awayTeamName,
  viewerTeamIds,
  className,
}: GameWinProbabilityBarProps) {
  const viewerTeamId = viewerTeamIds.find(
    (teamId) => teamId === homeTeamId || teamId === awayTeamId,
  );

  const { data: prediction } = useQuery<WinChanceData | null>({
    queryKey: [`/api/games/${gameId}/prediction`],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/games/${gameId}/prediction`);
      if (!response.ok) return null;
      return response.json();
    },
    enabled: !!gameId && !!viewerTeamId,
    staleTime: 30_000,
    retry: false,
  });

  if (!viewerTeamId || !prediction) return null;

  const viewerIsHome = viewerTeamId === prediction.homeTeamId;
  const rawChance = viewerIsHome
    ? prediction.homeWinProbability
    : prediction.awayWinProbability;
  const chance = Math.min(1, Math.max(0, rawChance ?? 0));
  const chancePercent = Math.round(chance * 100);
  const labelPosition = Math.min(94, Math.max(6, chance * 100));
  const viewerTeamName = viewerIsHome ? homeTeamName : awayTeamName;
  const opponentTeamName = viewerIsHome ? awayTeamName : homeTeamName;

  return (
    <div
      className={cn("relative mt-2 h-6 w-full", className)}
      role="meter"
      aria-label={`${viewerTeamName} estimated chance to win`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={chancePercent}
      aria-valuetext={`${chancePercent}% for ${viewerTeamName}, ${100 - chancePercent}% for ${opponentTeamName}`}
      data-testid={`game-win-probability-${gameId}`}
    >
      <div className="absolute inset-x-0 bottom-1 flex h-1.5 overflow-hidden rounded-full bg-[#ef4444]">
        <div
          className="h-full bg-[#22c55e]"
          style={{ width: `${chance * 100}%` }}
        />
      </div>
      <div
        className="absolute bottom-0 z-10 h-3 w-[2px] -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
        style={{ left: `${chance * 100}%` }}
        aria-hidden="true"
      />
      <span
        className="absolute bottom-2 z-10 -translate-x-1/2 rounded px-1 text-[10px] font-bold leading-4 text-foreground bg-[#e2e2e2] dark:bg-[#212121]"
        style={{ left: `${labelPosition}%` }}
        aria-hidden="true"
      >
        {chancePercent}%
      </span>
    </div>
  );
}

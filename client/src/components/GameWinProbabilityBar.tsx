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
  const viewerTeamName = viewerIsHome ? homeTeamName : awayTeamName;
  const opponentTeamName = viewerIsHome ? awayTeamName : homeTeamName;

  return (
    <div
      className={cn("mt-[-10px] flex h-7 w-full items-center gap-2", className)}
      data-testid={`game-win-probability-${gameId}`}
    >
      <div
        className="relative h-5 min-w-0 flex-1"
        role="meter"
        aria-label={`${viewerTeamName} estimated chance to win`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={chancePercent}
        aria-valuetext={`${chancePercent}% for ${viewerTeamName}, ${100 - chancePercent}% for ${opponentTeamName}`}
      >
        <div className="absolute inset-x-0 top-1/2 flex h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-[#ef4444]">
          <div
            className="h-full bg-[#22c55e]"
            style={{ width: `${chance * 100}%` }}
          />
        </div>
        <div
          className="absolute left-0 top-1/2 z-10 h-3.5 w-[2px] -translate-x-1/2 -translate-y-1/2 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
          style={{ left: `${chance * 100}%` }}
          aria-hidden="true"
        />
      </div>
      <div className="w-[82px] shrink-0 text-right leading-none" aria-hidden="true">
        <span className="block text-sm font-bold tabular-nums">{chancePercent}%</span>
        <span className="mt-0.5 block whitespace-nowrap text-[10px] text-muted-foreground">
          Chance to Win
        </span>
      </div>
    </div>
  );
}

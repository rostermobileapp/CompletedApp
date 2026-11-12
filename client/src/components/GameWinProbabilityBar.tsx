import { useGamePrediction } from "@/hooks/useGamePrediction";
import { cn } from "@/lib/utils";

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

  const { data: prediction, isPending, isError, refetch } = useGamePrediction(gameId, viewerTeamId);

  if (!viewerTeamId) return null;
  if (!prediction) {
    return (
      <div className={cn("flex min-h-7 items-center text-[10px] text-muted-foreground", className)}
        data-testid={`game-win-probability-status-${gameId}`}>
        {isError ? (
          <button type="button" className="text-primary underline"
            onClick={event => { event.stopPropagation(); void refetch(); }}>
            Retry win chance
          </button>
        ) : (
          <span role="status">{isPending ? "Loading win chance…" : "Win chance unavailable"}</span>
        )}
      </div>
    );
  }

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
      <div className="flex shrink-0 items-baseline gap-1.5 whitespace-nowrap text-right leading-none" aria-hidden="true">
        <span className="text-sm font-bold tabular-nums">{chancePercent}%</span>
        <span className="text-[10px] text-muted-foreground">
          Chance to win
        </span>
      </div>
    </div>
  );
}

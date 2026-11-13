import { useState } from "react";
import { Lock } from "lucide-react";
import { useGamePrediction } from "@/hooks/useGamePrediction";
import { cn } from "@/lib/utils";
import { WinChanceSheet } from "@/components/WinChanceSheet";

interface GamePredictionButtonProps {
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  viewerTeamIds: string[];
  notAttending?: any[];
  className?: string;
  dataTestId?: string;
  compact?: boolean;
}

export function GamePredictionButton({
  gameId,
  homeTeamId,
  awayTeamId,
  homeTeamName,
  awayTeamName,
  viewerTeamIds,
  notAttending,
  className,
  dataTestId = "button-game-prediction",
  compact = false,
}: GamePredictionButtonProps) {
  const [open, setOpen] = useState(false);
  const viewerTeamId = viewerTeamIds.find(
    (teamId) => teamId === homeTeamId || teamId === awayTeamId,
  );

  const { data: prediction, isLoading, isError, refetch } = useGamePrediction(gameId, viewerTeamId);

  if (!viewerTeamId) return null;

  if (isLoading) {
    return (
      <div
        className={cn(
          compact
            ? "flex h-10 w-[148px] shrink-0 items-center justify-center rounded-lg border border-border text-xs text-muted-foreground"
            : "flex min-h-14 w-full items-center rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground",
          className,
        )}
        role="status"
        data-testid={`${dataTestId}-loading`}
      >
        {compact ? "Loading…" : "Loading game prediction…"}
      </div>
    );
  }

  if (!prediction) {
    return (
      <div className={cn("text-xs text-muted-foreground", className)} data-testid={`${dataTestId}-unavailable`}>
        {isError ? (
          <button type="button" className="text-primary underline"
            onClick={event => { event.stopPropagation(); void refetch(); }}>
            Retry game prediction
          </button>
        ) : <span role="status">Game prediction unavailable</span>}
      </div>
    );
  }

  if (!prediction.canViewDetails) {
    return (
      <a
        href="/subscription"
        className={cn(
          compact
            ? "flex h-10 w-[148px] shrink-0 items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm text-muted-foreground"
            : "flex min-h-14 w-full items-center gap-3 rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground",
          className,
        )}
        onClick={event => event.stopPropagation()}
        aria-label="View Odds requires Player Pro or Commissioner"
        title="Player Pro or Commissioner required"
        data-testid={`${dataTestId}-locked`}
      >
        <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          <span className="block font-semibold">View Odds</span>
          {!compact && <span className="block text-xs">Player Pro or Commissioner required</span>}
        </span>
      </a>
    );
  }

  const chance = viewerTeamId === prediction.homeTeamId
    ? prediction.homeWinProbability
    : prediction.awayWinProbability;
  const chancePercent = Math.round((chance ?? 0) * 100);

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          // Read the latest saved forecast; this never runs the calculator.
          void refetch();
          setOpen(true);
        }}
        className={cn(
          compact
            ? "flex h-10 w-[148px] shrink-0 items-center justify-center rounded-lg border-0 bg-[#0079f2] px-3 text-sm font-medium text-white transition-colors hover:bg-[#0067d1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            : "flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-left transition-colors hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          className,
        )}
        aria-label={`View odds, your team's estimated win chance is ${chancePercent}%`}
        data-testid={dataTestId}
      >
        {compact ? (
          "View Odds"
        ) : (
          <>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">View Odds</span>
              <span className="block text-xs text-muted-foreground">
                Your team’s estimated win chance · for fun
              </span>
            </span>
            <span className="shrink-0 text-xl font-bold tabular-nums text-primary">
              {chancePercent}%
            </span>
          </>
        )}
      </button>
      <WinChanceSheet
        open={open}
        onOpenChange={setOpen}
        prediction={prediction}
        homeTeamName={homeTeamName}
        awayTeamName={awayTeamName}
        viewerTeamId={viewerTeamId}
        notAttending={notAttending}
      />
    </>
  );
}

import { GameWinProbabilityBar } from "@/components/GameWinProbabilityBar";

interface ScheduledGame {
  id: string;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  homeTeam?: { id?: string; name?: string } | null;
  awayTeam?: { id?: string; name?: string } | null;
  isScrimmage?: boolean;
  isTournamentMatch?: boolean;
  isCompleted?: boolean;
}

/** Use the same roster that made the schedule card visible. A second roster
 * observer must not silently suppress the prediction area inside that card. */
export function ScheduledGamePrediction({
  game,
  viewerTeams,
}: {
  game: ScheduledGame;
  viewerTeams: readonly { id: string }[];
}) {
  if (game.isScrimmage || game.isTournamentMatch || game.isCompleted) return null;

  return (
    <GameWinProbabilityBar
      gameId={game.id}
      homeTeamId={String(game.homeTeamId ?? game.homeTeam?.id ?? "")}
      awayTeamId={String(game.awayTeamId ?? game.awayTeam?.id ?? "")}
      homeTeamName={game.homeTeam?.name || "Home team"}
      awayTeamName={game.awayTeam?.name || "Away team"}
      viewerTeamIds={viewerTeams.map(team => String(team.id))}
    />
  );
}

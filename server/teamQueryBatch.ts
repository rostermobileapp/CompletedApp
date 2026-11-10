type GameTeamIds = {
  homeTeamId: string;
  awayTeamId: string | null;
};

export function collectUniqueTeamIdsFromGames(games: readonly GameTeamIds[]): string[] {
  const teamIds = new Set<string>();

  for (const game of games) {
    teamIds.add(game.homeTeamId);
    if (game.awayTeamId) {
      teamIds.add(game.awayTeamId);
    }
  }

  return Array.from(teamIds);
}

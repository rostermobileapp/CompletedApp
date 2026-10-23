export type RecordedBeverageAssignment = {
  gameId: string;
  teamId: string;
  userId: string;
};

type BeverageDutyGame = {
  id: string;
  homeTeamId: string;
  awayTeamId?: string | null;
  homeBeverageDutyUserId?: string | null;
  awayBeverageDutyUserId?: string | null;
  beverageDutyAssignments?: RecordedBeverageAssignment[];
};

/** Attach only default beverage-duty assignments, fetched in one batch by the API. */
export function withBeverageDutyAssignments<T extends { id: string }>(
  games: T[],
  assignments: RecordedBeverageAssignment[],
) {
  const byGame = new Map<string, RecordedBeverageAssignment[]>();
  for (const assignment of assignments) {
    const entries = byGame.get(assignment.gameId) ?? [];
    entries.push(assignment);
    byGame.set(assignment.gameId, entries);
  }
  return games.map(game => ({ ...game, beverageDutyAssignments: byGame.get(game.id) ?? [] }));
}

/** Current recorded assignments, not a log of claims. Modern duties take precedence. */
export function countRecordedBeverageDuties(games: BeverageDutyGame[], teamId?: string | null) {
  const gamesByPlayer = new Map<string, Set<string>>();
  if (!teamId) return {};
  for (const game of games) {
    if (game.homeTeamId !== teamId && game.awayTeamId !== teamId) continue;
    const modern = (game.beverageDutyAssignments ?? []).filter(assignment => assignment.teamId === teamId);
    const claimants = modern.length
      ? modern.map(assignment => assignment.userId)
      : [
          game.homeTeamId === teamId ? game.homeBeverageDutyUserId : null,
          game.awayTeamId === teamId ? game.awayBeverageDutyUserId : null,
        ];
    for (const playerId of claimants) {
      if (!playerId) continue;
      const recordedGames = gamesByPlayer.get(playerId) ?? new Set<string>();
      recordedGames.add(game.id);
      gamesByPlayer.set(playerId, recordedGames);
    }
  }
  return Object.fromEntries([...gamesByPlayer].map(([playerId, recordedGames]) => [playerId, recordedGames.size]));
}

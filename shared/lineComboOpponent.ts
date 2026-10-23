export type LineComboOpponent = {
  version: "opponent-v1";
  status: "adjusted" | "no-upcoming-game" | "untracked-opponent" | "no-scored-history" | "unavailable";
  gameId?: string;
  opponentId?: string;
  opponentName?: string;
  gamesPlayed: number;
  goalsForPerGame?: number;
  goalsAgainstPerGame?: number;
  leagueGoalsPerTeam?: number;
  multiplier: number;
};

export type OpponentSummary = {
  gameId: string;
  opponentId: string | null;
  opponentName: string | null;
  gamesPlayed: number;
  goalsForPerGame: number | null;
  goalsAgainstPerGame: number | null;
  leagueGoalsPerTeam: number | null;
};

/** Conservative matchup heuristic, not a claim that opponent offense causes player points. */
export function buildOpponentAdjustment(summary?: OpponentSummary): LineComboOpponent {
  if (!summary) return { version: "opponent-v1", status: "no-upcoming-game", gamesPlayed: 0, multiplier: 1 };
  const context: LineComboOpponent = {
    version: "opponent-v1", status: "no-scored-history",
    gameId: summary.gameId, opponentId: summary.opponentId ?? undefined,
    opponentName: summary.opponentName ?? undefined, gamesPlayed: summary.gamesPlayed, multiplier: 1,
  };
  if (!summary.opponentId) return { ...context, status: "untracked-opponent" };
  const { goalsForPerGame: gf, goalsAgainstPerGame: ga, leagueGoalsPerTeam: league, gamesPlayed: n } = summary;
  if (!Number.isFinite(n) || n < 1 || gf == null || ga == null || league == null ||
    !Number.isFinite(gf) || !Number.isFinite(ga) || !Number.isFinite(league) || gf < 0 || ga < 0 || league <= 0) return context;
  // Five league-average prior games prevent one shutout/blowout dominating the estimate.
  const defenseRatio = (n * ga + 5 * league) / ((n + 5) * league);
  const paceRatio = (n * gf + 5 * league) / ((n + 5) * league);
  return {
    ...context, status: "adjusted", goalsForPerGame: gf, goalsAgainstPerGame: ga, leagueGoalsPerTeam: league,
    multiplier: Math.max(0.7, Math.min(1.3, defenseRatio ** 0.7 * paceRatio ** 0.15)),
  };
}

export function opponentAdjustedBaseline(base: number, opponent?: LineComboOpponent) {
  return base * (opponent?.status === "adjusted" ? opponent.multiplier : 1);
}

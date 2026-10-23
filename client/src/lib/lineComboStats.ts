import type { LineComboStats } from "../../../shared/lineComboPredictions";
import { learnLineComboCalibration } from "../../../shared/lineComboLearning";

type RequestStats = (path: string) => Promise<Pick<Response, "json">>;

function isPlayerStats(stats: any): stats is LineComboStats {
  return stats?.model === "sum-player-ppg-v1" && Array.isArray(stats.players) &&
    Array.isArray(stats.forward) && Array.isArray(stats.defense) &&
    (!stats.learning || stats.learning.version === "residual-pairs-v1");
}

function withOptionalOpponent(stats: LineComboStats): LineComboStats {
  return {
    ...stats,
    learning: stats.learning ?? learnLineComboCalibration([], false),
    opponent: stats.opponent?.version === "opponent-v1" ? stats.opponent : {
      version: "opponent-v1", status: "unavailable", gamesPlayed: 0, multiplier: 1,
    },
  };
}

/** Accept real player PPG even when optional matchup context is not deployed/available. */
export async function loadLineComboStats(request: RequestStats, teamId: string): Promise<LineComboStats> {
  const path = `/api/teams/${encodeURIComponent(teamId)}/line-combos/stats`;
  let stats: unknown;
  try {
    stats = await (await request(`${path}?model=adaptive-v2`)).json();
  } catch (error: any) {
    // Never retry around authentication/authorization failures.
    if (error?.status !== 404 && !(error?.status >= 500 && error?.status <= 599)) throw error;
  }
  if (isPlayerStats(stats)) return withOptionalOpponent(stats);
  // Older servers may ignore adaptive-v2 and return the legacy goals-only shape.
  // Request the supported PPG contract rather than treating goals as player points.
  const baseline = await (await request(`${path}?model=adaptive-v1`)).json();
  if (!isPlayerStats(baseline)) throw new Error("The line-combo player prediction model is unavailable.");
  return withOptionalOpponent(baseline);
}

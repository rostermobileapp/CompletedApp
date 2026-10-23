import { applyLineComboCalibration, type LineComboCalibration } from "./lineComboLearning";
import { opponentAdjustedBaseline, type LineComboOpponent } from "./lineComboOpponent";

export type ComboLineType = "forward" | "defense";
export type ComboHistoryRow = {
  lineId: string;
  gameId: string;
  lineType: ComboLineType;
  playerId: string;
  points: number;
};
export type RecordedCombo = {
  playerIds: string[];
  lineType: ComboLineType;
  gamesTogether: number;
  points: number;
  pointsPerGame: number;
};
export type LineComboStats = {
  forward: RecordedCombo[];
  defense: RecordedCombo[];
  players: { playerId: string; gamesPlayed: number; points: number; pointsPerGame: number }[];
  model: "sum-player-ppg-v1";
  learning?: LineComboCalibration;
  opponent?: LineComboOpponent;
};
export type ComboProjection = {
  kind: "recorded" | "predicted";
  pointsPerGame: number;
  sampleGames: number;
  tuningGames?: number;
  learningAvailable?: boolean;
  recordedPointsPerGame?: number;
  recordedGames?: number;
  opponent?: LineComboOpponent;
};

/** One player-game contributes once, even if a saved lineup has duplicate slots/lines. */
export function buildLineComboStats(rows: ComboHistoryRow[]): LineComboStats {
  const lines = new Map<string, { gameId: string; lineType: ComboLineType; players: Map<string, number> }>();
  const playerGames = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (!row.playerId || !Number.isFinite(Number(row.points)) || Number(row.points) < 0) continue;
    const points = Number(row.points);
    const line = lines.get(row.lineId) ?? { gameId: row.gameId, lineType: row.lineType, players: new Map() };
    line.players.set(row.playerId, points);
    lines.set(row.lineId, line);
    const games = playerGames.get(row.playerId) ?? new Map<string, number>();
    games.set(row.gameId, points);
    playerGames.set(row.playerId, games);
  }
  const combos = new Map<string, { playerIds: string[]; lineType: ComboLineType; games: Map<string, number> }>();
  for (const line of Array.from(lines.values())) {
    const playerIds = Array.from(line.players.keys()).sort();
    if (playerIds.length < 2) continue;
    const key = JSON.stringify([line.lineType, playerIds]);
    const combo = combos.get(key) ?? { playerIds, lineType: line.lineType, games: new Map() };
    combo.games.set(line.gameId, Array.from(line.players.values()).reduce((sum, points) => sum + points, 0));
    combos.set(key, combo);
  }
  const stats: LineComboStats = { forward: [], defense: [], players: [], model: "sum-player-ppg-v1" };
  for (const combo of Array.from(combos.values())) {
    const points = Array.from(combo.games.values()).reduce((sum, value) => sum + value, 0);
    stats[combo.lineType].push({
      playerIds: combo.playerIds, lineType: combo.lineType, gamesTogether: combo.games.size,
      points, pointsPerGame: points / combo.games.size,
    });
  }
  for (const [playerId, games] of Array.from(playerGames)) {
    const points = Array.from(games.values()).reduce((sum, value) => sum + value, 0);
    stats.players.push({ playerId, gamesPlayed: games.size, points, pointsPerGame: points / games.size });
  }
  return stats;
}

/** Additive estimate, not a claim of learned chemistry or tracked on-ice production. */
export function projectLineCombo(
  stats: LineComboStats | undefined,
  lineType: ComboLineType,
  selectedPlayerIds: string[],
): ComboProjection | undefined {
  if (!stats || selectedPlayerIds.length < 2 || new Set(selectedPlayerIds).size !== selectedPlayerIds.length) return;
  const ids = [...selectedPlayerIds].sort();
  const recorded = stats[lineType].find(combo =>
    combo.playerIds.length === ids.length && combo.playerIds.every((id, index) => id === ids[index]));
  if (recorded && !stats.learning && !stats.opponent) return { kind: "recorded", pointsPerGame: recorded.pointsPerGame, sampleGames: recorded.gamesTogether };
  const players = ids.map(id => stats.players.find(player => player.playerId === id));
  if (players.some(player => !player || player.gamesPlayed < 1)) return;
  const base = opponentAdjustedBaseline(players.reduce((sum, player) => sum + player!.pointsPerGame, 0), stats.opponent);
  if (stats.learning) {
    return {
      kind: "predicted",
      ...applyLineComboCalibration(base, lineType, ids, stats.learning),
      sampleGames: Math.min(...players.map(player => player!.gamesPlayed)),
      learningAvailable: stats.learning.available,
      ...(stats.opponent ? { opponent: stats.opponent } : {}),
      ...(recorded ? { recordedPointsPerGame: recorded.pointsPerGame, recordedGames: recorded.gamesTogether } : {}),
    };
  }
  return {
    kind: "predicted",
    pointsPerGame: base,
    sampleGames: Math.min(...players.map(player => player!.gamesPlayed)),
    ...(stats.opponent ? { opponent: stats.opponent } : {}),
    ...(recorded && stats.opponent ? { recordedPointsPerGame: recorded.pointsPerGame, recordedGames: recorded.gamesTogether } : {}),
  };
}

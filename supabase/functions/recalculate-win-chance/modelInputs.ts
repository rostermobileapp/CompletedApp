import type { GameLine, TeamInput } from "./winProbability.ts";

export type TeamRow = { id: string; name: string; league_id: string | null; season_id: string | null };
export type GameRow = {
  id: string; home_team_id: string; away_team_id: string | null;
  home_score: number | null; away_score: number | null;
  scheduled_at: string; is_completed: boolean; is_scrimmage: boolean | null;
  season_id: string | null; league_id: string | null;
  result_type: "regulation" | "overtime" | "shootout" | null;
};
export type RosterPlayer = { id: string; name: string; isGoalie: boolean; isSkater: boolean };
export type GoalRow = {
  game_id: string; team_id: string; scorer_id: string | null;
  primary_assist_id: string | null; secondary_assist_id: string | null;
};
export type PlayerStats = { user_id: string; games_played: number; goals: number; assists: number };
export type TeamData = {
  team: TeamRow; completedGames: GameRow[]; roster: RosterPlayer[];
  attendance: { game_id: string; user_id: string | null; placeholder_player_id: string | null }[];
  goals: GoalRow[];
  goalieRows: { game_id: string; goalie_user_id: string }[];
  statsByUser: Map<string, PlayerStats>;
};
export type RecordSnapshot = { wins: number; losses: number; ties: number; shootoutLosses: number };

export function aggregateResults(teamId: string, games: GameRow[]) {
  const result = { gamesPlayed: 0, wins: 0, losses: 0, ties: 0, shootoutLosses: 0, goalsFor: 0, goalsAgainst: 0, streak: 0 };
  let streakEnded = false;
  for (const game of [...games].sort((a, b) => Date.parse(b.scheduled_at) - Date.parse(a.scheduled_at))) {
    if (game.is_scrimmage || game.home_score == null || game.away_score == null) continue;
    if (game.home_team_id !== teamId && game.away_team_id !== teamId) continue;
    const home = game.home_team_id === teamId;
    const gf = home ? game.home_score : game.away_score;
    const ga = home ? game.away_score : game.home_score;
    result.gamesPlayed++;
    result.goalsFor += gf;
    result.goalsAgainst += ga;
    const outcome = Math.sign(gf - ga);
    if (outcome > 0) result.wins++;
    else if (outcome === 0) result.ties++;
    else if (game.result_type === "overtime" || game.result_type === "shootout") result.shootoutLosses++;
    else result.losses++;
    if (!streakEnded) {
      if (!outcome || (result.streak && Math.sign(result.streak) !== outcome)) streakEnded = true;
      else result.streak += outcome;
    }
  }
  return result;
}

export function recordSnapshot(data: TeamData): RecordSnapshot {
  const { wins, losses, ties, shootoutLosses } = aggregateResults(data.team.id, data.completedGames);
  return { wins, losses, ties, shootoutLosses };
}

function playerIdentity(data: TeamData, id: string | null) {
  if (!id) return null;
  return data.roster.some(player => player.id === `placeholder:${id}`) ? `placeholder:${id}` : id;
}

export function buildPlayerHistory(data: TeamData, playerId: string): Map<string, GameLine> {
  const byGame = new Map<string, GameLine>();
  for (const row of data.attendance) {
    const id = row.user_id || (row.placeholder_player_id ? `placeholder:${row.placeholder_player_id}` : null);
    if (id === playerId) byGame.set(row.game_id, { goals: 0, assists: 0 });
  }
  for (const goal of data.goals) {
    const scored = playerIdentity(data, goal.scorer_id) === playerId;
    const assisted = playerIdentity(data, goal.primary_assist_id) === playerId ||
      playerIdentity(data, goal.secondary_assist_id) === playerId;
    if (!scored && !assisted) continue;
    const line = byGame.get(goal.game_id) ?? { goals: 0, assists: 0 };
    line.goals += Number(scored);
    line.assists += Number(assisted);
    byGame.set(goal.game_id, line);
  }
  return byGame;
}

/** Match the app's goalie fallback: final scores are authoritative, not a
 * default-zero game_goalies.goals_against. Do not guess between multiple goalies. */
function goalieHistory(data: TeamData) {
  const history = new Map<string, number[]>();
  const goalies = data.roster.filter(player => player.isGoalie);
  for (const game of data.completedGames) {
    const recorded = data.goalieRows.find(row => row.game_id === game.id);
    const attendees = new Set(data.attendance.filter(row => row.game_id === game.id)
      .map(row => row.user_id || `placeholder:${row.placeholder_player_id}`));
    const attendingGoalies = goalies.filter(player => attendees.has(player.id));
    const goalieId = recorded?.goalie_user_id ||
      (attendingGoalies.length === 1 ? attendingGoalies[0].id : goalies.length === 1 ? goalies[0].id : null);
    if (!goalieId) continue;
    const ga = game.home_team_id === data.team.id ? game.away_score : game.home_score;
    if (ga == null) continue;
    const rows = history.get(goalieId) ?? [];
    rows.push(ga);
    history.set(goalieId, rows);
  }
  return history;
}

export function buildTeamInput(data: TeamData, rsvps: { user_id: string; status: string }[]): TeamInput {
  const totals = aggregateResults(data.team.id, data.completedGames);
  const rsvpByUser = new Map(rsvps.map(row => [row.user_id, row.status]));
  const rsvp = (id: string) => rsvpByUser.get(id) === "attending" ? "in" as const :
    rsvpByUser.get(id) === "not_attending" ? "out" as const : "none" as const;
  const gamesById = new Map(data.completedGames.map(game => [game.id, game]));
  const goalieGames = goalieHistory(data);
  return {
    name: data.team.name,
    gamesPlayed: totals.gamesPlayed,
    wins: totals.wins,
    losses: totals.losses,
    // The supplied model explicitly supports half-credit OTL in its ties input.
    // Keep actual ties and OTL separate in the saved/displayed record.
    ties: totals.ties + totals.shootoutLosses,
    goalsFor: totals.goalsFor,
    goalsAgainst: totals.goalsAgainst,
    streak: totals.streak,
    skaters: data.roster.filter(player => player.isSkater).map(player => {
      const history = buildPlayerHistory(data, player.id);
      const lines = [...history.entries()].sort((a, b) =>
        Date.parse(gamesById.get(b[0])!.scheduled_at) - Date.parse(gamesById.get(a[0])!.scheduled_at));
      const stats = data.statsByUser.get(player.id);
      return {
        id: player.id, name: player.name,
        gamesPlayed: Math.max(history.size, Number(stats?.games_played) || 0),
        goals: Math.max(lines.reduce((sum, [, line]) => sum + line.goals, 0), Number(stats?.goals) || 0),
        assists: Math.max(lines.reduce((sum, [, line]) => sum + line.assists, 0), Number(stats?.assists) || 0),
        recentGames: lines.slice(0, 4).map(([, line]) => line),
        rsvp: rsvp(player.id),
      };
    }),
    goalies: data.roster.filter(player => player.isGoalie).map(player => {
      const history = goalieGames.get(player.id) ?? [];
      return {
        id: player.id, name: player.name, gamesPlayed: history.length,
        goalsAgainst: history.reduce((sum, ga) => sum + ga, 0),
        recentGoalsAgainst: history.slice(0, 5), rsvp: rsvp(player.id),
      };
    }),
  };
}

export function headToHead(home: TeamData, away: TeamData) {
  return home.completedGames
    .filter(game => game.away_team_id === away.team.id || game.home_team_id === away.team.id)
    .map(game => game.home_team_id === home.team.id
      ? { goalsForA: game.home_score!, goalsForB: game.away_score! }
      : { goalsForA: game.away_score!, goalsForB: game.home_score! });
}

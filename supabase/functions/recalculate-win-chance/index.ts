import { withSupabase } from "npm:@supabase/server@1";
import { predictGame, type GameLine, type GoalieInput, type Rsvp, type SkaterInput, type TeamInput } from "./winProbability.ts";

type Db = any;
type TeamRow = {
  id: string;
  name: string;
  league_id: string | null;
  season_id: string | null;
  wins: number | null;
  losses: number | null;
  ties: number | null;
  goals_for: number | null;
  goals_against: number | null;
};
type GameRow = {
  id: string;
  home_team_id: string;
  away_team_id: string | null;
  home_score: number | null;
  away_score: number | null;
  scheduled_at: string;
  is_completed: boolean;
  is_scrimmage: boolean;
  season_id: string | null;
};
type GoalRow = {
  game_id: string;
  team_id: string;
  scorer_id: string | null;
  primary_assist_id: string | null;
  secondary_assist_id: string | null;
};
type RosterPlayer = {
  id: string;
  name: string;
  isGoalie: boolean;
  isSkater: boolean;
  placeholder: boolean;
};
type TeamData = {
  team: TeamRow;
  completedGames: GameRow[];
  roster: RosterPlayer[];
  attendance: any[];
  goals: GoalRow[];
  goalieRows: any[];
  statsByUser: Map<string, any>;
};

function unwrap<T>(result: { data: T | null; error: { message: string } | null }, label: string): T {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return (result.data ?? []) as T;
}

function fullName(first?: string | null, last?: string | null, fallback = "Player"): string {
  return [first, last].filter(Boolean).join(" ").trim() || fallback;
}

function guessGoalie(position?: string | null): boolean {
  const normalized = (position ?? "").trim().toLowerCase();
  return normalized === "g" || normalized.includes("goalie") || normalized.includes("goaltender");
}

async function loadTeamData(admin: Db, team: TeamRow): Promise<TeamData> {
  let teamMembershipQuery = admin
    .from("team_memberships")
    .select("user_id, position")
    .eq("team_id", team.id)
    .eq("status", "approved");
  let leagueMembershipQuery = admin
    .from("league_memberships")
    .select("user_id, display_first_name, display_last_name, is_goalie, is_skater")
    .eq("assigned_team_id", team.id)
    .eq("status", "approved");
  if (team.league_id) leagueMembershipQuery = leagueMembershipQuery.eq("league_id", team.league_id);

  const [teamMemberships, leagueMemberships, placeholders, completedGames] = await Promise.all([
    teamMembershipQuery,
    leagueMembershipQuery,
    admin.from("placeholder_players")
      .select("id, first_name, last_name, is_goalie, is_skater")
      .eq("team_id", team.id),
    (async () => {
      let query = admin.from("games")
        .select("id, home_team_id, away_team_id, home_score, away_score, scheduled_at, is_completed, is_scrimmage, season_id")
        .eq("is_completed", true)
        .eq("is_scrimmage", false)
        .not("home_score", "is", null)
        .not("away_score", "is", null)
        .or(`home_team_id.eq.${team.id},away_team_id.eq.${team.id}`)
        .order("scheduled_at", { ascending: false })
        .limit(500);
      if (team.season_id) query = query.eq("season_id", team.season_id);
      return query;
    })(),
  ]);

  const teamMemberRows = unwrap<any[]>(teamMemberships, "team memberships");
  const leagueMemberRows = unwrap<any[]>(leagueMemberships, "league memberships");
  const placeholderRows = unwrap<any[]>(placeholders, "placeholder roster");
  const historyGames = unwrap<GameRow[]>(completedGames, "completed games");
  const userIds = [...new Set([
    ...teamMemberRows.map((row) => row.user_id),
    ...leagueMemberRows.map((row) => row.user_id),
  ].filter(Boolean))];

  const [userResult, statsResult, attendanceResult, goalsResult, goalieResult] = await Promise.all([
    userIds.length
      ? admin.from("users").select("id, first_name, last_name").in("id", userIds)
      : Promise.resolve({ data: [], error: null }),
    userIds.length && team.league_id
      ? (() => {
          let query = admin.from("player_stats")
            .select("user_id, games_played, goals, assists")
            .eq("league_id", team.league_id)
            .in("user_id", userIds);
          query = team.season_id ? query.eq("season_id", team.season_id) : query.is("season_id", null);
          return query;
        })()
      : Promise.resolve({ data: [], error: null }),
    historyGames.length
      ? admin.from("game_attendance")
          .select("game_id, user_id, placeholder_player_id")
          .eq("team_id", team.id)
          .in("game_id", historyGames.map((game) => game.id))
      : Promise.resolve({ data: [], error: null }),
    historyGames.length
      ? admin.from("game_goals")
          .select("game_id, team_id, scorer_id, primary_assist_id, secondary_assist_id")
          .eq("team_id", team.id)
          .eq("is_submitted", true)
          .in("game_id", historyGames.map((game) => game.id))
      : Promise.resolve({ data: [], error: null }),
    historyGames.length
      ? admin.from("game_goalies")
          .select("game_id, goalie_user_id, goals_against")
          .eq("team_id", team.id)
          .in("game_id", historyGames.map((game) => game.id))
      : Promise.resolve({ data: [], error: null }),
  ]);

  const users = unwrap<any[]>(userResult, "users");
  const statRows = unwrap<any[]>(statsResult, "player stats");
  const attendance = unwrap<any[]>(attendanceResult, "game attendance");
  const goals = unwrap<GoalRow[]>(goalsResult, "submitted goals");
  const goalieRows = unwrap<any[]>(goalieResult, "goalie stats");
  const usersById = new Map(users.map((user) => [user.id, user]));
  const statsByUser = new Map(statRows.map((row) => [row.user_id, row]));
  const leagueMembershipById = new Map(leagueMemberRows.map((row) => [row.user_id, row]));
  const teamPositionById = new Map(teamMemberRows.map((row) => [row.user_id, row.position]));
  const rosterById = new Map<string, RosterPlayer>();

  for (const userId of userIds) {
    const user = usersById.get(userId);
    if (!user) continue;
    const leagueMember = leagueMembershipById.get(userId);
    const goalie = leagueMember ? !!leagueMember.is_goalie : guessGoalie(teamPositionById.get(userId));
    const skater = leagueMember ? !!leagueMember.is_skater : !guessGoalie(teamPositionById.get(userId));
    rosterById.set(userId, {
      id: userId,
      name: fullName(leagueMember?.display_first_name || user.first_name, leagueMember?.display_last_name || user.last_name),
      isGoalie: goalie,
      isSkater: skater,
      placeholder: false,
    });
  }
  for (const player of placeholderRows) {
    const id = `placeholder:${player.id}`;
    rosterById.set(id, {
      id,
      name: fullName(player.first_name, player.last_name),
      isGoalie: !!player.is_goalie,
      isSkater: !!player.is_skater,
      placeholder: true,
    });
  }

  return { team, completedGames: historyGames, roster: [...rosterById.values()], attendance, goals, goalieRows, statsByUser };
}

function buildPlayerHistory(teamData: TeamData, playerId: string): Map<string, GameLine> {
  const byGame = new Map<string, GameLine>();
  for (const row of teamData.attendance) {
    const rowId = row.user_id || (row.placeholder_player_id ? `placeholder:${row.placeholder_player_id}` : null);
    if (rowId === playerId) byGame.set(row.game_id, { goals: 0, assists: 0 });
  }
  for (const goal of teamData.goals) {
    if (goal.scorer_id === playerId) {
      const line = byGame.get(goal.game_id) ?? { goals: 0, assists: 0 };
      line.goals += 1;
      byGame.set(goal.game_id, line);
    }
    if (goal.primary_assist_id === playerId || goal.secondary_assist_id === playerId) {
      const line = byGame.get(goal.game_id) ?? { goals: 0, assists: 0 };
      line.assists += 1;
      byGame.set(goal.game_id, line);
    }
  }
  return byGame;
}

function signedStreak(teamData: TeamData): number {
  let streak = 0;
  for (const game of teamData.completedGames) {
    const teamIsHome = game.home_team_id === teamData.team.id;
    const goalsFor = teamIsHome ? game.home_score : game.away_score;
    const goalsAgainst = teamIsHome ? game.away_score : game.home_score;
    if (goalsFor == null || goalsAgainst == null || goalsFor === goalsAgainst) break;
    const result = goalsFor > goalsAgainst ? 1 : -1;
    if (streak === 0) streak = result;
    else if (Math.sign(streak) === result) streak += result;
    else break;
  }
  return streak;
}

async function buildTeamInput(admin: Db, data: TeamData, gameId: string): Promise<TeamInput> {
  const { team } = data;
  const userIds = data.roster.filter((player) => !player.placeholder).map((player) => player.id);
  const rsvpResult = userIds.length
    ? await admin.from("game_rsvps")
        .select("user_id, status")
        .eq("game_id", gameId)
        .eq("team_id", team.id)
        .in("user_id", userIds)
    : { data: [], error: null };
  const rsvpRows = unwrap<any[]>(rsvpResult, "game RSVPs");
  const rsvpByUser = new Map(rsvpRows.map((row) => [row.user_id, row.status]));
  const gameById = new Map(data.completedGames.map((game) => [game.id, game]));
  const goalieHistory = new Map<string, Array<{ date: number; goalsAgainst: number }>>();
  for (const row of data.goalieRows) {
    const game = gameById.get(row.game_id);
    const list = goalieHistory.get(row.goalie_user_id) ?? [];
    list.push({ date: game ? new Date(game.scheduled_at).getTime() : 0, goalsAgainst: Number(row.goals_against) || 0 });
    goalieHistory.set(row.goalie_user_id, list);
  }
  for (const list of goalieHistory.values()) list.sort((a, b) => b.date - a.date);

  const mapRsvp = (playerId: string): Rsvp => {
    const status = rsvpByUser.get(playerId);
    if (status === "attending") return "in";
    if (status === "not_attending") return "out";
    return "none";
  };

  const skaters: SkaterInput[] = [];
  const goalies: GoalieInput[] = [];
  for (const player of data.roster) {
    if (player.isSkater) {
      const history = buildPlayerHistory(data, player.id);
      const ordered = [...history.entries()]
        .map(([id, line]) => ({ id, line, date: new Date(gameById.get(id)?.scheduled_at ?? 0).getTime() }))
        .sort((a, b) => b.date - a.date);
      const stats = data.statsByUser.get(player.id);
      skaters.push({
        id: player.id,
        name: player.name,
        gamesPlayed: player.placeholder
          ? history.size
          : Math.max(history.size, Number(stats?.games_played) || 0),
        goals: player.placeholder ? 0 : Number(stats?.goals) || 0,
        assists: player.placeholder ? 0 : Number(stats?.assists) || 0,
        recentGames: ordered.slice(0, 4).map((entry) => entry.line),
        rsvp: player.placeholder ? "none" : mapRsvp(player.id),
      });
    }
    if (player.isGoalie && !player.placeholder) {
      const history = goalieHistory.get(player.id) ?? [];
      goalies.push({
        id: player.id,
        name: player.name,
        gamesPlayed: history.length,
        goalsAgainst: history.reduce((sum, row) => sum + row.goalsAgainst, 0),
        recentGoalsAgainst: history.slice(0, 5).map((row) => row.goalsAgainst),
        rsvp: mapRsvp(player.id),
      });
    }
  }

  const completed = data.completedGames.length;
  const wins = Number(team.wins) || 0;
  const losses = Number(team.losses) || 0;
  const ties = Number(team.ties) || 0;
  return {
    name: team.name,
    gamesPlayed: Math.max(completed, wins + losses + ties),
    wins,
    losses,
    ties,
    goalsFor: Number(team.goals_for) || 0,
    goalsAgainst: Number(team.goals_against) || 0,
    streak: signedStreak(data),
    skaters,
    goalies,
  };
}

async function getLeagueAverageGoals(admin: Db, team: TeamRow): Promise<number | undefined> {
  if (!team.league_id) return undefined;
  let query = admin.from("games")
    .select("home_score, away_score")
    .eq("league_id", team.league_id)
    .eq("is_completed", true)
    .eq("is_scrimmage", false)
    .not("home_score", "is", null)
    .not("away_score", "is", null)
    .limit(1000);
  if (team.season_id) query = query.eq("season_id", team.season_id);
  const rows = unwrap<any[]>(await query, "league game averages");
  if (!rows.length) return undefined;
  const mean = rows.reduce((sum, game) => sum + (Number(game.home_score) + Number(game.away_score)) / 2, 0) / rows.length;
  return Number.isFinite(mean) && mean > 0 ? mean : undefined;
}

function headToHead(home: TeamData, away: TeamData) {
  return home.completedGames
    .filter((game) => game.away_team_id === away.team.id || game.home_team_id === away.team.id)
    .map((game) => game.home_team_id === home.team.id
      ? { goalsForA: Number(game.home_score) || 0, goalsForB: Number(game.away_score) || 0 }
      : { goalsForA: Number(game.away_score) || 0, goalsForB: Number(game.home_score) || 0 });
}

function predictionRow(game: GameRow, home: TeamData, away: TeamData, prediction: ReturnType<typeof predictGame>) {
  return {
    game_id: game.id,
    home_team_id: home.team.id,
    away_team_id: away.team.id,
    home_win_probability: prediction.winProbA,
    away_win_probability: prediction.winProbB,
    tie_probability: prediction.tieProb,
    expected_goals_home: prediction.expectedGoalsA,
    expected_goals_away: prediction.expectedGoalsB,
    moneyline_home: prediction.moneylineA,
    moneyline_away: prediction.moneylineB,
    projected_score_home: prediction.projectedScore.a,
    projected_score_away: prediction.projectedScore.b,
    win_by_two_home: prediction.winBy2A,
    win_by_two_away: prediction.winBy2B,
    over_under_line: prediction.overUnder.line,
    over_probability: prediction.overUnder.overProb,
    under_probability: 1 - prediction.overUnder.overProb,
    top_scorers_home: prediction.topScorersA,
    top_scorers_away: prediction.topScorersB,
    home_record_snapshot: {
      wins: Number(home.team.wins) || 0,
      losses: Number(home.team.losses) || 0,
      ties: Number(home.team.ties) || 0,
    },
    away_record_snapshot: {
      wins: Number(away.team.wins) || 0,
      losses: Number(away.team.losses) || 0,
      ties: Number(away.team.ties) || 0,
    },
    home_streak: signedStreak(home),
    away_streak: signedStreak(away),
    goalie_home: prediction.breakdown.goalieA,
    goalie_away: prediction.breakdown.goalieB,
    calculated_at: new Date().toISOString(),
  };
}

async function recalculateTeam(admin: Db, teamId: string) {
  const teamResult = await admin.from("teams")
    .select("id, name, league_id, season_id, wins, losses, ties, goals_for, goals_against")
    .eq("id", teamId)
    .maybeSingle();
  if (teamResult.error) throw new Error(`team: ${teamResult.error.message}`);
  const team = teamResult.data as TeamRow | null;
  if (!team || !team.league_id) return { updated: 0 };

  const upcomingResult = await admin.from("games")
    .select("id, home_team_id, away_team_id, home_score, away_score, scheduled_at, is_completed, is_scrimmage, season_id")
    .eq("is_completed", false)
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .order("scheduled_at", { ascending: true })
    .limit(300);
  const upcoming = unwrap<GameRow[]>(upcomingResult, "upcoming games");
  const now = Date.now();
  const eligible = upcoming.filter((game) => {
    const scheduled = new Date(game.scheduled_at).getTime();
    return game.away_team_id
      && game.home_score == null
      && game.away_score == null
      && Number.isFinite(scheduled)
      && scheduled + 2 * 60 * 60 * 1000 >= now;
  });
  if (!eligible.length) return { updated: 0 };

  const teamIds = [...new Set(eligible.flatMap((game) => [game.home_team_id, game.away_team_id!]))];
  const teamRows = unwrap<TeamRow[]>(
    await admin.from("teams")
      .select("id, name, league_id, season_id, wins, losses, ties, goals_for, goals_against")
      .in("id", teamIds),
    "opposing teams",
  );
  const teamsById = new Map(teamRows.map((row) => [row.id, row]));
  const neededTeams = teamRows.filter((row) => row.league_id === team.league_id);
  const teamDataEntries = await Promise.all(neededTeams.map(async (row) => [row.id, await loadTeamData(admin, row)] as const));
  const teamData = new Map(teamDataEntries);
  const leagueAverage = await getLeagueAverageGoals(admin, team);
  let updated = 0;

  for (const game of eligible) {
    const homeTeam = teamsById.get(game.home_team_id);
    const awayTeam = game.away_team_id ? teamsById.get(game.away_team_id) : undefined;
    if (!homeTeam || !awayTeam || homeTeam.league_id !== awayTeam.league_id || homeTeam.league_id !== team.league_id) continue;
    const homeData = teamData.get(homeTeam.id);
    const awayData = teamData.get(awayTeam.id);
    if (!homeData || !awayData) continue;

    const [homeInput, awayInput, leagueResult] = await Promise.all([
      buildTeamInput(admin, homeData, game.id),
      buildTeamInput(admin, awayData, game.id),
      admin.from("leagues").select("allow_ties").eq("id", homeTeam.league_id).maybeSingle(),
    ]);
    if (leagueResult.error) throw new Error(`league prediction settings: ${leagueResult.error.message}`);
    const league = leagueResult.data;
    const prediction = predictGame(homeInput, awayInput, headToHead(homeData, awayData), {
      leagueAvgGoals: leagueAverage,
      allowTies: !!league?.allow_ties,
    });
    const result = await admin.from("game_predictions")
      .upsert(predictionRow(game, homeData, awayData, prediction), { onConflict: "game_id" });
    if (result.error) throw new Error(`prediction save: ${result.error.message}`);
    updated += 1;
  }

  return { updated };
}

export default {
  fetch: withSupabase({ auth: "secret" }, async (request, ctx) => {
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    let teamId: unknown;
    try {
      const body = await request.json();
      teamId = body?.team_id;
    } catch {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }
    if (typeof teamId !== "string" || teamId.length < 1 || teamId.length > 100) {
      return Response.json({ error: "A valid team_id is required" }, { status: 400 });
    }

    try {
      const result = await recalculateTeam(ctx.supabaseAdmin, teamId);
      return Response.json({ ok: true, ...result });
    } catch (error) {
      console.error("Win-chance recalculation failed", error);
      return Response.json({ error: "Prediction update failed" }, { status: 500 });
    }
  }),
};

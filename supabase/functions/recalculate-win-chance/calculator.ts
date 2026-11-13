import { predictGame } from "./winProbability.ts";
import { aggregateResults, buildTeamInput, headToHead, recordSnapshot, type GameRow, type TeamData, type TeamRow } from "./modelInputs.ts";
import { isFutureGame, localTimestamp } from "./gameTime.ts";

type Db = any; // Supabase's hosted client; fixture clients implement the same query boundary.
const GAME_COLUMNS = "id, home_team_id, away_team_id, home_score, away_score, scheduled_at, is_completed, is_scrimmage, season_id, league_id, result_type";
const TEAM_COLUMNS = "id, name, league_id, season_id";

function unwrap<T>(result: { data: T | null; error: { message: string } | null }, label: string): T {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return (result.data ?? []) as T;
}

/** Fetch every page; Supabase's default row cap must not truncate a season. */
async function allRows<T>(query: () => any, label: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const page = unwrap<T[]>(await query().range(offset, offset + 499), label);
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}

const fullName = (first: string | null, last: string | null) => [first, last].filter(Boolean).join(" ").trim() || "Player";
const isGoalie = (position: string | null) => /^(g|goalie|goaltender)$/i.test((position ?? "").trim());

export async function loadScope(admin: Db, leagueId: string, seasonId: string | null, before: string) {
  const scope = (query: any) => seasonId ? query.eq("season_id", seasonId) : query.is("season_id", null);
  const teams = await allRows<TeamRow>(() => scope(admin.from("teams").select(TEAM_COLUMNS).eq("league_id", leagueId)).order("id"), "league teams");
  const ids = teams.map(team => team.id);
  const history: GameRow[] = [];
  for (let start = 0; start < ids.length; start += 50) {
    history.push(...await allRows<GameRow>(() => scope(admin.from("games").select(GAME_COLUMNS))
      .in("home_team_id", ids.slice(start, start + 50))
      .not("home_score", "is", null).not("away_score", "is", null)
      .or("is_scrimmage.eq.false,is_scrimmage.is.null").lt("scheduled_at", before)
      .order("scheduled_at", { ascending: false }).order("id"), "scored season games"));
  }
  const teamIds = new Set(teams.map(team => team.id));
  // Standings accepts scored history even when an older is_completed flag was
  // never set. Both opponents must be teams in this league/season.
  const games = history.filter(game => game.away_team_id &&
    teamIds.has(game.home_team_id) && teamIds.has(game.away_team_id))
    .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at) || a.id.localeCompare(b.id));
  const leagueAverage = games.length
    ? games.reduce((sum, game) => sum + game.home_score! + game.away_score!, 0) / (2 * games.length)
    : undefined;
  return { teams, games, leagueAverage: leagueAverage && leagueAverage > 0 ? leagueAverage : undefined };
}

export async function loadTeamData(admin: Db, team: TeamRow, history: GameRow[], seasonId: string | null): Promise<TeamData> {
  const [teamMembers, leagueMembers, placeholders] = await Promise.all([
    allRows<any>(() => admin.from("team_memberships").select("user_id, position")
      .eq("team_id", team.id).eq("status", "approved").order("user_id"), "team memberships"),
    allRows<any>(() => admin.from("league_memberships")
      .select("user_id, assigned_team_id, display_first_name, display_last_name, is_goalie, is_skater")
      .eq("league_id", team.league_id).eq("status", "approved").order("user_id"), "league memberships"),
    allRows<any>(() => admin.from("placeholder_players")
      .select("id, first_name, last_name, is_goalie, is_skater")
      .eq("team_id", team.id).order("id"), "placeholder roster"),
  ]);
  const leagueById = new Map<string, any>(leagueMembers.map(row => [row.user_id, row]));
  // Follow the application's authoritative league assignment, not stale direct
  // membership rows left behind after a player changes team.
  const direct = teamMembers.filter(row => {
    const member = leagueById.get(row.user_id);
    return !member?.assigned_team_id || member.assigned_team_id === team.id;
  });
  const assigned = leagueMembers.filter(row => row.assigned_team_id === team.id);
  const userIds = [...new Set<string>([...direct, ...assigned].map(row => row.user_id))];
  const completedGames = history.filter(game => game.home_team_id === team.id || game.away_team_id === team.id);
  const gameIds = completedGames.map(game => game.id);
  const loadGameRows = async (table: string, columns: string, extra?: (query: any) => any) => {
    const rows: any[] = [];
    for (let start = 0; start < gameIds.length; start += 100) {
      const batch = gameIds.slice(start, start + 100);
      rows.push(...await allRows<any>(() => {
        let query = admin.from(table).select(columns).eq("team_id", team.id).in("game_id", batch);
        if (extra) query = extra(query);
        return query.order("id");
      }, table));
    }
    return rows;
  };
  const [users, stats, attendance, goals, goalieRows] = await Promise.all([
    userIds.length ? allRows<any>(() => admin.from("users").select("id, first_name, last_name").in("id", userIds).order("id"), "users") : [],
    userIds.length ? allRows<any>(() => {
      let query = admin.from("player_stats").select("user_id, games_played, goals, assists")
        .eq("league_id", team.league_id).in("user_id", userIds);
      query = seasonId ? query.eq("season_id", seasonId) : query.is("season_id", null);
      return query.order("id");
    }, "season player stats") : [],
    loadGameRows("game_attendance", "game_id, user_id, placeholder_player_id"),
    loadGameRows("game_goals", "game_id, team_id, scorer_id, primary_assist_id, secondary_assist_id", query => query.eq("is_submitted", true)),
    loadGameRows("game_goalies", "game_id, goalie_user_id"),
  ]);
  const positionById = new Map(direct.map(row => [row.user_id, row.position]));
  const roster = users.map(user => {
    const member = leagueById.get(user.id);
    const goalie = member ? !!member.is_goalie : isGoalie(positionById.get(user.id));
    return {
      id: user.id,
      name: fullName(member?.display_first_name || user.first_name, member?.display_last_name || user.last_name),
      isGoalie: goalie,
      isSkater: member ? !!member.is_skater : !goalie,
    };
  });
  for (const player of placeholders) roster.push({
    id: `placeholder:${player.id}`, name: fullName(player.first_name, player.last_name),
    isGoalie: !!player.is_goalie, isSkater: !!player.is_skater,
  });
  return { team, completedGames, roster, attendance, goals, goalieRows, statsByUser: new Map(stats.map(row => [row.user_id, row])) };
}

export async function inputsForGame(admin: Db, data: TeamData, gameId: string) {
  const ids = data.roster.filter(player => !player.id.startsWith("placeholder:")).map(player => player.id);
  const rsvps = ids.length ? await allRows<any>(() => admin.from("game_rsvps").select("user_id, status")
    .eq("game_id", gameId).eq("team_id", data.team.id).in("user_id", ids).order("id"), "game RSVPs") : [];
  return buildTeamInput(data, rsvps);
}

export function predictionRow(game: GameRow, home: TeamData, away: TeamData, result: ReturnType<typeof predictGame>, now: number) {
  return {
    game_id: game.id, home_team_id: home.team.id, away_team_id: away.team.id,
    home_win_probability: result.winProbA, away_win_probability: result.winProbB, tie_probability: result.tieProb,
    expected_goals_home: result.expectedGoalsA, expected_goals_away: result.expectedGoalsB,
    moneyline_home: result.moneylineA, moneyline_away: result.moneylineB,
    projected_score_home: result.projectedScore.a, projected_score_away: result.projectedScore.b,
    win_by_two_home: result.winBy2A, win_by_two_away: result.winBy2B,
    over_under_line: result.overUnder.line, over_probability: result.overUnder.overProb,
    under_probability: 1 - result.overUnder.overProb,
    top_scorers_home: result.topScorersA, top_scorers_away: result.topScorersB,
    home_record_snapshot: recordSnapshot(home), away_record_snapshot: recordSnapshot(away),
    home_streak: aggregateResults(home.team.id, home.completedGames).streak,
    away_streak: aggregateResults(away.team.id, away.completedGames).streak,
    goalie_home: result.breakdown.goalieA, goalie_away: result.breakdown.goalieB,
    calculated_at: new Date(now).toISOString(),
  };
}

async function recalculateGames(admin: Db, upcoming: GameRow[], now: number, scopedTeamIds: Set<string>) {
  const eligible = new Map<string, GameRow>();
  const leagues = new Map<string, { allow_ties: boolean; timezone: string | null }>();
  for (const game of upcoming) {
    if (!game.away_team_id || game.home_score != null || game.away_score != null ||
        game.is_completed || game.is_scrimmage || game.league_id == null ||
        !scopedTeamIds.has(game.home_team_id) && !scopedTeamIds.has(game.away_team_id)) continue;
    let league = leagues.get(game.league_id);
    if (!league) {
      const leagueResult = await admin.from("leagues").select("allow_ties, timezone").eq("id", game.league_id).maybeSingle();
      if (leagueResult.error || !leagueResult.data) throw new Error("League prediction settings unavailable");
      league = {
        allow_ties: !!leagueResult.data.allow_ties,
        timezone: leagueResult.data.timezone || "America/New_York",
      };
      leagues.set(game.league_id, league);
    }
    if (!isFutureGame(game.scheduled_at, now, league.timezone)) continue;
    eligible.set(game.id, game);
  }

  const scopes = new Map<string, Awaited<ReturnType<typeof loadScope>>>();
  const teamData = new Map<string, TeamData>();
  let updated = 0;
  for (const game of eligible.values()) {
    const scopeKey = `${game.league_id}:${game.season_id ?? "unassigned"}`;
    const league = leagues.get(game.league_id)!;
    if (!scopes.has(scopeKey)) {
      scopes.set(scopeKey, await loadScope(
        admin,
        game.league_id,
        game.season_id,
        localTimestamp(now, league.timezone),
      ));
    }
    const scope = scopes.get(scopeKey)!;
    const home = scope.teams.find(row => row.id === game.home_team_id);
    const away = scope.teams.find(row => row.id === game.away_team_id);
    if (!home || !away) continue;
    for (const participant of [home, away]) {
      const key = `${game.league_id}:${scopeKey}:${participant.id}`;
      if (!teamData.has(key)) teamData.set(key, await loadTeamData(admin, participant, scope.games, game.season_id));
    }
    const homeData = teamData.get(`${game.league_id}:${scopeKey}:${home.id}`)!;
    const awayData = teamData.get(`${game.league_id}:${scopeKey}:${away.id}`)!;
    const [homeInput, awayInput] = await Promise.all([inputsForGame(admin, homeData, game.id), inputsForGame(admin, awayData, game.id)]);
    const result = predictGame(homeInput, awayInput, headToHead(homeData, awayData), {
      leagueAvgGoals: scope.leagueAverage, allowTies: !!leagues.get(game.league_id)!.allow_ties,
    });
    // Revalidate immediately before the privileged write. A scorekeeper may
    // have started/finalized this game while the history was being assembled.
    const current = await admin.from("games").select(GAME_COLUMNS).eq("id", game.id).maybeSingle();
    if (current.error) throw new Error("Could not revalidate prediction game");
    const latest = current.data as GameRow | null;
    if (!latest || latest.is_completed || latest.is_scrimmage || latest.home_score != null || latest.away_score != null ||
      latest.home_team_id !== home.id || latest.away_team_id !== away.id || latest.season_id !== game.season_id ||
      latest.league_id !== game.league_id ||
      !isFutureGame(latest.scheduled_at, Math.max(now, Date.now()), leagues.get(game.league_id)!.timezone)) continue;
    const saved = await admin.rpc("win_chance_save_prediction", {
      p_prediction: predictionRow(game, homeData, awayData, result, now),
      p_league_id: game.league_id, p_season_id: game.season_id,
    });
    if (saved.error) throw new Error(`prediction save: ${saved.error.message}`);
    if (saved.data) updated++;
  }
  return { updated };
}

async function getUpcomingGamesForTeams(admin: Db, teamIds: string[]) {
  const unique = Array.from(new Set(teamIds.filter(Boolean)));
  const games = new Map<string, GameRow>();
  for (const teamId of unique) {
    const rows = await allRows<GameRow>(() => admin.from("games").select(GAME_COLUMNS)
      .eq("is_completed", false).eq("is_scrimmage", false)
      .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
      .order("scheduled_at").order("id"), "upcoming games");
    for (const game of rows) games.set(game.id, game);
  }
  return Array.from(games.values());
}

export async function recalculateGame(admin: Db, gameId: string, now = Date.now()) {
  const result = await admin.from("games").select(GAME_COLUMNS).eq("id", gameId).maybeSingle();
  if (result.error) throw new Error("Prediction game unavailable");
  const game = result.data as GameRow | null;
  if (!game || !game.home_team_id || !game.away_team_id) return { updated: 0 };
  return recalculateGames(admin, [game], now, new Set([game.home_team_id, game.away_team_id]));
}

export async function recalculateTeams(admin: Db, teamIds: string[], now = Date.now()) {
  const uniqueTeamIds = Array.from(new Set(teamIds.filter(Boolean)));
  if (uniqueTeamIds.length === 0) return { updated: 0 };
  const teamRows = await allRows<TeamRow>(() => admin.from("teams").select(TEAM_COLUMNS).in("id", uniqueTeamIds), "target teams");
  const scopedTeamIds = new Set(teamRows.filter(team => !!team.league_id).map(team => team.id));
  if (scopedTeamIds.size === 0) return { updated: 0 };
  const upcoming = await getUpcomingGamesForTeams(admin, Array.from(scopedTeamIds));
  return recalculateGames(admin, upcoming, now, scopedTeamIds);
}

export async function recalculateSourceGame(admin: Db, sourceGameId: string, now = Date.now()) {
  const result = await admin.from("games").select("home_team_id, away_team_id").eq("id", sourceGameId).maybeSingle();
  if (result.error) throw new Error("Source game unavailable");
  const game = result.data as { home_team_id: string | null; away_team_id: string | null } | null;
  if (!game) return { updated: 0 };
  return recalculateTeams(admin, [game.home_team_id ?? "", game.away_team_id ?? ""], now);
}

export async function recalculateSourceGames(admin: Db, sourceGameIds: string[], now = Date.now()) {
  const uniqueIds = Array.from(new Set(sourceGameIds.filter(Boolean)));
  const teams = new Set<string>();
  for (let start = 0; start < uniqueIds.length; start += 100) {
    const result = await admin.from("games").select("home_team_id, away_team_id")
      .in("id", uniqueIds.slice(start, start + 100));
    if (result.error) throw new Error("Source games unavailable");
    for (const game of result.data ?? []) {
      if (game.home_team_id) teams.add(game.home_team_id);
      if (game.away_team_id) teams.add(game.away_team_id);
    }
  }
  return recalculateTeams(admin, Array.from(teams), now);
}

export async function recalculateTeam(admin: Db, teamId: string, now = Date.now()) {
  return recalculateTeams(admin, [teamId], now);
}

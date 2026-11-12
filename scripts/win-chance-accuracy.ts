import "../server/runtimeBootstrap";
import { buildWinChanceAccuracyReport } from "../shared/winChanceAccuracy.js";
import type {
  CompletedGameForAccuracy,
  LeagueTieSetting,
  StoredWinPrediction,
} from "../shared/winChanceAccuracy.js";

const PAGE_SIZE = 500;
const ID_BATCH_SIZE = 100;

type PredictionDbRow = {
  game_id: string;
  home_team_id: string;
  away_team_id: string;
  home_win_probability: number | string;
  away_win_probability: number | string;
  tie_probability: number | string;
};

type GameDbRow = {
  id: string;
  league_id: string | null;
  home_team_id: string;
  away_team_id: string | null;
  home_score: number | null;
  away_score: number | null;
  is_completed: boolean;
  is_scrimmage: boolean;
};

type LeagueDbRow = {
  id: string;
  name: string;
  allow_ties: boolean;
};

function requireIsolatedDevelopmentConfig() {
  if (process.env.NODE_ENV !== "development" || process.env.NONPRODUCTION_ISOLATED !== "1") {
    throw new Error("This report only runs in isolated development.");
  }

  const activeUrl = process.env.SUPABASE_URL;
  const devUrl = process.env.DEV_SUPABASE_URL;
  const activeServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const devServiceKey = process.env.DEV_SUPABASE_SERVICE_ROLE_KEY;
  if (!activeUrl || !devUrl || !activeServiceKey || !devServiceKey) {
    throw new Error("Isolated development Supabase configuration is incomplete.");
  }
  if (new URL(activeUrl).origin !== new URL(devUrl).origin
    || activeServiceKey !== devServiceKey) {
    throw new Error("Refusing to run against a non-development Supabase project.");
  }

  return { url: activeUrl, serviceKey: activeServiceKey };
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function inFilter(ids: string[]): string {
  const values = ids.map((id) => `"${id.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`);
  return `in.(${values.join(",")})`;
}

async function selectRows<T>(
  config: { url: string; serviceKey: string },
  table: string,
  filters: Record<string, string>,
  select: string,
): Promise<T[]> {
  const url = new URL(`/rest/v1/${table}`, config.url);
  url.searchParams.set("select", select);
  for (const [key, value] of Object.entries(filters)) url.searchParams.set(key, value);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      apikey: config.serviceKey,
      Authorization: `Bearer ${config.serviceKey}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`Could not read ${table} (${response.status}): ${detail}`);
  }
  return await response.json() as T[];
}

async function loadPredictions(config: { url: string; serviceKey: string }) {
  const rows: PredictionDbRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await selectRows<PredictionDbRow>(
      config,
      "game_predictions",
      {
        order: "game_id.asc",
        offset: String(offset),
        limit: String(PAGE_SIZE),
      },
      "game_id, home_team_id, away_team_id, home_win_probability, away_win_probability, tie_probability",
    );
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function loadGames(config: { url: string; serviceKey: string }, ids: string[]) {
  const rows: GameDbRow[] = [];
  for (const idBatch of chunks(ids, ID_BATCH_SIZE)) {
    rows.push(...await selectRows<GameDbRow>(
      config,
      "games",
      { id: inFilter(idBatch) },
      "id, league_id, home_team_id, away_team_id, home_score, away_score, is_completed, is_scrimmage",
    ));
  }
  return rows;
}

async function loadLeagues(config: { url: string; serviceKey: string }, ids: string[]) {
  const rows: LeagueDbRow[] = [];
  for (const idBatch of chunks(ids, ID_BATCH_SIZE)) {
    rows.push(...await selectRows<LeagueDbRow>(
      config,
      "leagues",
      { id: inFilter(idBatch) },
      "id, name, allow_ties",
    ));
  }
  return rows;
}

async function main() {
  const config = requireIsolatedDevelopmentConfig();
  const predictionRows = await loadPredictions(config);
  const gameRows = await loadGames(config, [...new Set(predictionRows.map((row) => row.game_id))]);
  const leagueIds = [...new Set(
    gameRows.map((game) => game.league_id).filter((id): id is string => Boolean(id)),
  )];
  const leagueRows = await loadLeagues(config, leagueIds);

  const predictions: StoredWinPrediction[] = predictionRows.map((row) => ({
    gameId: row.game_id,
    homeTeamId: row.home_team_id,
    awayTeamId: row.away_team_id,
    homeWinProbability: row.home_win_probability,
    awayWinProbability: row.away_win_probability,
    tieProbability: row.tie_probability,
  }));
  const games: CompletedGameForAccuracy[] = gameRows.map((row) => ({
    id: row.id,
    leagueId: row.league_id,
    homeTeamId: row.home_team_id,
    awayTeamId: row.away_team_id,
    homeScore: row.home_score,
    awayScore: row.away_score,
    isCompleted: row.is_completed,
    isScrimmage: row.is_scrimmage,
  }));
  const leagues: LeagueTieSetting[] = leagueRows.map((row) => ({
    id: row.id,
    name: row.name,
    allowTies: row.allow_ties,
  }));

  const report = buildWinChanceAccuracyReport(predictions, games, leagues);
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    brierScoreMeaning: "Lower is better; zero is perfect.",
    ...report,
  }, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`[win-chance:accuracy] ${message}`);
  process.exitCode = 1;
});

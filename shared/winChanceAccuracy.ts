export type PredictionOutcome = "home" | "away" | "tie";

export interface StoredWinPrediction {
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeWinProbability: number | string;
  awayWinProbability: number | string;
  tieProbability: number | string;
}

export interface CompletedGameForAccuracy {
  id: string;
  leagueId: string | null;
  homeTeamId: string;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  isCompleted: boolean;
  isScrimmage: boolean;
}

export interface LeagueTieSetting {
  id: string;
  name: string;
  allowTies: boolean;
}

export interface CalibrationBin {
  outcome: PredictionOutcome;
  lowerBound: number;
  upperBound: number;
  forecasts: number;
  meanPredictedProbability: number;
  observedFrequency: number;
}

export interface AccuracyMetrics {
  sampleSize: number;
  smallSampleWarning: string | null;
  topChoiceAccuracy: number | null;
  meanBrierScore: number | null;
  outcomes: Record<PredictionOutcome, number>;
  calibration: CalibrationBin[];
}

export interface WinChanceAccuracyReport {
  minimumSampleSizeForInterpretation: number;
  overall: AccuracyMetrics;
  byLeague: Array<{
    leagueId: string;
    leagueName: string;
    allowTies: boolean;
    metrics: AccuracyMetrics;
  }>;
  excluded: {
    missingGame: number;
    incompleteGame: number;
    scrimmage: number;
    teamMismatch: number;
    missingLeagueSetting: number;
    missingScore: number;
    tieInLeagueWithoutTies: number;
    invalidProbability: number;
  };
}

const MINIMUM_SAMPLE_SIZE = 30;
const CALIBRATION_BUCKETS = 10;
const PROBABILITY_SUM_TOLERANCE = 0.0002;

type EvaluatedGame = {
  leagueId: string;
  leagueName: string;
  allowTies: boolean;
  outcome: PredictionOutcome;
  probabilities: [number, number, number];
};

function parseProbabilities(prediction: StoredWinPrediction): [number, number, number] | null {
  const values = [
    Number(prediction.homeWinProbability),
    Number(prediction.awayWinProbability),
    Number(prediction.tieProbability),
  ];
  if (values.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) return null;
  if (Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) > PROBABILITY_SUM_TOLERANCE) {
    return null;
  }
  return values as [number, number, number];
}

function summarize(games: EvaluatedGame[]): AccuracyMetrics {
  const outcomes: Record<PredictionOutcome, number> = { home: 0, away: 0, tie: 0 };
  const outcomeLabels: PredictionOutcome[] = ["home", "away", "tie"];
  const calibration = outcomeLabels.map(() =>
    Array.from({ length: CALIBRATION_BUCKETS }, (_, index) => ({
      lowerBound: index / CALIBRATION_BUCKETS,
      upperBound: (index + 1) / CALIBRATION_BUCKETS,
      forecasts: 0,
      predictedTotal: 0,
      observedTotal: 0,
    })),
  );
  let brierTotal = 0;
  let topChoiceCorrect = 0;

  for (const game of games) {
    const actualIndex = game.outcome === "home" ? 0 : game.outcome === "away" ? 1 : 2;
    const actual = [0, 0, 0];
    actual[actualIndex] = 1;
    outcomes[game.outcome] += 1;

    brierTotal += game.probabilities.reduce(
      (sum, probability, index) => sum + (probability - actual[index]) ** 2,
      0,
    );

    const topChoiceIndex = game.probabilities.indexOf(Math.max(...game.probabilities));
    if (topChoiceIndex === actualIndex) topChoiceCorrect += 1;

    game.probabilities.forEach((probability, index) => {
      const bucketIndex = Math.min(
        CALIBRATION_BUCKETS - 1,
        Math.floor(probability * CALIBRATION_BUCKETS),
      );
      const bucket = calibration[index][bucketIndex];
      bucket.forecasts += 1;
      bucket.predictedTotal += probability;
      bucket.observedTotal += actual[index];
    });
  }

  const sampleSize = games.length;
  return {
    sampleSize,
    smallSampleWarning: sampleSize < MINIMUM_SAMPLE_SIZE
      ? `Small sample: interpret cautiously until at least ${MINIMUM_SAMPLE_SIZE} completed predictions are available.`
      : null,
    topChoiceAccuracy: sampleSize ? topChoiceCorrect / sampleSize : null,
    meanBrierScore: sampleSize ? brierTotal / sampleSize : null,
    outcomes,
    calibration: calibration.flatMap((bins, outcomeIndex) =>
      bins.filter((bucket) => bucket.forecasts > 0).map((bucket) => ({
        outcome: outcomeLabels[outcomeIndex],
        lowerBound: bucket.lowerBound,
        upperBound: bucket.upperBound,
        forecasts: bucket.forecasts,
        meanPredictedProbability: bucket.predictedTotal / bucket.forecasts,
        observedFrequency: bucket.observedTotal / bucket.forecasts,
      })),
    ),
  };
}

export function buildWinChanceAccuracyReport(
  predictions: StoredWinPrediction[],
  games: CompletedGameForAccuracy[],
  leagues: LeagueTieSetting[],
): WinChanceAccuracyReport {
  const gamesById = new Map(games.map((game) => [game.id, game]));
  const leaguesById = new Map(leagues.map((league) => [league.id, league]));
  const evaluated: EvaluatedGame[] = [];
  const excluded: WinChanceAccuracyReport["excluded"] = {
    missingGame: 0,
    incompleteGame: 0,
    scrimmage: 0,
    teamMismatch: 0,
    missingLeagueSetting: 0,
    missingScore: 0,
    tieInLeagueWithoutTies: 0,
    invalidProbability: 0,
  };

  for (const prediction of predictions) {
    const game = gamesById.get(prediction.gameId);
    if (!game) {
      excluded.missingGame += 1;
      continue;
    }
    if (!game.isCompleted) {
      excluded.incompleteGame += 1;
      continue;
    }
    if (game.isScrimmage) {
      excluded.scrimmage += 1;
      continue;
    }
    if (game.homeTeamId !== prediction.homeTeamId || game.awayTeamId !== prediction.awayTeamId) {
      excluded.teamMismatch += 1;
      continue;
    }
    if (!game.leagueId || !leaguesById.has(game.leagueId)) {
      excluded.missingLeagueSetting += 1;
      continue;
    }
    if (game.homeScore == null || game.awayScore == null) {
      excluded.missingScore += 1;
      continue;
    }

    const league = leaguesById.get(game.leagueId)!;
    let outcome: PredictionOutcome;
    if (game.homeScore === game.awayScore) {
      if (!league.allowTies) {
        excluded.tieInLeagueWithoutTies += 1;
        continue;
      }
      outcome = "tie";
    } else {
      outcome = game.homeScore > game.awayScore ? "home" : "away";
    }

    const probabilities = parseProbabilities(prediction);
    if (!probabilities || (!league.allowTies && probabilities[2] > PROBABILITY_SUM_TOLERANCE)) {
      excluded.invalidProbability += 1;
      continue;
    }

    evaluated.push({
      leagueId: league.id,
      leagueName: league.name,
      allowTies: league.allowTies,
      outcome,
      probabilities,
    });
  }

  const byLeague = new Map<string, EvaluatedGame[]>();
  for (const game of evaluated) {
    const leagueGames = byLeague.get(game.leagueId) ?? [];
    leagueGames.push(game);
    byLeague.set(game.leagueId, leagueGames);
  }

  return {
    minimumSampleSizeForInterpretation: MINIMUM_SAMPLE_SIZE,
    overall: summarize(evaluated),
    byLeague: [...byLeague.entries()]
      .map(([leagueId, leagueGames]) => ({
        leagueId,
        leagueName: leagueGames[0].leagueName,
        allowTies: leagueGames[0].allowTies,
        metrics: summarize(leagueGames),
      }))
      .sort((a, b) => a.leagueName.localeCompare(b.leagueName)),
    excluded,
  };
}

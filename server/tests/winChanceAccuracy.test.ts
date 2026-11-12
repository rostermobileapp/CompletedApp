import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildWinChanceAccuracyReport,
  type CompletedGameForAccuracy,
  type LeagueTieSetting,
  type StoredWinPrediction,
} from "../../shared/winChanceAccuracy.js";

const leagues: LeagueTieSetting[] = [
  { id: "league-ties", name: "Tie League", allowTies: true },
  { id: "league-no-ties", name: "No-Tie League", allowTies: false },
];

function game(
  id: string,
  leagueId = "league-ties",
  homeScore: number | null = 2,
  awayScore: number | null = 1,
  overrides: Partial<CompletedGameForAccuracy> = {},
): CompletedGameForAccuracy {
  return {
    id,
    leagueId,
    homeTeamId: "home",
    awayTeamId: "away",
    homeScore,
    awayScore,
    isCompleted: true,
    isScrimmage: false,
    ...overrides,
  };
}

function prediction(
  gameId: string,
  home = 0.7,
  away = 0.2,
  tie = 0.1,
  overrides: Partial<StoredWinPrediction> = {},
): StoredWinPrediction {
  return {
    gameId,
    homeTeamId: "home",
    awayTeamId: "away",
    homeWinProbability: home,
    awayWinProbability: away,
    tieProbability: tie,
    ...overrides,
  };
}

describe("development win-chance accuracy report", () => {
  test("scores only completed, matching, non-scrimmage games with stored predictions", () => {
    const report = buildWinChanceAccuracyReport(
      [
        prediction("valid"),
        prediction("incomplete"),
        prediction("scrimmage"),
        prediction("changed-teams"),
        prediction("missing-game"),
      ],
      [
        game("valid"),
        game("incomplete", "league-ties", 2, 1, { isCompleted: false }),
        game("scrimmage", "league-ties", 2, 1, { isScrimmage: true }),
        game("changed-teams", "league-ties", 2, 1, { homeTeamId: "new-home" }),
      ],
      leagues,
    );

    assert.equal(report.overall.sampleSize, 1);
    assert.equal(report.excluded.incompleteGame, 1);
    assert.equal(report.excluded.scrimmage, 1);
    assert.equal(report.excluded.teamMismatch, 1);
    assert.equal(report.excluded.missingGame, 1);
    assert.equal(report.overall.smallSampleWarning?.startsWith("Small sample"), true);
  });

  test("uses the league tie setting to score tied finals", () => {
    const report = buildWinChanceAccuracyReport(
      [prediction("tie-allowed", 0.2, 0.2, 0.6), prediction("tie-disabled", 0.6, 0.4, 0)],
      [
        game("tie-allowed", "league-ties", 3, 3),
        game("tie-disabled", "league-no-ties", 3, 3),
      ],
      leagues,
    );

    assert.equal(report.overall.sampleSize, 1);
    assert.equal(report.overall.outcomes.tie, 1);
    assert.equal(report.excluded.tieInLeagueWithoutTies, 1);
    assert.equal(report.byLeague[0].allowTies, true);
    assert.ok(Math.abs((report.overall.meanBrierScore ?? 0) - 0.24) < 1e-12);
  });

  test("reports Brier score, calibration observations, and empty-sample handling", () => {
    const report = buildWinChanceAccuracyReport(
      [prediction("home-win")],
      [game("home-win")],
      leagues,
    );

    assert.equal(report.minimumSampleSizeForInterpretation, 30);
    assert.equal(report.overall.topChoiceAccuracy, 1);
    assert.ok(Math.abs((report.overall.meanBrierScore ?? 0) - 0.14) < 1e-12);
    assert.equal(report.overall.calibration.reduce((sum, bin) => sum + bin.forecasts, 0), 3);
    assert.deepEqual(
      [...new Set(report.overall.calibration.map((bin) => bin.outcome))].sort(),
      ["away", "home", "tie"],
    );

    const empty = buildWinChanceAccuracyReport([], [], []);
    assert.equal(empty.overall.sampleSize, 0);
    assert.equal(empty.overall.meanBrierScore, null);
    assert.equal(empty.overall.topChoiceAccuracy, null);
    assert.equal(empty.overall.calibration.length, 0);
  });

  test("excludes missing scores, missing league settings, and malformed probabilities", () => {
    const report = buildWinChanceAccuracyReport(
      [
        prediction("missing-score"),
        prediction("missing-setting"),
        prediction("invalid-probability", 0.4, 0.4, 0.4),
      ],
      [
        game("missing-score", "league-ties", null, 1),
        game("missing-setting", "unknown-league"),
        game("invalid-probability"),
      ],
      leagues,
    );

    assert.equal(report.overall.sampleSize, 0);
    assert.equal(report.excluded.missingScore, 1);
    assert.equal(report.excluded.missingLeagueSetting, 1);
    assert.equal(report.excluded.invalidProbability, 1);
  });
});

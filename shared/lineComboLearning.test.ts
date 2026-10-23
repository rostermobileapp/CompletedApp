import test from "node:test";
import assert from "node:assert/strict";
import { learnLineComboCalibration, applyLineComboCalibration, type ScoredLineForecast } from "./lineComboLearning";

const sample = (gameId: string, actualPoints: number, playerIds = ["a", "b", "c"]): ScoredLineForecast =>
  ({ gameId, lineType: "forward", playerIds, basePointsPerGame: 4, actualPoints });
const prediction = (rows: ScoredLineForecast[], ids = ["a", "b", "c"]) =>
  applyLineComboCalibration(4, "forward", ids, learnLineComboCalibration(rows));

test("without outcomes the prediction is exactly the original baseline", () => {
  assert.deepEqual(prediction([]), { pointsPerGame: 4, tuningGames: 0 });
});
test("future overperformance and underperformance change the actual prediction formula", () => {
  assert.ok(prediction([sample("g", 6)]).pointsPerGame > 4);
  assert.ok(prediction([sample("g", 2)]).pointsPerGame < 4);
  assert.ok(prediction([sample("g", 6)]).pointsPerGame < 4.5, "One game cannot dominate.");
});
test("more consistent evidence increases the correction conservatively", () => {
  const one = prediction([sample("g", 6)]).pointsPerGame;
  const many = prediction(Array.from({ length: 15 }, (_, i) => sample(`g${i}`, 6))).pointsPerGame;
  assert.ok(many > one && many < 6);
});
test("a familiar pair contributes to the estimate of a never-played-together group", () => {
  const state = learnLineComboCalibration([
    ...Array.from({ length: 8 }, (_, i) => [sample(`g${i}`, 6), sample(`g${i}`, 2, ["d", "e", "f"])]).flat(),
  ]);
  const familiar = applyLineComboCalibration(4, "forward", ["a", "b", "d"], state);
  const unfamiliar = applyLineComboCalibration(4, "forward", ["a", "d", "x"], state);
  assert.ok(familiar.pointsPerGame > unfamiliar.pointsPerGame);
  assert.equal(familiar.tuningGames, 8, "Two forward lines are not sixteen independent games.");
});
test("duplicate group/game records do not multiply learned effects", () => {
  const rows = [sample("g", 6)];
  assert.deepEqual(learnLineComboCalibration([...rows, ...rows]), learnLineComboCalibration(rows));
});
test("corrected outcomes replace errors instead of accumulating a second sample", () => {
  assert.equal(prediction([sample("g", 4)]).pointsPerGame, 4);
  assert.equal(prediction([sample("g", 4)]).tuningGames, 1);
});
test("an extreme result is bounded and zero-scoring predictions remain nonnegative", () => {
  assert.ok(prediction([sample("g", 10000)]).pointsPerGame < 4.5);
  const state = learnLineComboCalibration(Array.from({ length: 60 }, (_, i) => sample(`${i}`, 0)));
  assert.ok(applyLineComboCalibration(0, "forward", ["a", "b", "c"], state).pointsPerGame >= 0);
});
test("forward outcomes never calibrate defense, unknown history and invalid rows are rejected", () => {
  const state = learnLineComboCalibration([sample("g", 6), sample("bad", NaN), sample("duplicate", 4, ["a", "a", "b"])]);
  assert.equal(state.evaluatedGames, 1);
  assert.deepEqual(applyLineComboCalibration(4, "defense", ["a", "b"], state), { pointsPerGame: 4, tuningGames: 0 });
});
test("unavailable learning storage cannot masquerade as trained calibration", () => {
  const state = learnLineComboCalibration([sample("g", 6)], false);
  assert.deepEqual(applyLineComboCalibration(4, "forward", ["a", "b", "c"], state), { pointsPerGame: 4, tuningGames: 0 });
});

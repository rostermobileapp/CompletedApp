import test from "node:test";
import assert from "node:assert/strict";
import { buildLineComboStats, projectLineCombo, type ComboHistoryRow } from "./lineComboPredictions";

const rows: ComboHistoryRow[] = [];
for (let game = 1; game <= 6; game++) {
  for (const [line, players] of [[1, ["a", "b", "c"]], [2, ["d", "e", "f"]]] as const) {
    for (const player of players) rows.push({
      lineId: `g${game}-l${line}`, gameId: `g${game}`, lineType: "forward",
      playerId: player, points: { a: 1, b: 2, c: 0, d: 3, e: 0, f: 1 }[player],
    });
  }
}
const stats = buildLineComboStats(rows);
test("recorded PPG uses combined actual points and counts six zero-inclusive games", () => {
  assert.deepEqual(projectLineCombo(stats, "forward", ["c", "a", "b"]),
    { kind: "recorded", pointsPerGame: 3, sampleGames: 6 });
  assert.equal(stats.players.find(player => player.playerId === "c")?.gamesPlayed, 6);
});
test("swapping players predicts both unseen combinations immediately without saving", () => {
  assert.deepEqual(projectLineCombo(stats, "forward", ["d", "b", "c"]),
    { kind: "predicted", pointsPerGame: 5, sampleGames: 6 });
  assert.deepEqual(projectLineCombo(stats, "forward", ["a", "e", "f"]),
    { kind: "predicted", pointsPerGame: 2, sampleGames: 6 });
  assert.equal(stats.forward.length, 2, "Predictions do not fabricate saved historical combos.");
});
test("reversing a swap recovers the exact recorded average; slot ordering is irrelevant", () => {
  assert.equal(projectLineCombo(stats, "forward", ["b", "c", "a"])?.kind, "recorded");
  assert.equal(projectLineCombo(stats, "forward", ["d", "c", "b"])?.pointsPerGame, 5);
});
test("defense and partial groups can predict from known player histories", () => {
  assert.deepEqual(projectLineCombo(stats, "defense", ["a", "d"]),
    { kind: "predicted", pointsPerGame: 4, sampleGames: 6 });
});
test("missing history is not invented as zero and duplicate players cannot inflate predictions", () => {
  assert.equal(projectLineCombo(stats, "forward", ["a", "unknown", "b"]), undefined);
  assert.equal(projectLineCombo(stats, "forward", ["a", "a", "b"]), undefined);
  assert.equal(projectLineCombo(undefined, "forward", ["a", "b"]), undefined);
});
test("duplicate saved lines and repeated player rows do not double-count production or games", () => {
  const duplicated = buildLineComboStats([
    ...rows, ...rows,
    ...rows.map(row => ({ ...row, lineId: `duplicate-${row.lineId}` })),
  ]);
  assert.deepEqual(duplicated, stats);
});
test("an authentic zero scoring history produces a zero prediction rather than missing data", () => {
  const zero = buildLineComboStats([
    { lineId: "a", gameId: "g", lineType: "forward", playerId: "one", points: 0 },
    { lineId: "b", gameId: "g", lineType: "forward", playerId: "two", points: 0 },
  ]);
  assert.deepEqual(projectLineCombo(zero, "forward", ["one", "two"]),
    { kind: "predicted", pointsPerGame: 0, sampleGames: 1 });
});

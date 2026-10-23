import test from "node:test";
import assert from "node:assert/strict";
import { countRecordedBeverageDuties, withBeverageDutyAssignments } from "./beverageDutyCounts";

const game = { id: "last-game", homeTeamId: "team", awayTeamId: "opponent" };
const assignment = { gameId: game.id, teamId: "team", userId: "player" };

test("counts the recorded default duty when legacy beverage fields are empty", () => {
  const enriched = withBeverageDutyAssignments([game], [assignment]);
  assert.deepEqual(countRecordedBeverageDuties(enriched, "team"), { player: 1 });
  assert.equal("beverageDutyAssignments" in game, false);
});

test("keeps older home and away recorded beverage claims", () => {
  assert.deepEqual(countRecordedBeverageDuties([
    { ...game, homeBeverageDutyUserId: "player", awayBeverageDutyUserId: "other" },
    { ...game, id: "away-game", homeTeamId: "opponent", awayTeamId: "team", awayBeverageDutyUserId: "player" },
  ], "team"), { player: 2 });
});

test("counts a game once when both systems or duplicate responses record it", () => {
  const enriched = withBeverageDutyAssignments([
    { ...game, homeBeverageDutyUserId: "player" },
    { ...game, homeBeverageDutyUserId: "player" },
  ], [assignment, assignment]);
  assert.deepEqual(countRecordedBeverageDuties(enriched, "team"), { player: 1 });
});

test("current default assignment takes precedence over an older legacy claimant", () => {
  const enriched = withBeverageDutyAssignments([{ ...game, homeBeverageDutyUserId: "old-player" }], [assignment]);
  assert.deepEqual(countRecordedBeverageDuties(enriched, "team"), { player: 1 });
});

test("opponent and unrelated-team duties cannot count for the selected team", () => {
  const enriched = withBeverageDutyAssignments([
    { ...game, homeBeverageDutyUserId: "player" },
    { ...game, id: "unrelated", homeTeamId: "other", awayTeamId: "opponent", homeBeverageDutyUserId: "player" },
  ], [{ ...assignment, teamId: "opponent", userId: "other-player" }]);
  assert.deepEqual(countRecordedBeverageDuties(enriched, "team"), { player: 1 });
  assert.deepEqual(countRecordedBeverageDuties(enriched, "opponent"), { "other-player": 1 });
});

test("released modern duty disappears; missing teams and unclaimed games stay empty", () => {
  assert.deepEqual(countRecordedBeverageDuties(withBeverageDutyAssignments([game], []), "team"), {});
  assert.deepEqual(countRecordedBeverageDuties([game], null), {});
  assert.deepEqual(withBeverageDutyAssignments([], [assignment]), []);
});

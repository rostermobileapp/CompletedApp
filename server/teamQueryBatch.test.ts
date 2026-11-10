import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collectUniqueTeamIdsFromGames } from "./teamQueryBatch";

describe("team query batching", () => {
  it("keeps each team ID once in first-seen order", () => {
    assert.deepEqual(
      collectUniqueTeamIdsFromGames([
        { homeTeamId: "team-a", awayTeamId: "team-b" },
        { homeTeamId: "team-b", awayTeamId: "team-c" },
        { homeTeamId: "team-a", awayTeamId: "team-c" },
        { homeTeamId: "team-d", awayTeamId: null },
      ]),
      ["team-a", "team-b", "team-c", "team-d"],
    );
  });

  it("returns no IDs when there are no games", () => {
    assert.deepEqual(collectUniqueTeamIdsFromGames([]), []);
  });
});

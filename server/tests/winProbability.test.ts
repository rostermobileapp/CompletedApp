import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { predictGame, type TeamInput } from "../../supabase/functions/recalculate-win-chance/winProbability.js";

const home: TeamInput = {
  name: "Home",
  gamesPlayed: 8,
  wins: 5,
  losses: 2,
  ties: 1,
  goalsFor: 30,
  goalsAgainst: 22,
  streak: 2,
  skaters: [
    {
      id: "home-star",
      name: "Home Star",
      gamesPlayed: 8,
      goals: 10,
      assists: 8,
      recentGames: [
        { goals: 1, assists: 1 },
        { goals: 2, assists: 0 },
        { goals: 1, assists: 1 },
        { goals: 1, assists: 0 },
      ],
      rsvp: "in",
    },
  ],
  goalies: [],
};

const away: TeamInput = {
  name: "Away",
  gamesPlayed: 8,
  wins: 3,
  losses: 4,
  ties: 1,
  goalsFor: 24,
  goalsAgainst: 29,
  streak: -1,
  skaters: [
    {
      id: "away-star",
      name: "Away Star",
      gamesPlayed: 8,
      goals: 7,
      assists: 6,
      recentGames: [
        { goals: 1, assists: 0 },
        { goals: 0, assists: 1 },
        { goals: 1, assists: 1 },
        { goals: 0, assists: 1 },
      ],
      rsvp: "none",
    },
  ],
  goalies: [],
};

describe("win-chance model", () => {
  test("produces bounded, normalized probabilities and projections", () => {
    const result = predictGame(home, away, [], { leagueAvgGoals: 3.2 });
    assert.ok(result.winProbA >= 0.05 && result.winProbA <= 0.95);
    assert.ok(result.winProbB >= 0.05 && result.winProbB <= 0.95);
    assert.equal(result.winProbA + result.winProbB, 1);
    assert.equal(result.tieProb, 0);
    assert.ok(result.expectedGoalsA > 0);
    assert.ok(result.expectedGoalsB > 0);
    assert.ok(result.topScorersA.some((player) => player.id === "home-star"));
    assert.match(result.moneylineA, /^[+−-]?\d+$/);
  });

  test("reports ties only when the league allows them", () => {
    const result = predictGame(home, away, [], { leagueAvgGoals: 3.2, allowTies: true });
    assert.ok(result.tieProb > 0);
    assert.ok(Math.abs(result.winProbA + result.winProbB + result.tieProb - 1) < 1e-10);
  });

  test("an out RSVP lowers expected goals for a full lineup", () => {
    const fullHome: TeamInput = {
      ...home,
      skaters: [
        ...home.skaters,
        ...Array.from({ length: 9 }, (_, index) => ({
          id: `home-depth-${index}`,
          name: `Depth ${index + 1}`,
          gamesPlayed: 8,
          goals: 1,
          assists: 1,
          recentGames: [
            { goals: 0, assists: 0 },
            { goals: 0, assists: 0 },
            { goals: 0, assists: 0 },
            { goals: 0, assists: 0 },
          ],
          rsvp: "none" as const,
        })),
      ],
    };
    const outHome: TeamInput = {
      ...fullHome,
      skaters: fullHome.skaters.map((player) =>
        player.id === "home-star" ? { ...player, rsvp: "out" } : player
      ),
    };
    const available = predictGame(fullHome, away, [], { leagueAvgGoals: 3.2 });
    const unavailable = predictGame(outHome, away, [], { leagueAvgGoals: 3.2 });
    assert.ok(unavailable.expectedGoalsA < available.expectedGoalsA);
  });
});

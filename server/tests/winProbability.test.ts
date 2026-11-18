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

  test("projects every skater, including zero-point out RSVPs, and excludes goalies", () => {
    const skaters = Array.from({ length: 10 }, (_, index) => ({
      id: `skater-${index + 1}`,
      name: `Skater ${index + 1}`,
      gamesPlayed: 8,
      goals: index + 1,
      assists: index,
      recentGames: [],
      rsvp: (index === 9 ? "out" : "none") as "out" | "none",
    }));
    const result = predictGame(
      { ...home, skaters, goalies: [{ id: "goalie", gamesPlayed: 8, goalsAgainst: 20, recentGoalsAgainst: [], rsvp: "in" }] },
      { ...away, skaters: skaters.map(player => ({ ...player, id: `away-${player.id}` })) },
      [],
      { leagueAvgGoals: 3.2 },
    );
    assert.equal(result.topScorersA.length, skaters.length);
    assert.deepEqual(
      new Set(result.topScorersA.map((player) => player.id)),
      new Set(skaters.map((player) => player.id)),
    );
    assert.equal(result.topScorersA.some((player) => player.id === "goalie"), false);
    assert.equal(result.topScorersA.find((player) => player.id === "skater-10")?.projectedPoints, 0);
    assert.equal(result.topScorersA.find((player) => player.id === "skater-10")?.chanceOfPoint, 0);
    assert.equal(result.topScorersB.length, skaters.length);
    assert.deepEqual(
      new Set(result.topScorersB.map((player) => player.id)),
      new Set(skaters.map((player) => `away-${player.id}`)),
    );
    assert.ok(result.topScorersA.every((player, index, players) =>
      index === 0 || players[index - 1].projectedPoints >= player.projectedPoints));
  });

  test("keeps every skater when the entire roster is out or has zero production", () => {
    for (const rsvp of ["out", "none"] as const) {
      const skaters = Array.from({ length: 12 }, (_, index) => ({
        id: `zero-${index}`, name: `Zero ${index}`, gamesPlayed: 8,
        goals: 0, assists: 0, recentGames: [], rsvp,
      }));
      const result = predictGame({ ...home, skaters }, away, [], { leagueAvgGoals: 3.2 });
      assert.equal(result.topScorersA.length, 12);
      assert.ok(result.topScorersA.every(player => player.projectedPoints === 0 && player.chanceOfPoint === 0));
    }
    assert.deepEqual(predictGame({ ...home, skaters: [] }, away).topScorersA, []);
  });

  test("expanding the skater output does not change win probabilities or goal projections", () => {
    const skaters = Array.from({ length: 12 }, (_, index) => ({
      id: `skater-${index}`, name: `Skater ${index}`, gamesPlayed: 8,
      goals: index + 1, assists: index, recentGames: [],
      rsvp: (index === 11 ? "out" : "none") as "out" | "none",
    }));
    const team = { ...home, skaters, goalies: [] };
    const result = predictGame(team, {
      ...team, name: "Away", goalsFor: 24, goalsAgainst: 29, wins: 3, losses: 4, streak: -1,
    }, [], { leagueAvgGoals: 3.2 });
    // Recorded from the unchanged calculation before removing the output limit.
    assert.equal(result.winProbA, 0.7709666328138073);
    assert.equal(result.winProbB, 0.22903336718619272);
    assert.equal(result.expectedGoalsA, 4.639107316480311);
    assert.equal(result.expectedGoalsB, 3.222391390816282);
    assert.deepEqual(result.projectedScore, { a: 4, b: 3 });
    assert.equal(result.topScorersA.length, 12);
    assert.equal(result.topScorersB.length, 12);
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

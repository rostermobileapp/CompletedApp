import test from "node:test";
import assert from "node:assert/strict";
import { buildOpponentAdjustment, type OpponentSummary } from "./lineComboOpponent";
import { buildLineComboStats, projectLineCombo } from "./lineComboPredictions";
import { learnLineComboCalibration } from "./lineComboLearning";

const summary: OpponentSummary = {
  gameId: "next", opponentId: "other", opponentName: "Ice Owls", gamesPlayed: 20,
  goalsForPerGame: 3, goalsAgainstPerGame: 3, leagueGoalsPerTeam: 3,
};
test("league-average opposition is neutral; both scoring and conceding affect the forecast", () => {
  assert.equal(buildOpponentAdjustment(summary).multiplier, 1);
  assert.ok(buildOpponentAdjustment({...summary, goalsAgainstPerGame: 5}).multiplier > 1);
  assert.ok(buildOpponentAdjustment({...summary, goalsAgainstPerGame: 1}).multiplier < 1);
  assert.ok(buildOpponentAdjustment({...summary, goalsForPerGame: 5}).multiplier > 1);
  assert.ok(buildOpponentAdjustment({...summary, goalsForPerGame: 1}).multiplier < 1);
  assert.ok(buildOpponentAdjustment({...summary, goalsAgainstPerGame: 4}).multiplier >
    buildOpponentAdjustment({...summary, goalsForPerGame: 4}).multiplier, "defensive record has the larger weight");
});
test("small samples shrink toward neutral and extreme records are bounded", () => {
  assert.ok(buildOpponentAdjustment({...summary,gamesPlayed:1,goalsAgainstPerGame:5}).multiplier <
    buildOpponentAdjustment({...summary,gamesPlayed:20,goalsAgainstPerGame:5}).multiplier);
  assert.equal(buildOpponentAdjustment({...summary,goalsAgainstPerGame:100}).multiplier,1.3);
  assert.equal(buildOpponentAdjustment({...summary,goalsAgainstPerGame:0,goalsForPerGame:0}).multiplier,0.7);
});
test("unknown opponents, missing results, zeros and invalid data do not fabricate an adjustment", () => {
  assert.equal(buildOpponentAdjustment().status,"no-upcoming-game");
  assert.equal(buildOpponentAdjustment({...summary,opponentId:null}).status,"untracked-opponent");
  for (const invalid of [{gamesPlayed:0},{goalsAgainstPerGame:null},{goalsForPerGame:-1},{leagueGoalsPerTeam:0},{goalsForPerGame:NaN}]) {
    const result=buildOpponentAdjustment({...summary,...invalid});assert.equal(result.status,"no-scored-history");assert.equal(result.multiplier,1);
  }
  assert.equal(buildOpponentAdjustment({...summary,goalsForPerGame:0,goalsAgainstPerGame:0}).status,"adjusted");
});
test("matchup affects unsaved groups and exact groups without changing recorded history, then learning applies once", () => {
  const stats=buildLineComboStats(["a","b","c"].map(playerId=>({lineId:"l",gameId:"old",lineType:"forward" as const,playerId,points:1})));
  const opponent=buildOpponentAdjustment({...summary,goalsAgainstPerGame:5});
  const learning=learnLineComboCalibration([]);
  const projected=projectLineCombo({...stats,opponent,learning},"forward",["b","a","c"])!;
  assert.equal(projected.kind,"predicted");assert.equal(projected.pointsPerGame,3*opponent.multiplier);
  assert.equal(projected.recordedPointsPerGame,3);assert.equal(stats.forward[0].pointsPerGame,3);
  assert.equal(projectLineCombo({...stats,opponent,learning},"defense",["a","c"])!.pointsPerGame,2*opponent.multiplier);
  const tuned={...learning,groups:[{lineType:"forward" as const,size:3,games:5,bias:0.5,pairs:[]}]};
  assert.equal(projectLineCombo({...stats,opponent,learning:tuned},"forward",["a","b","c"])!.pointsPerGame,3*opponent.multiplier+0.5);
});

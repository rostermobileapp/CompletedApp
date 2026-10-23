import test from "node:test";
import assert from "node:assert/strict";
import { loadLineComboOpponent } from "../lineComboOpponent";
import { opponentAdjustedBaseline } from "../../shared/lineComboOpponent";

test("opponent lookup failure is explicit and cannot prevent a base prediction",async t=>{
  const logged=t.mock.method(console,"warn",()=>{});
  const connection:any={query:async()=>{throw {code:"42703",message:"private SQL and connection data",detail:"private details"};}};
  const result=await loadLineComboOpponent(connection,"team");
  assert.equal(result.status,"unavailable");
  assert.equal(opponentAdjustedBaseline(4,result),4);
  assert.equal(logged.mock.calls.length,1);
  assert.deepEqual(logged.mock.calls[0].arguments[1],{code:"42703"});
  assert.ok(!JSON.stringify(logged.mock.calls).includes("private SQL"));
});
test("empty opponent score history returns a neutral context without an exception",async()=>{
  const connection:any={query:async()=>({rows:[{
    gameId:"next",opponentId:"them",opponentName:"Other team",gamesPlayed:0,
    goalsForPerGame:null,goalsAgainstPerGame:null,leagueGoalsPerTeam:null,
  }]})};
  const result=await loadLineComboOpponent(connection,"us");
  assert.equal(result.status,"no-scored-history");
  assert.equal(result.multiplier,1);
});

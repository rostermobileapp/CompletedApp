import test from "node:test";
import assert from "node:assert/strict";
import { loadLineComboStats } from "./lineComboStats";
import { buildLineComboStats, projectLineCombo } from "../../../shared/lineComboPredictions";
import { learnLineComboCalibration } from "../../../shared/lineComboLearning";

const base = () => ({
  ...buildLineComboStats(["a","b","c"].map(playerId => ({
    lineId:"ours",gameId:"played",lineType:"forward" as const,playerId,points:1,
  }))),
  learning:learnLineComboCalibration([]),
});
const response = (body: unknown) => Promise.resolve({json:async()=>body});

test("missing opponent metadata preserves real predictions instead of throwing Stats unavailable",async()=>{
  const stats=await loadLineComboStats(()=>response(base()),"team");
  assert.equal(stats.opponent?.status,"unavailable");
  assert.equal(projectLineCombo(stats,"forward",["a","b","c"])?.pointsPerGame,3);
});
test("no upcoming opponent or no scored history is neutral, not a failed prediction",async()=>{
  for(const status of ["no-upcoming-game","no-scored-history","unavailable"] as const){
    const stats=await loadLineComboStats(()=>response({...base(),opponent:{
      version:"opponent-v1",status,gamesPlayed:0,multiplier:1,
    }}),"team");
    assert.equal(projectLineCombo(stats,"defense",["a","b"])?.pointsPerGame,2);
    assert.equal(stats.opponent?.status,status);
  }
});
test("older backend's legacy goals-only response is never mislabeled as player PPG",async()=>{
  const paths:string[]=[];
  const stats=await loadLineComboStats(path=>{
    paths.push(path);
    return response(path.endsWith("adaptive-v2")?{forward:[{goalsForPerGame:99}],defense:[]}:base());
  },"team");
  assert.equal(paths.length,2);assert.ok(paths[1].endsWith("adaptive-v1"));
  assert.equal(projectLineCombo(stats,"forward",["a","b","c"])?.pointsPerGame,3);
  assert.equal(stats.opponent?.status,"unavailable");
  await assert.rejects(loadLineComboStats(()=>response({forward:[],defense:[]}),"team"),/player prediction model is unavailable/);
});
test("a failed new matchup endpoint can still load the supported baseline",async()=>{
  for(const status of [404,500,503]){
    const paths:string[]=[];
    const stats=await loadLineComboStats(path=>{
      paths.push(path);
      if(path.endsWith("adaptive-v2"))return Promise.reject(Object.assign(new Error("matchup error"),{status}));
      return response(base());
    },"team");
    assert.equal(paths.length,2);assert.equal(stats.players.length,3);
    assert.equal(stats.opponent?.status,"unavailable");
  }
});
test("authorization failures are never bypassed or retried as a different model",async()=>{
  for(const status of [401,403]){
    let calls=0;
    await assert.rejects(loadLineComboStats(()=>{calls++;return Promise.reject(Object.assign(new Error("Denied"),{status}));},"team"),/Denied/);
    assert.equal(calls,1);
  }
});
test("valid opponent context still adjusts the prediction and missing learning is explicitly unavailable",async()=>{
  const original=base();
  const stats=await loadLineComboStats(()=>response({...original,learning:undefined,opponent:{
    version:"opponent-v1",status:"adjusted",gamesPlayed:5,multiplier:1.2,
  }}),"team");
  assert.equal(stats.learning?.available,false);
  assert.ok(Math.abs(projectLineCombo(stats,"forward",["a","b","c"])!.pointsPerGame-3.6)<1e-9);
});


import assert from "node:assert/strict";
import test from "node:test";
import {groupDraw,groupFixtureKeys,groupStandingState,validateGroupConfig} from "../src/services/groupBracketCore.js";

function games(ids,winners) {
  return groupFixtureKeys(1,ids).map((m,i)=>({...m,winner:winners[i]===m.a.pid?"a":winners[i]===m.b.pid?"b":null}));
}

test("2-way tie uses the head-to-head regardless of draw order",()=>{
  const four=["B","A","C","D"];
  const state=groupStandingState(four,games(four,["A","B","B","A","D","C"]),1);
  assert.deepEqual(state.qualified,["A"]);
  assert.equal(state.rows[0].reason,"승자승");
});

test("mini-league reapplies head-to-head when a remaining subset has two players",()=>{
  const ids=["A","B","C","D","E","F"];
  // A/B/C/D finish 3–2. Their mini-league splits A/B (2 wins)
  // from C/D (1 win); A beat B and C beat D.
  const matches=games(ids,["A","A","D","A","F","B","B","E","B","C","C","C","D","D","E"]);
  const state=groupStandingState(ids,matches,3);
  assert.deepEqual(state.rows.map(r=>r.id),ids);
  assert.deepEqual(state.qualified,["A","B","C"]);
  assert.equal(state.cutoff,null);
});

test("3-player cycle with two advancing needs one separate match; one advancing needs two",()=>{
  const ids=["A","B","C"], fixtures=games(ids,["A","C","B"]);
  const undecided=groupStandingState(ids,fixtures,2);
  assert.deepEqual(undecided.next,ids);
  const playoff=(a,b,winner)=>({a:{pid:a},b:{pid:b},winner});
  const two=groupStandingState(ids,fixtures,2,[playoff("A","B","a")]);
  assert.equal(two.ready,true);
  assert.deepEqual(two.qualified,["A","C"]);
  assert.deepEqual(two.rows.map(row=>[row.rank,row.wins]),[[1,1],[1,1],[1,1]]);
  const one=groupStandingState(ids,fixtures,1,[playoff("A","B","a")]);
  assert.deepEqual(one.next,["A","C"]);
  assert.deepEqual(groupStandingState(ids,fixtures,1,[playoff("A","B","a"),playoff("A","C","b")]).qualified,["C"]);
});

test("shared ranks away from the cutoff need no extra match; incomplete rounds cannot qualify",()=>{
  const ids=["A","B","C","D"], fixtures=games(ids,["A","C","A","B","B","C"]);
  const state=groupStandingState(ids,fixtures,3);
  assert.ok(state.ready);
  assert.equal(state.cutoff,null);
  assert.deepEqual(state.rows.map(r=>r.rank),[1,1,1,4]);
  assert.equal(groupStandingState(ids,[...fixtures.slice(0,-1),{...fixtures.at(-1),winner:null}],3).ready,false);
});

test("draw makes balanced groups, and empty or non-eliminating pools are rejected",()=>{
  assert.deepEqual(groupDraw([1,2,3,4,5,6,7],3,()=>0.99).map(pool=>pool.length),[3,2,2]);
  assert.throws(()=>validateGroupConfig(7,3,2,"single_elimination"),/탈락자/);
  assert.doesNotThrow(()=>validateGroupConfig(6,2,2,"double_elimination"));
});

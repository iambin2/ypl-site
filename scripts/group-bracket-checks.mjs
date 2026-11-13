
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { projectRuntimeFacts, planMatchWinner, withPick } from "../src/services/bracketWinnerPlan.js";
import { drawPlan, slotsFromPlan, projectNormalizedGroupBracket, projectNormalizedDoubleEliminationBracket } from "../src/services/bracketProjection.js";
import { buildBracketMatchSyncPlan, buildEventBracketMatchSnapshot } from "../src/services/bracketMatchSnapshot.js";
import { liveMatches, matchStage } from "../src/services/recordsAnalytics.js";

export async function verifyGroupBrackets({pg,q,scalar,as,check,season}) {
  await as("postgres");
  await pg.exec(readFileSync("docs/db/group_brackets_and_rookie_candidates.sql","utf8"));
  await as("authenticated");
  const person=(name,player=null,reg=null)=>({participant_key:randomUUID(),display_name:name,player_id:player||randomUUID(),registration_id:reg||randomUUID(),entry_id:randomUUID(),entry_participant_id:randomUUID()});
  const payload=(people)=>people.map((p,i)=>({entry_id:p.entry_id,slot_no:i+1,pool_no:1}));
  const create=(id,event,topology,people,slots,advance=null,final=null,rookie=[])=>scalar("select create_individual_bracket_draw($1,$2,$3,$4,$5,$6,$7,$8)",[id,event,topology,people,slots,advance,final,rookie]);
  const event=()=>scalar("insert into events(season_id,name,event_type,division,status,date_precision,regulation_id,cup_rule_id) values($1,'조별 검증','pokecup','light','open','unknown','m-c','none') returning id",[season]);
  await check("Database mini-league recomputes two-player subsets after splitting a four-way tie",async()=>{
    const members=Array.from({length:6},()=>randomUUID());
    const winners=[0,0,3,0,5,1,1,4,1,2,2,2,3,3,4];
    const matches=[];
    for(let i=0;i<members.length;i++)for(let j=i+1;j<members.length;j++){
      matches.push({a:members[i],b:members[j],winner:members[winners[matches.length]]});
    }
    const bands=await scalar("select group_rank_bands($1,$2)",[members,matches]);
    assert.deepEqual(bands,members.map(id=>[id]));
  });
  async function facts(eid) {
    const [e,rt]=await Promise.all([scalar("select to_jsonb(e) from events e where id=$1",[eid]),scalar("select to_jsonb(rt) from bracket_runtimes rt where event_id=$1",[eid])]);
    const [slots,entries,participants,matches,registrations]=await Promise.all(
      ["bracket_entry_slots","entries","entry_participants","matches","event_registrations"].map(t=>q("select * from "+t+" where event_id=$1",[eid]))
    );
    return projectRuntimeFacts(rt,e,{slots:{data:slots},entries:{data:entries},participants:{data:participants},matches:{data:matches},registrations:{data:registrations}});
  }
  async function pick(eid,rid,key,winner,expected=null) {
    await q("select set_group_stage_winner($1,$2,$3,$4,$5)",[eid,rid,key,winner,expected]);
  }
  async function createFinal(f) {
    const ids=f.bracket.groupCfg.qualified;
    const slots=slotsFromPlan(drawPlan(ids),new Map(ids.map(id=>[id,id])));
    const view=projectNormalizedGroupBracket({
      event:f.event,runtimeId:f.runtime.id,entries:f.entries,entryParticipants:f.entryParticipants,matches:f.matches,
      entrySlots:[...f.entrySlots,...slots.map(s=>({...s,bracket_runtime_id:f.runtime.id,event_id:f.event.id,stage_kind:"elimination",stage_no:2,pool_no:0}))],
      advance:f.runtime.group_advance,finalFormat:f.runtime.group_final_format,
    });
    await q("select create_group_final($1,$2,$3,$4)",[f.event.id,f.runtime.id,slots,buildEventBracketMatchSnapshot(view).filter(m=>/^(single|double):/.test(m.source_node_key))]);
  }
  await check("3-way 1–1 cutoff uses one played decision match for two places, creates a real final, records and reverts",async()=>{
    const eid=await event(),rid=randomUUID(),p=["A","B","C"].map(n=>person("조별 "+n));
    await create(rid,eid,"groups_then_elimination",p,payload(p),2,"single_elimination");
    assert.equal(await create(rid,eid,"groups_then_elimination",p,payload(p),2,"single_elimination"),rid);
    let f=await facts(eid);
    assert.equal(f.matches.length,3);
    assert.equal(liveMatches(f.bracket).live.length,3);
    assert.equal(matchStage(f.bracket,"group:g1:m1"),"1조");
    const planned=planMatchWinner(f,"group:g1:m1",p[0].entry_id,new Date().toISOString(),p[1].entry_id);
    assert.equal(planned.updates[0].payload.winner_entry_id,p[0].entry_id);
    assert.deepEqual(planned.deleteIds,[]);
    await assert.rejects(()=>q("select create_group_final($1,$2,'[]','[]')",[eid,rid]),/먼저 완료/);
    await pick(eid,rid,"group:g1:m1",p[0].entry_id);
    await pick(eid,rid,"group:g1:m2",p[2].entry_id);
    await pick(eid,rid,"group:g1:m3",p[1].entry_id);
    f=await facts(eid);
    assert.equal(f.bracket.groupCfg.ready,false);
    assert.deepEqual(f.bracket.groups[0].standing.rows.map(x=>x.wins),[1,1,1]);
    const key=await scalar("select create_group_playoff($1,$2,1)",[eid,rid]);
    await assert.rejects(()=>q("select create_group_playoff($1,$2,1)",[eid,rid]),/필요한 동률/);
    await assert.rejects(()=>pick(eid,rid,"group:g1:m1",null,p[0].entry_id),/결정전/);
    f=await facts(eid);
    assert.equal(liveMatches(f.bracket).live[0].stage,"1조 순위 결정전");
    const playoff=f.matches.find(x=>x.source_node_key===key);
    await pick(eid,rid,key,playoff.entry_a_id);
    f=await facts(eid);
    assert.equal(f.bracket.groupCfg.ready,true);
    assert.equal(f.bracket.groupCfg.qualified.length,2);
    assert.ok(!f.bracket.groupCfg.qualified.includes(playoff.entry_b_id));
    await createFinal(f);
    f=await facts(eid);
    const previous=f.matches.filter(m=>m.source_node_key.startsWith("single:"));
    assert.equal(previous.length,1);
    const row=previous[0];
    const desired=buildEventBracketMatchSnapshot(withPick(f.bracket,row.source_node_key,"a")).filter(m=>m.source_node_key.startsWith("single:"));
    const plan=buildBracketMatchSyncPlan(previous,desired,new Date().toISOString());
    await q("select save_group_final_matches($1,$2,$3,$4,$5,$6)",[eid,rid,previous,plan.updates,plan.inserts,plan.deleteIds]);
    await assert.rejects(()=>q("select save_group_final_matches($1,$2,$3,$4,$5,$6)",[eid,rid,previous,plan.updates,[],[]]),/다른 곳/);
    const rows={inserts:[{id:randomUUID(),entry_id:row.entry_a_id,placement_code:"champion",rank_min:1,rank_max:1,placement_label:"우승"}],updates:[],deleteIds:[]};
    await q("select apply_event_record($1,$2,$3,false,null,null)",[eid,rows,{inserts:[],updates:[],deleteIds:[]}]);
    assert.equal(await scalar("select status from events where id=$1",[eid]),"completed");
    await assert.rejects(()=>q("select reopen_group_stage($1,$2)",[eid,rid]),/변경할 수 없는/);
    await q("select revert_event_record($1)",[eid]);
    await q("select * from delete_normalized_bracket_runtime($1,$2)",[rid,eid]);
    assert.equal(await scalar("select count(*)::int from matches where event_id=$1",[eid]),0);
    assert.equal(await scalar("select count(*)::int from entries where event_id=$1",[eid]),0);
  });
  await check("Rookie champion candidate is read-only until confirmation, then distinct Master registration is atomic",async()=>{
    const pair=(await q("select * from save_league_intake('auto-rookie',$1,null,$2)",[season,{subtitle:"승격 검증",battle_format:"singles",regulation_id:"m-c",cup_rule_id:"none"}]))[0];
    const {master_event_id:master,rookie_event_id:rookie}=pair;
    const p=person("자동 편입 검증");
    const other=person("루키 상대 검증");
    await create(randomUUID(),rookie,"single_elimination",[p,other],payload([p,other]));
    assert.deepEqual(await q("select * from list_same_round_rookie_champions($1)",[master]),[]);
    await q("insert into results(event_id,entry_id,placement_code,placement_label,source) values($1,$2,'champion','우승','test')",[rookie,p.entry_id]);
    await q("update events set status='completed',record_applied_at=now() where id=$1",[rookie]);
    const candidates=await q("select * from list_same_round_rookie_champions($1)",[master]);
    assert.equal(candidates[0].player_id,p.player_id);
    assert.equal(candidates[0].registration_id,null);
    assert.equal(await scalar("select count(*)::int from event_registrations where event_id=$1",[master]),0);
    const upgraded=person(p.display_name,p.player_id);
    const bad=person("자격 없는 마스터 검증");
    await assert.rejects(()=>create(randomUUID(),master,"single_elimination",[upgraded,bad],payload([upgraded,bad]),null,null,[p.player_id]),/자격/);
    assert.equal(await scalar("select count(*)::int from event_registrations where event_id=$1",[master]),0);
    const masterOther=await scalar("select ep.player_id from entry_participants ep join events e on e.id=ep.event_id where e.division='master' and not e.is_team_event and e.status='completed' limit 1");
    const otherName=await scalar("select display_name from players where id=$1",[masterOther]);
    const qualified=person(otherName,masterOther);
    await create(randomUUID(),master,"single_elimination",[upgraded,qualified],payload([upgraded,qualified]),null,null,[p.player_id]);
    const rows=await q("select id,event_id,player_id,final_submission_id,registration_data from event_registrations where player_id=$1 order by event_id",[p.player_id]);
    assert.equal(rows.length,2);
    assert.equal(rows.find(r=>r.event_id===rookie).id,p.registration_id);
    assert.equal(rows.find(r=>r.event_id===master).registration_data.source,"same_round_rookie_champion");
    assert.equal(rows.find(r=>r.event_id===master).final_submission_id,null);
    assert.deepEqual(await q("select * from list_same_round_rookie_champions($1)",[master]),[]);
    await as("anon");
    await assert.rejects(()=>q("select * from list_same_round_rookie_champions($1)",[master]),/permission/);
    await as("authenticated");
  });
  await check("Two pools qualify into a Double final; battle and operator plans preserve group facts through a reset",async()=>{
    const eid=await event(),rid=randomUUID(),p=Array.from({length:6},(_,i)=>person("더블 조별 "+i));
    const slots=payload(p).map((s,i)=>({...s,pool_no:i<3?1:2,slot_no:i%3+1}));
    await create(rid,eid,"groups_then_elimination",p,slots,2,"double_elimination");
    for(const [i,player] of p.entries()) if(i%3===0){
      const pool=1+i/3;
      await pick(eid,rid,`group:g${pool}:m1`,player.entry_id);
      await pick(eid,rid,`group:g${pool}:m2`,player.entry_id);
      await pick(eid,rid,`group:g${pool}:m3`,p[i+1].entry_id);
    }
    let f=await facts(eid);
    assert.equal(f.bracket.groupCfg.qualified.length,4);
    await createFinal(f);
    const applyPlan=async(f,plan)=>q("select save_group_final_matches($1,$2,$3,$4,$5,$6)",
      [eid,rid,f.matches.filter(m=>m.source_node_key.startsWith("double:")),plan.updates,plan.inserts,plan.deleteIds]);
    for(let i=0;i<12;i++){
      f=await facts(eid);
      const next=f.matches.find(m=>m.source_node_key.startsWith("double:")&&!m.winner_entry_id);
      if(!next)break;
      const isGF=next.source_node_key==="double:gf:m1";
      const plan=planMatchWinner(f,next.source_node_key,isGF?next.entry_b_id:next.entry_a_id,new Date().toISOString(),isGF?next.entry_a_id:next.entry_b_id);
      await applyPlan(f,plan);
    }
    f=await facts(eid);
    assert.ok(f.bracket.knockout.reset.winner);
    assert.equal(f.matches.filter(m=>m.source_node_key.startsWith("group:")).length,6);
    assert.ok(f.matches.every(m=>m.winner_entry_id));
    const reset=f.matches.find(m=>m.source_node_key==="double:reset:m1");
    await assert.rejects(()=>q("select reopen_group_stage($1,$2)",[eid,rid]),/본선 경기를 먼저/);
    const rows={inserts:[{id:randomUUID(),entry_id:reset.winner_entry_id,placement_code:"champion",rank_min:1,rank_max:1,placement_label:"우승"}],updates:[],deleteIds:[]};
    await q("select apply_event_record($1,$2,$3,false,null,null)",[eid,rows,{inserts:[],updates:[],deleteIds:[]}]);
    assert.equal(await scalar("select status from events where id=$1",[eid]),"completed");
  });
  await check("Ordinary individual Double creation writes formed matches atomically with identities",async()=>{
    const eid=await event(),rid=randomUUID(),p=Array.from({length:3},(_,i)=>person("일반 더블 검증 "+i));
    const slots=slotsFromPlan(drawPlan(p.map(x=>x.entry_id)),new Map(p.map(x=>[x.entry_id,x.entry_id])));
    const projected=projectNormalizedDoubleEliminationBracket({
      event:{id:eid,competition_format:"double_elimination",is_team_event:false,status:"running"},runtimeId:rid,
      entries:p.map(x=>({id:x.entry_id,event_id:eid,entry_type:"individual",display_name:x.display_name,status:"active"})),
      entryParticipants:p.map(x=>({id:x.entry_participant_id,event_id:eid,entry_id:x.entry_id,registration_id:x.registration_id,player_id:x.player_id,member_order:1})),
      entrySlots:slots.map(s=>({...s,event_id:eid,bracket_runtime_id:rid,stage_kind:"elimination",stage_no:1,pool_no:0})),matches:[],
    });
    const matches=buildEventBracketMatchSnapshot(projected);
    const draw=rows=>scalar("select create_individual_bracket_draw($1,$2,'double_elimination',$3,$4,null,null,'{}',$5)",[rid,eid,p,slots,rows]);
    await assert.rejects(()=>draw([{...matches[0],entry_a_id:randomUUID()}]),/참가자 또는 구조/);
    assert.equal(await scalar("select count(*)::int from event_registrations where event_id=$1",[eid]),0);
    await draw(matches);
    const f=await facts(eid);
    assert.equal(f.matches.length,matches.length);
    assert.ok(f.bracket.double);
  });
}

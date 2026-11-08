import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { projectNormalizedDoubleEliminationBracket, projectNormalizedSingleEliminationBracket } from "../src/services/bracketProjection.js";
import { buildEventBracketMatchSnapshot } from "../src/services/bracketMatchSnapshot.js";
export async function verifyBracketFormats({pg,q,scalar,as,check,season}) {
  await as("postgres");
  await pg.exec(readFileSync("docs/db/normalized_bracket_winner_rpc.sql","utf8"));
  await pg.exec(readFileSync("docs/db/match_outcome.sql","utf8"));
  await pg.exec(readFileSync("docs/db/bracket_format_at_creation.sql","utf8"));
  await as("authenticated");
  async function people(event,count) {
    const rows=[];
    for(let i=0;i<count;i++){
      const name="방식-"+randomUUID().slice(0,8);
      const pid=await scalar("insert into players(display_name) values($1) returning id",[name]);
      const rid=await scalar("insert into event_registrations(event_id,player_id,registration_name,registration_source) values($1,$2,$3,'manual') returning id",[event,pid,name]);
      rows.push({id:randomUUID(),name,playerId:pid,registrationId:rid});
    }return rows;
  }
  async function runtime(event,players,topology) {
    let attempt,participants;
    if(topology==="single_elimination"){
      participants=players.map(p=>({participant_key:p.id,display_name:p.name,player_id:p.playerId,registration_id:p.registrationId,entry_id:randomUUID(),entry_participant_id:randomUUID()}));
      attempt={runtimeId:randomUUID(),slots:participants.map((p,i)=>({slot_no:i+1,entry_id:p.entry_id}))};
    }else{
      const confirmed=[];
      for(const p of players){
        const eid=await scalar("insert into entries(event_id,entry_type,display_name) values($1,'individual',$2) returning id",[event,p.name]);
        const ep=await scalar("insert into entry_participants(event_id,entry_id,player_id,registration_id) values($1,$2,$3,$4) returning id",[event,eid,p.playerId,p.registrationId]);
        confirmed.push({...p,entryId:eid,entryParticipantId:ep});
      }
      attempt={runtimeId:randomUUID(),slots:confirmed.map((p,i)=>({slot_no:i+1,entry_id:p.entryId}))};
      participants=confirmed.map(p=>({participant_key:p.id,display_name:p.name,entry_type:"individual",player_id:p.playerId,registration_id:p.registrationId,entry_id:p.entryId,entry_participant_id:p.entryParticipantId,member_order:1}));
    }
    const args=[attempt.runtimeId,event,topology,participants,attempt.slots];
    await q("select * from create_selected_bracket_runtime($1,$2,$3,$4,$5)",args);
    return {id:attempt.runtimeId,args};
  }
  const event=()=>scalar("insert into events(season_id,name,event_type,division,status,date_precision,regulation_id,cup_rule_id) values($1,'생성 시 방식','pokecup','light','open','unknown','m-c','none') returning id",[season]);
  await check("topology is committed atomically at draw creation, retries are stable, and existing runtimes cannot switch",async()=>{
    const id=await event();
    await assert.rejects(()=>q("select * from create_selected_bracket_runtime($1,$2,'double_elimination','[]','[]')",[randomUUID(),id]));
    assert.equal(await scalar("select competition_format from events where id=$1",[id]),null);
    const rt=await runtime(id,await people(id,4),"single_elimination");
    assert.equal(await scalar("select competition_format from events where id=$1",[id]),"single_elimination");
    await q("select * from create_selected_bracket_runtime($1,$2,$3,$4,$5)",rt.args);
    await assert.rejects(()=>q("select * from create_selected_bracket_runtime($1,$2,'double_elimination',$3,$4)",[rt.id,id,rt.args[3],rt.args[4]]),/이미/);
    await as("anon");
    await assert.rejects(()=>q("select * from create_selected_bracket_runtime($1,$2,'single_elimination','[]','[]')",[randomUUID(),id]),/permission/);
    await as("authenticated");
  });
  await check("a notice may leave topology unset and later edits preserve independent Master/Rookie choices",async()=>{
    const settings={subtitle:"생성 단계 선택",battle_format:"singles",regulation_id:"m-c",cup_rule_id:"none"};
    const pair=(await q("select * from save_league_intake('format-notice',$1,null,$2)",[season,settings]))[0];
    assert.equal(await scalar("select competition_format from events where id=$1",[pair.master_event_id]),null);
    await q("update events set competition_format='double_elimination' where id=$1",[pair.master_event_id]);
    await q("update events set competition_format='single_elimination' where id=$1",[pair.rookie_event_id]);
    await q("select * from save_league_intake('format-notice',$1,null,$2)",[season,settings]);
    assert.equal(await scalar("select competition_format from events where id=$1",[pair.master_event_id]),"double_elimination");
    assert.equal(await scalar("select competition_format from events where id=$1",[pair.rookie_event_id]),"single_elimination");
  });
  for(const qt of ["single_elimination","double_elimination"])for(const ft of ["single_elimination","double_elimination"]){
    await check(`Champions ${qt} qualifier / ${ft} final preserves survivor advancement`,async()=>{
      const qualifier=randomUUID(),final=randomUUID();
      await q("select * from save_championship_application_event_pair($1,$2,$3,$4,'생성 단계 챔피언스',999,'singles',999,3,null,'m-c','none','{}','{}','{}',null,null,null,null)",[qualifier,final,season,randomUUID()]);
      assert.equal(await scalar("select competition_format from events where id=$1",[qualifier]),null);
      await q("select * from set_championship_qualifier_direct_selections($1,'{}')",[qualifier]);
      const entrants=await people(qualifier,4),rt=await runtime(qualifier,entrants,qt);
      const threshold=qt==="single_elimination"?1:2;
      for(let turn=0;turn<30;turn++){
        const alive=await scalar("with losses as(select case when winner_entry_id=entry_a_id then entry_b_id else entry_a_id end id,count(*) n from matches where event_id=$1 and winner_entry_id is not null group by 1) select count(*)::int from entries e left join losses l on l.id=e.id where e.event_id=$1 and coalesce(l.n,0)<$2",[qualifier,threshold]);
        if(alive===3)break;
        const facts={event:(await q("select * from events where id=$1",[qualifier]))[0],runtimeId:rt.id,entries:await q("select * from entries where event_id=$1",[qualifier]),entryParticipants:await q("select * from entry_participants where event_id=$1",[qualifier]),entrySlots:await q("select * from bracket_entry_slots where event_id=$1",[qualifier]),matches:await q("select * from matches where event_id=$1",[qualifier])};
        const bracket=(qt==="single_elimination"?projectNormalizedSingleEliminationBracket:projectNormalizedDoubleEliminationBracket)(facts);
        const m=buildEventBracketMatchSnapshot(bracket).find(m=>!m.winner_entry_id);
        assert.ok(m,"a played match remains before the survivor target");
        if(qt==="single_elimination"){
          await q("select * from set_normalized_single_bracket_winner($1,$2,$3,$4)",[rt.id,qualifier,m.source_node_key,m.entry_a_id]);
        }else{
          await q("insert into matches(event_id,source,source_node_key,match_kind,round_number,stage_label,sequence_no,entry_a_id,entry_b_id,winner_entry_id,resolution) values($1,'normalized_bracket_runtime',$2,'bracket',$3,$4,$5,$6,$7,$6,'played') on conflict(event_id,source,source_node_key) where source_node_key is not null do update set winner_entry_id=excluded.winner_entry_id,resolution='played'",[qualifier,m.source_node_key,m.round_number,m.stage_label,m.sequence_no,m.entry_a_id,m.entry_b_id]);
        }
      }
      await q("select * from finalize_championship_qualifier($1)",[qualifier]);
      const regs=await q("select * from event_registrations where event_id=$1",[final]);
      assert.equal(regs.length,3);assert.ok(regs.every(r=>r.final_submission_id===null));
      const finalPeople=regs.map(r=>({id:randomUUID(),name:r.registration_name,registrationId:r.id,playerId:r.player_id}));
      await runtime(final,finalPeople,ft);
      assert.equal(await scalar("select competition_format from events where id=$1",[final]),ft);
    });
  }
}

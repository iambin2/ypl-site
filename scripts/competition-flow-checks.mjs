// Extra disposable DB checks. Called by verify-league-intake-db.mjs only.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { buildEventRankingAwardSnapshot } from "../src/services/bracketRankingAwardSnapshot.js";
import { buildEventBracketMatchSnapshot } from "../src/services/bracketMatchSnapshot.js";
import { projectNormalizedDoubleEliminationBracket } from "../src/services/bracketProjection.js";

export async function verifyCompetitionFlows({pg,q,scalar,as,check,season}) {
  const sql=file=>readFileSync(`docs/db/${file}`,"utf8");
  await as("postgres");
  await pg.exec(sql("normalized_bracket_runtime_elimination_rpc.sql"));
  await pg.exec(sql("champions_qualifier_survivor_rpc.sql"));
  await pg.exec(sql("champions_qualifier_direct_setup_rpc.sql"));
  await pg.exec(sql("champions_final_record_apply_rpc.sql"));
  // This table is added after the original fixture's policy loop.
  await pg.exec(`grant select,insert,delete on championship_advancements,championship_qualifier_direct_selections to authenticated;
    grant select,insert,update,delete on hall_of_fame_entries to authenticated;
    alter table championship_qualifier_direct_selections enable row level security;
    create policy admin_write on championship_qualifier_direct_selections for all to authenticated
      using((select is_ypl_admin())) with check((select is_ypl_admin()));`);
  const gates=sql("visitor_gates.sql");
  await pg.exec(gates.slice(gates.indexOf("-- 3."),gates.indexOf("-- 4.")));
  await as("authenticated");

  async function event(division,name,team=false) {
    return scalar(`insert into events(season_id,name,event_type,division,is_team_event,status,date_precision,
      battle_format,competition_format,regulation_id,cup_rule_id,competition_settings)
      values($1,$2,'pokecup',$3,$4,'open','unknown','singles','single_elimination','reg','none',$5) returning id`,
      [season,name,division,team,{rankingEnabled:division==="master",officialEvent:division!=="other"}]);
  }
  async function identities(id,count,{team=false,registrations=null,canonical=true}={}) {
    const rows=[];
    for(let i=0;i<count;i++) {
      const entry=randomUUID(),displayName=`${id.slice(0,8)}-${i}`;
      if(canonical)await q("insert into entries(id,event_id,entry_type,display_name) values($1,$2,$3,$4)",[entry,id,team?"team":"individual",displayName]);
      for(let member=1;member<=(team?2:1);member++) {
        const existing=registrations?.[i];
        const name=team?`${displayName}-${member}`:existing?.registration_name||displayName;
        const player=existing?.player_id||await scalar("insert into players(display_name) values($1) returning id",[name]);
        const registration=existing?.id||await scalar("insert into event_registrations(event_id,player_id,registration_name,registration_source) values($1,$2,$3,'application') returning id",[id,player,name]);
        const ep=canonical?await scalar("insert into entry_participants(event_id,entry_id,registration_id,player_id,member_order,role) values($1,$2,$3,$4,$5,$6) returning id",[id,entry,registration,player,member,team&&member===1?"captain":null]):randomUUID();
        rows.push({participant_key:`${entry}-${member}`,display_name:team?displayName:name,player_id:player,
          registration_id:registration,entry_id:entry,entry_participant_id:ep,entry_type:team?"team":"individual",member_order:member,role:team&&member===1?"captain":null});
      }
    }
    return rows;
  }
  async function runtime(id,rows,topology="single_elimination",team=false) {
    const entries=[...new Set(rows.map(r=>r.entry_id))];
    let size=2;while(size<entries.length)size*=2;
    const byes=size-entries.length;
    const slots=entries.map((entry,i)=>({entry_id:entry,slot_no:i<byes?i*2+1:i+byes+1}));
    const rid=randomUUID();
    if(topology==="single_elimination"&&!team)
      await q("select * from create_normalized_single_bracket_runtime($1,$2,$3,$4)",[rid,id,rows,slots]);
    else await q("select * from create_normalized_bracket_runtime($1,$2,$3,$4,$5)",[rid,id,topology,rows,slots]);
    return rid;
  }
  async function party(id,p) {
    const name=await scalar("select registration_name from event_registrations where id=$1",[p.registration_id||p.id]);
    await as("anon");
    const result=(await q("select * from submit_registration_team_snapshot($1,$2,$3,$4,$5,'2468')",[
      id,p.registration_id||p.id,name,{schema_version:1,regulation_id:"reg",cup_rule_id:"none"},[{slot:1,pokemon_id:"pikachu",pokemon_name_snapshot:"피카츄"}]]))[0];
    await as("authenticated");
    assert.ok(result.submission_id);return result.submission_id;
  }
  const empty={inserts:[],updates:[],deleteIds:[]};
  async function records(id,rows,ordinal=null) {
    const facts=(await q("select * from events where id=$1",[id]))[0];
    const entries=[...new Set(rows.map(r=>r.entry_id))];
    if(!facts.is_team_event)await q("update matches set winner_entry_id=entry_a_id,resolution='played',played_at=now() where event_id=$1 and match_kind='bracket' and winner_entry_id is null",[id]);
    const results=entries.slice(0,2).map((entry,i)=>({id:randomUUID(),entry_id:entry,placement_code:i?"runner_up":"champion",placement_label:i?"준우승":"우승",source:"normalized_bracket_runtime"}));
    const awards=buildEventRankingAwardSnapshot(facts,results,rows).rows;
    await q("select apply_event_record($1,$2,$3,true,$4,$5)",[id,{...empty,inserts:results},{...empty,inserts:awards},ordinal,ordinal?randomUUID():null]);
    return {awards,results};
  }
  await check("Light 8 and general seminars create independent runtimes, freeze parties and revert without regular points",async()=>{
    const before=await scalar("select max(round_number) from competition_editions where family='regular'");
    for(const division of ["light","other"]) {
      const id=await event(division,division==="light"?"999회 파이컵 라이트 검증":"배틀부 세미나 검증");
      const facts=(await q("select * from events where id=$1",[id]))[0];
      assert.equal(facts.round_number,division==="light"?8:null);
      if(division==="other")assert.equal(facts.competition_edition_id,null);
      const people=await identities(id,2,{canonical:false});const submitted=await party(id,people[0]);
      await runtime(id,people);const result=await records(id,people);
      assert.equal(result.awards.length,0);
      assert.equal(await scalar("select final_submission_id from event_registrations where id=$1",[people[0].registration_id]),submitted);
      assert.equal(await scalar("select has_individual_master_eligibility($1)",[people[0].player_id]),division==="light");
      await q("select revert_event_record($1)",[id]);
      assert.equal(await scalar("select count(*)::int from registration_submissions where registration_id=$1",[people[0].registration_id]),1);
      assert.equal(await scalar("select final_submission_id from event_registrations where id=$1",[people[0].registration_id]),null);
    }
    assert.equal(await scalar("select max(round_number) from competition_editions where family='regular'"),before);
  });
  await check("Team Master runtime awards 30/20 to members, preserves parties and never creates individual Master eligibility",async()=>{
    const before=await scalar("select max(round_number) from competition_editions where family='regular'");
    const id=await event("master","999회 파이컵 팀전 검증",true);
    assert.equal(await scalar("select round_number from events where id=$1",[id]),before+1);
    const people=await identities(id,2,{team:true});
    const submissions=[];for(const p of people)submissions.push(await party(id,p));
    await runtime(id,people,"single_elimination",true);
    const {awards}=await records(id,people);
    assert.deepEqual(awards.map(a=>a.points_delta),[30,30,20,20]);
    assert.ok(awards.every(a=>a.win_delta===0));
    for(const p of people)assert.equal(await scalar("select has_individual_master_eligibility($1)",[p.player_id]),false);
    assert.equal(await scalar("select count(*)::int from event_registrations where event_id=$1 and final_submission_id is not null",[id]),4);
    await q("select revert_event_record($1)",[id]);
    assert.equal(await scalar("select count(*)::int from ranking_awards where event_id=$1",[id]),0);
    assert.equal(await scalar("select count(*)::int from registration_submissions s join event_registrations r on r.id=s.registration_id where r.event_id=$1",[id]),4);
  });

  async function qualifierPlay(id,rid) {
    for(let turn=0;turn<30;turn++) {
      const alive=await scalar(`with losses as(select case when winner_entry_id=entry_a_id then entry_b_id else entry_a_id end id,count(*) n
        from matches where event_id=$1 and match_kind='bracket' and winner_entry_id is not null group by 1)
        select count(*)::int from entries e left join losses l on l.id=e.id where e.event_id=$1 and coalesce(l.n,0)<2`,[id]);
      if(alive===2)return;
      const bracket=projectNormalizedDoubleEliminationBracket({event:(await q("select * from events where id=$1",[id]))[0],runtimeId:rid,
        entries:await q("select * from entries where event_id=$1",[id]),entryParticipants:await q("select * from entry_participants where event_id=$1",[id]),
        entrySlots:await q("select * from bracket_entry_slots where event_id=$1",[id]),matches:await q("select * from matches where event_id=$1",[id])});
      const match=buildEventBracketMatchSnapshot(bracket).find(m=>!m.winner_entry_id);
      assert.ok(match,"a formed qualifier match remains");
      await q(`insert into matches(event_id,source,source_node_key,match_kind,round_number,stage_label,sequence_no,entry_a_id,entry_b_id,winner_entry_id,resolution,played_at)
        values($1,'normalized_bracket_runtime',$2,'bracket',$3,$4,$5,$6,$7,$6,'played',now())`,
        [id,match.source_node_key,match.round_number,match.stage_label,match.sequence_no,match.entry_a_id,match.entry_b_id]);
    }
    throw new Error("Qualifier did not reach the survivor target");
  }
  await check("Champions Singles and Doubles share 7 through qualifier survivors, separate Final parties, HOF and revert",async()=>{
    let edition;
    for(const format of ["singles","doubles"]) {
      const qualifier=randomUUID(),final=randomUUID();
      await q("select * from save_championship_application_event_pair($1,$2,$3,$4,$5,999,$6,999,3,null,'reg','none','{}',$7,'{}',null,null,null,null)",
        [qualifier,final,season,randomUUID(),`999회 챔피언스 시리즈 ${format}`,format,edition?{competitionEditionId:edition}:{}]);
      const facts=(await q("select * from events where id=$1",[final]))[0];edition=facts.competition_edition_id;
      assert.equal(facts.round_number,7);
      const directPlayer=await scalar("insert into players(display_name) values($1) returning id",[`직행-${format}`]);
      const direct=await scalar("insert into event_registrations(event_id,player_id,registration_name,registration_source) values($1,$2,$3,'application') returning id",[qualifier,directPlayer,`직행-${format}`]);
      await q("select * from set_championship_qualifier_direct_selections($1,$2)",[qualifier,[direct]]);
      const entrants=await identities(qualifier,4);
      const oldParty=await party(qualifier,entrants[0]);
      const rid=await runtime(qualifier,entrants,"double_elimination");
      await assert.rejects(()=>q("select * from finalize_championship_qualifier($1)",[qualifier]),/survivor|목표/);
      await qualifierPlay(qualifier,rid);
      await q("select * from finalize_championship_qualifier($1)",[qualifier]);
      const regs=await q("select * from event_registrations where event_id=$1 order by id",[final]);
      assert.equal(regs.length,3);assert.ok(regs.every(r=>r.final_submission_id===null));
      assert.equal(await scalar("select count(*)::int from championship_advancements a join event_registrations r on r.id=a.final_registration_id where r.event_id=$1 and a.advancement_type='ranking'",[final]),1);
      assert.equal(await scalar("select count(*)::int from registration_submissions s join event_registrations r on r.id=s.registration_id where r.event_id=$1",[final]),0);
      assert.equal(await scalar("select count(*)::int from results where event_id=$1",[qualifier]),0);
      const finalRows=await identities(final,2,{registrations:regs,canonical:false});
      const finalParty=await party(final,finalRows[0]);assert.notEqual(finalParty,oldParty);
      await assert.rejects(()=>q("select * from reopen_championship_qualifier($1)",[qualifier]),/downstream/);
      await runtime(final,finalRows);
      assert.equal((await records(final,finalRows,7)).awards.length,0);
      assert.equal(await scalar("select generation_number from hall_of_fame_entries where event_id=$1",[final]),7);
    }
    assert.equal(await scalar("select count(*)::int from hall_of_fame_entries where generation_number=7"),2);
    const final=await scalar("select event_id from hall_of_fame_entries where generation_number=7 limit 1");
    await q("select revert_event_record($1)",[final]);
    assert.equal(await scalar("select count(*)::int from hall_of_fame_entries where generation_number=7"),1);
  });
  await check("Private bracket PIN, stale saves, separate rows and RLS cannot touch official facts",async()=>{
    const before=await scalar("select md5(string_agg(to_jsonb(e)::text,',' order by id)) from events e");
    const write=(action,id,payload={},pin="2468",board="private_bracket")=>scalar("select public.community_write($1,$2,$3,null,$4,false,$5)",[action,board,id,payload,pin]);
    await as("anon");
    await assert.rejects(()=>write("create","nopin",{},""),/비밀번호/);
    await write("create","privatea",{name:"A",graph:{first:null,second:null}});
    await write("create","privateb",{name:"B"});
    await assert.rejects(()=>q("update public.community_items set payload='{}' where id='privatea'"),/permission denied/);
    assert.equal(await write("verify","privatea",{},"0000"),"wrong_pin");
    const at=await scalar("select payload->>'updatedAt' from public.community_items where id='privatea'");
    assert.equal(await write("update","privatea",{graph:{first:"A",second:null},_expectedUpdatedAt:at}),"ok");
    assert.equal(await write("update","privatea",{graph:{first:null,second:"B"},_expectedUpdatedAt:at}),"stale");
    assert.equal(await scalar("select payload#>>'{graph,first}' from public.community_items where id='privatea'"),"A");
    assert.equal(await scalar("select payload->>'name' from public.community_items where id='privateb'"),"B");
    assert.equal(await scalar("select payload ? '_expectedUpdatedAt' from public.community_items where id='privatea'"),false);
    assert.equal(await write("update","privatea",{name:"stale old client"}),"stale");
    await write("create","normalboard",{title:"board"},"2468","free");
    assert.equal(await write("update","normalboard",{title:"edited"},"2468","free"),"ok");
    await write("delete","privateb");
    await as("authenticated");
    assert.equal(await scalar("select md5(string_agg(to_jsonb(e)::text,',' order by id)) from events e"),before);
  });
}

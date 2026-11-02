// Disposable PostgreSQL verification. Never connects to Supabase.
// node scripts/verify-league-intake-db.mjs <path-to-pglite-dist/index.js>
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { buildEventRankingAwardSnapshot } from "../src/services/bracketRankingAwardSnapshot.js";

const { PGlite } = await import(process.argv[2] ? pathToFileURL(resolve(process.argv[2])).href : "@electric-sql/pglite");
const pg = new PGlite();
const sql = file => readFileSync(`docs/db/${file}`, "utf8");
const q = async (query, params = []) => (await pg.query(query, params)).rows;
const scalar = async (query, params) => Object.values((await q(query, params))[0])[0];
const as = async role => {
  await pg.exec(`set role ${role}`);
  await q("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(role === "authenticated" ? {app_metadata:{ypl_admin:true}} : {})]);
};
const rejects = async (fn, pattern) => assert.rejects(fn, pattern);
let checks = 0;
async function check(name, run) { await run(); checks++; console.log(`PASS ${name}`); }

try {
  await pg.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema ypl_schema_validation;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    grant usage on schema auth,ypl_schema_validation to anon,authenticated;
    set search_path=ypl_schema_validation,public;`);
  await pg.exec(sql("normalized_schema_v1.sql").replace("create extension if not exists pgcrypto;", ""));
  await pg.exec(sql("normalized_bracket_runtime.sql"));
  const lockdown = sql("access_lockdown.sql");
  await pg.exec(lockdown.slice(lockdown.indexOf("create or replace function"), lockdown.indexOf("-- A2.")));
  await pg.exec(`create table public.site_data(key text primary key,value jsonb not null);
    insert into public.site_data values('ypl_data_v4','{"announcements":[{"id":"delete-me"},{"id":"unrelated"}],"sentinel":"preserve"}');
    alter table public.site_data enable row level security;
    grant select,update on public.site_data to authenticated;
    create policy admin_write on public.site_data for all to authenticated using((select ypl_schema_validation.is_ypl_admin())) with check((select ypl_schema_validation.is_ypl_admin()));`);
  await pg.exec(`grant select on all tables in schema ypl_schema_validation to anon,authenticated;
    grant insert,update on ypl_schema_validation.events to authenticated;
    grant insert,update,delete on ypl_schema_validation.event_registrations to authenticated;
    grant insert,delete on ypl_schema_validation.players,ypl_schema_validation.entries,ypl_schema_validation.entry_participants to authenticated;
    grant insert,update,delete on ypl_schema_validation.results,ypl_schema_validation.matches,ypl_schema_validation.ranking_awards to authenticated;
    do $$ declare t text; begin
      for t in select tablename from pg_tables where schemaname='ypl_schema_validation' loop
        execute format('alter table ypl_schema_validation.%I enable row level security',t);
        execute format('create policy public_read on ypl_schema_validation.%I for select to anon,authenticated using(true)',t);
        execute format('create policy admin_write on ypl_schema_validation.%I for all to authenticated using((select ypl_schema_validation.is_ypl_admin())) with check((select ypl_schema_validation.is_ypl_admin()))',t);
      end loop; end $$;`);
  await pg.exec(lockdown.match(/grant insert \(event_id[\s\S]*?create policy visitor_apply[\s\S]*?\n  \);/)[0]);
  await pg.exec(sql("backend_hardening.sql"));
  const season = await scalar("insert into seasons(code,name,series,status) values('test','Test','ypl','current') returning id");
  const historic = {};
  const people = {};
  for (const [name, division, type, team] of [
    ["master", "master", "pokecup", false], ["rookie", "rookie", "pokecup", false],
    ["light", null, "light", false], ["team", "master", "pokecup", true], ["teamLight", "light", "pokecup", true],
  ]) {
    historic[name] = await scalar("insert into events(season_id,name,event_type,division,is_team_event,status,date_precision) values($1,$2,$3,$4,$5,'completed','unknown') returning id", [season,name,type,division,team]);
  }
  async function participant(name, event, champion = false) {
    const pid = await scalar("insert into players(display_name) values($1) returning id", [name]); people[name] = pid;
    const team = [historic.team, historic.teamLight].includes(event);
    const reg = await scalar("insert into event_registrations(event_id,player_id,registration_name,registration_source) values($1,$2,$3,'migration') returning id", [event,pid,name]);
    const entry = await scalar("insert into entries(event_id,entry_type,display_name) values($1,$2,$3) returning id", [event,team ? "team" : "individual",name]);
    await q("insert into entry_participants(event_id,entry_id,registration_id,player_id) values($1,$2,$3,$4)", [event,entry,reg,pid]);
    if (champion) await q("insert into results(event_id,entry_id,placement_code,placement_label,source) values($1,$2,'champion','우승','test')", [event,entry]);
    return pid;
  }
  await participant("Master",historic.master);
  await participant("RookieChampion",historic.rookie,true);
  await participant("LightChampion",historic.light,true);
  await participant("TeamOnly",historic.team,true);
  await participant("TeamLightChampion",historic.teamLight,true);
  await participant("LightParticipant",historic.light);
  await q("update events set round_number=$2 where id=$1",[historic.master,36]);
  await q("update events set round_number=$2 where id=$1",[historic.rookie,36]);
  await q("update events set round_number=$2 where id=$1",[historic.team,37]);
  await q("update events set round_number=$2 where id=$1",[historic.light,7]);
  for(let n=1;n<=6;n++)await q("insert into events(season_id,name,round_number,event_type,status,date_precision) values($1,$2,$3,'champions','completed','unknown')",[season,`${n}회 챔피언스 시리즈`,n]);
  const repairEvent=await scalar("insert into events(season_id,name,round_number,event_type,division,status,date_precision,battle_format,competition_format,regulation_id,cup_rule_id,registration_settings) values($1,'37회 파이컵 마스터 리그 NPC 배틀',37,'pokecup','master','open','unknown','singles','single_elimination','reg','none','{\"announcementId\":\"repair\"}') returning id",[season]);
  const repairRegs=[];
  for(const name of ["Master","TeamOnly"])repairRegs.push(await scalar("insert into event_registrations(event_id,registration_name,registration_source) values($1,$2,'application') returning id",[repairEvent,name]));
  await pg.exec(sql("competition_editions.sql"));
  await pg.exec(sql("league_intake.sql"));
  await pg.exec(sql("champions_qualifier_direct_setup_rpc.sql").split("create or replace function")[0]);
  await pg.exec(sql("champions_application_event_pair_rpc.sql"));
  await pg.exec(sql("normalized_bracket_runtime_rpc.sql"));
  await pg.exec(sql("normalized_bracket_runtime_grants.sql"));
  await pg.exec(sql("team_submission_rpc.sql"));
  // Use the current PIN gate and close the legacy visitor submission API.
  // The unrelated community migration is intentionally outside this fixture.
  const visitorGates = sql("visitor_gates.sql");
  await pg.exec(visitorGates.slice(0, visitorGates.indexOf("-- 3.")));
  await pg.exec(sql("visitor_gates_close.sql").match(/revoke all on function ypl_schema_validation\.submit_registration_team_snapshot[^;]+;/)[0]);
  await pg.exec(sql("record_apply_rpc.sql"));
  await check("Master participation and Rookie/Light individual titles qualify; teams and participation-only Light do not", async () => {
    for (const [name,pid] of Object.entries(people)) assert.equal(await scalar("select has_individual_master_eligibility($1)",[pid]), ["Master","RookieChampion","LightChampion"].includes(name), name);
  });
  const settings = { subtitle:"통합 테스트",battle_format:"singles",competition_format:"single_elimination",regulation_id:"reg",cup_rule_id:"none",cup_rule_settings:{},record_rule_label:"",title_award:null };
  await as("authenticated");
  await pg.exec(`select set_config('request.jwt.claims','{"app_metadata":{"ypl_admin":true}}',false)`);
  const save = async (id = "notice") => (await q("select * from save_league_intake($1,$2,null,$3)",[id,season,settings]))[0];
  await check("The current notice repairs to 38 and splits existing registrations without changing their IDs",async()=>{
    await pg.exec("begin");
    await q("select correct_pristine_event_round($1,38)",[repairEvent]);
    const pair=(await q("select * from save_league_intake('repair',$1,$2,$3)",[season,repairEvent,settings]))[0];
    const rows=await q("select round_number,competition_edition_id from events where id in($1,$2)",[pair.master_event_id,pair.rookie_event_id]);
    assert.deepEqual(rows.map(r=>r.round_number),[38,38]);assert.equal(rows[0].competition_edition_id,rows[1].competition_edition_id);
    assert.deepEqual((await q("select id from event_registrations where event_id in($1,$2) order by id",[pair.master_event_id,pair.rookie_event_id])).map(r=>r.id),[...repairRegs].sort());
    assert.equal(await scalar("select event_id from event_registrations where id=$1",[repairRegs[0]]),pair.master_event_id);
    assert.equal(await scalar("select event_id from event_registrations where id=$1",[repairRegs[1]]),pair.rookie_event_id);
    await pg.exec("rollback");
  });
  await check("Three counters include team history, Champions formats share 7, and retry adds no edition",async()=>{
    await pg.exec("begin");
    const team=await scalar("insert into events(season_id,name,round_number,event_type,division,is_team_event,status,date_precision,registration_settings) values($1,'999회 파이컵 팀전',999,'pokecup','master',true,'open','unknown','{\"announcementId\":\"team38\"}') returning round_number",[season]);
    assert.equal(team,38);
    const regular=await save("after-team");
    assert.deepEqual((await q("select round_number from events where id in($1,$2)",[regular.master_event_id,regular.rookie_event_id])).map(r=>r.round_number),[39,39]);
    assert.equal(await scalar("insert into events(season_id,name,round_number,event_type,division,status,date_precision) values($1,'999회 파이컵 라이트',999,'pokecup','light','open','unknown') returning round_number",[season]),8);
    const championPair=async(format,edition=null)=>{
      const qualifier=randomUUID(),final=randomUUID();
      await q("select * from save_championship_application_event_pair($1,$2,$3,$4,$5,999,$6,999,4,null,'reg','none','{}',$7,'{}',null,null,null,null)",[qualifier,final,season,randomUUID(),`999회 챔피언스 시리즈 ${format}`,format,edition?{competitionEditionId:edition}:{}]);
      return q("select id,round_number,competition_edition_id,competition_settings from events where id in($1,$2)",[qualifier,final]);
    };
    const singles=await championPair("singles");
    assert.ok(singles.every(r=>r.round_number===7&&r.competition_settings.championship.generation===7),JSON.stringify(singles));
    const doubles=await championPair("doubles",singles[0].competition_edition_id);
    assert.ok(doubles.every(r=>r.round_number===7&&r.competition_edition_id===singles[0].competition_edition_id));
    assert.ok((await championPair("singles")).every(r=>r.round_number===8));
    await pg.exec("rollback");
  });
  const group = await save();
  await check("Pair creation is idempotent and assigns 38 to both leagues after team round 37", async () => {
    assert.equal((await save()).id,group.id);
    const rows=await q("select division,round_number,competition_settings from events where id in($1,$2)",[group.master_event_id,group.rookie_event_id]);
    assert.equal(rows.length,2);
    assert.ok(rows.every(r=>r.round_number===38));
    assert.equal(rows.find(row=>row.division==="rookie").competition_settings.rankingEnabled,false);
    assert.equal(rows.find(row=>row.division==="master").competition_settings.rankingEnabled,true);
  });
  await as("anon");
  async function apply(name,event=group.master_event_id) {
    return (await q("insert into event_registrations(event_id,registration_name,registration_source,registered_at,updated_at) values($1,$2,'application',now(),now()) returning id,event_id,player_id",[event,name]))[0];
  }
  const regs={};
  await check("Anon insert through either Event routes each application by canonical individual eligibility", async () => {
    for(const name of [...Object.keys(people),"NewApplicant"]) {
      regs[name]=await apply(name,group.rookie_event_id);
      const master=["Master","RookieChampion","LightChampion"].includes(name);
      assert.equal(regs[name].event_id,master?group.master_event_id:group.rookie_event_id,name);
    }
  });
  await check("Cross-league duplicate application is rejected", async () => rejects(()=>apply("Master"),/이미 이 공지/));
  await check("Anon cannot mutate Events, create pairs, or update/delete applications", async () => {
    await rejects(()=>save("forged"),/permission denied/);
    await rejects(()=>q("update events set division='rookie' where id=$1",[group.master_event_id]),/permission denied/);
    await rejects(()=>q("delete from event_registrations where id=$1",[regs.Master.id]),/permission denied/);
  });
  await as("authenticated");
  await check("Pair rules and cancellation are blocked after either league receives an application", async () => {
    const changed={...settings,regulation_id:"other"};
    await rejects(()=>q("select save_league_intake('notice',$1,null,$2)",[season,changed]),/규칙을 변경/);
    await rejects(()=>q("select cancel_league_intake($1)",[group.id]),/신청이나 제출/);
    assert.equal((await save()).id,group.id);
  });
  async function legacyEvent(notice) {
    return scalar(`insert into events(season_id,name,round_number,event_type,division,is_team_event,status,date_precision,
      battle_format,competition_format,regulation_id,cup_rule_id,cup_rule_settings,competition_settings,registration_settings)
      values($1,'37회 파이컵 마스터 리그 통합 테스트',37,'pokecup','master',false,'open','unknown',
      'singles','single_elimination','reg','none','{}',$2,$3) returning id`,
      [season,{titleAward:null,recordRuleLabel:"",rankingEnabled:true},{announcementId:notice}]);
  }
  await check("An existing three-applicant notice converts without changing application IDs, answers, season or round",async()=>{
    const old=await legacyEvent("legacy");
    const oldIdentity=(await q("select season_id,round_number from events where id=$1",[old]))[0];
    const registrations=[];
    for(const name of ["Master","TeamOnly","FreshLegacyApplicant"]) registrations.push({name,...await apply(name,old)});
    await q("update event_registrations set registration_data=$1 where id=$2",[{answers:{original:"preserved"}},registrations[1].id]);
    const converted=(await q("select * from save_league_intake('legacy',$1,$2,$3)",[season,old,settings]))[0];
    assert.equal(converted.master_event_id,old);
    assert.deepEqual((await q("select season_id,round_number from events where id=$1",[old]))[0],oldIdentity);
    for(const registration of registrations) {
      const row=(await q("select * from event_registrations where id=$1",[registration.id]))[0];
      assert.equal(row.event_id,registration.name==="Master"?old:converted.rookie_event_id);
      if(registration.name==="TeamOnly")assert.deepEqual(row.registration_data,{answers:{original:"preserved"}});
    }
  });
  await check("Conversion after an official submission fails without creating a Rookie Event or changing the application",async()=>{
    const old=await legacyEvent("submitted-legacy");
    const reg=await apply("SubmittedLegacyApplicant",old);
    await as("anon");
    await q("select * from submit_registration_team_snapshot($1,$2,'SubmittedLegacyApplicant',$3,$4,'1234')",[
      old,reg.id,{schema_version:1},[{slot:1,pokemon_id:"pikachu",pokemon_name_snapshot:"피카츄"}],
    ]);
    await as("authenticated");
    const count=await scalar("select count(*)::int from events");
    await rejects(()=>q("select * from save_league_intake('submitted-legacy',$1,$2,$3)",[season,old,settings]),/기존 제출/);
    assert.equal(await scalar("select count(*)::int from events"),count);
    assert.equal(await scalar("select event_id from event_registrations where id=$1",[reg.id]),old);
  });
  await check("Participant confirmation revalidates the league at the database boundary", async () => {
    const en=await scalar("insert into entries(event_id,entry_type,display_name) values($1,'individual','Master') returning id",[group.master_event_id]);
    await q("insert into entry_participants(event_id,entry_id,registration_id,player_id) values($1,$2,$3,$4)",[group.master_event_id,en,regs.Master.id,people.Master]);
    await rejects(()=>q("insert into entry_participants(event_id,entry_id,registration_id,player_id) values($1,$2,$3,$4)",[group.rookie_event_id,en,regs.Master.id,people.Master]),/리그 자격/);
  });
  await check("A pristine pair cancels both leagues together and can be retried without an orphan",async()=>{
    const pristine=await save("pristine");
    assert.equal(await scalar("select cancel_league_intake($1)",[pristine.id]),true);
    assert.equal(await scalar("select count(*)::int from events where id in($1,$2) and status='cancelled'",[pristine.master_event_id,pristine.rookie_event_id]),2);
    assert.equal((await save("pristine")).id,pristine.id);
  });
  await check("Notice deletion atomically rechecks both leagues and preserves unrelated shared data",async()=>{
    await rejects(()=>q("select delete_league_intake_notice($1,'notice')",[group.id]),/신청이나 제출/);
    assert.equal(await scalar("select status from events where id=$1",[group.rookie_event_id]),"open");
    const pristine=await save("delete-me");
    await rejects(()=>q("select delete_league_intake_notice($1,'unrelated')",[pristine.id]),/연결이 일치/);
    const previousRevision=await scalar("select revision from public.site_data where key='ypl_data_v4'");
    const updated=await scalar("select delete_league_intake_notice($1,'delete-me')",[pristine.id]);
    assert.deepEqual(updated.announcements,[{id:"unrelated"}]);
    assert.equal(updated.sentinel,"preserve");
    assert.equal(await scalar("select revision from public.site_data where key='ypl_data_v4'"),previousRevision+1);
    assert.equal(await scalar("select count(*)::int from events where id in($1,$2) and status='cancelled'",[pristine.master_event_id,pristine.rookie_event_id]),2);
  });
  await check("New teams must be Master and a grouped Event cannot change its league",async()=>{
    await rejects(()=>q("insert into events(season_id,name,event_type,division,is_team_event,status,date_precision) values($1,'team','pokecup','rookie',true,'open','unknown')",[season]),/새 팀전/);
    await rejects(()=>q("update events set division='rookie' where id=$1",[group.master_event_id]),/리그와 소유권|회차와 구분/);
    await q("update events set name='historical light team' where id=$1",[historic.teamLight]);
  });
  await check("Real runtime, official submissions and record apply/revert remain independent for both leagues",async()=>{
    const pair=await save("runtime");
    const payloads={};
    await as("anon");
    for(const [division,names] of [["master",["Master","LightChampion"]],["rookie",["TeamOnly","BrandNew"]]]) {
      const event=division==="master"?pair.master_event_id:pair.rookie_event_id;
      payloads[division]=[];
      for(const name of names) {
        const reg=await apply(name,event);
        people[name] ||= randomUUID();
        const submitArgs=[event,reg.id,name,{schema_version:1,regulation_id:"reg",cup_rule_id:"none"},[{slot:1,pokemon_id:"pikachu",pokemon_name_snapshot:"피카츄"}]];
        await rejects(()=>q("select * from submit_registration_team_snapshot($1,$2,$3,$4,$5)",submitArgs),/permission denied/);
        const submit=pin=>q("select * from submit_registration_team_snapshot($1,$2,$3,$4,$5,$6)",[...submitArgs,pin]);
        assert.equal((await submit(null))[0].denied,"pin_required");
        const submission=await submit("1234");
        assert.ok(submission[0].snapshot_id);
        assert.equal((await submit("9999"))[0].denied,"wrong_pin");
        assert.equal(await scalar("select count(*)::int from registration_submissions where registration_id=$1",[reg.id]),1);
        payloads[division].push({participant_key:name,display_name:name,player_id:people[name],registration_id:reg.id,entry_id:randomUUID(),entry_participant_id:randomUUID()});
      }
    }
    await as("authenticated");
    for(const division of ["master","rookie"]) {
      const event=division==="master"?pair.master_event_id:pair.rookie_event_id;
      const participants=payloads[division];
      const slots=participants.map((p,i)=>({slot_no:i+1,entry_id:p.entry_id}));
      await q("select * from create_normalized_single_bracket_runtime($1,$2,$3,$4)",[randomUUID(),event,participants,slots]);
      const result=[{id:randomUUID(),event_id:event,entry_id:participants[0].entry_id,placement_code:"champion",placement_label:"우승",source:"normalized_bracket_runtime"}];
      const eventFacts=(await q("select * from events where id=$1",[event]))[0];
      const snapshot=buildEventRankingAwardSnapshot(eventFacts,result,participants);
      assert.equal(snapshot.rows.length,division==="master"?1:0);
      if(division==="master")assert.equal(snapshot.rows[0].points_delta,60);
      const resultPlan={inserts:result,updates:[],deleteIds:[]};
      const awardPlan={inserts:snapshot.rows,updates:[],deleteIds:[]};
      // An invalid award forces rollback of the already inserted Result.
      await rejects(()=>q("select apply_event_record($1,$2,$3,true,null,null)",[event,resultPlan,{...awardPlan,inserts:[{player_id:randomUUID(),result_id:result[0].id,points_delta:60}]}]),/violates/);
      assert.equal(await scalar("select count(*)::int from results where event_id=$1",[event]),0);
      assert.equal(await scalar("select status from events where id=$1",[event]),eventFacts.status);
      const applied=await scalar("select apply_event_record($1,$2,$3,true,null,null)",[event,resultPlan,awardPlan]);
      assert.equal(applied.status,"completed");
      assert.equal(await scalar("select count(*)::int from ranking_awards where event_id=$1",[event]),division==="master"?1:0);
      if(division==="master")assert.equal(await scalar("select status from events where id=$1",[pair.rookie_event_id]),"open");
    }
    const masterPointers=await q("select id,final_submission_id from event_registrations where event_id=$1 order by id",[pair.master_event_id]);
    assert.ok(masterPointers.every(row=>row.final_submission_id));
    // The new Rookie champion now qualifies as Master. Releasing its frozen
    // party must still succeed without moving/deleting its original chain.
    assert.equal(await scalar("select has_individual_master_eligibility($1)",[people.TeamOnly]),true);
    const reverted=await scalar("select revert_event_record($1)",[pair.rookie_event_id]);
    assert.equal(reverted.status,"running");
    assert.equal(await scalar("select count(*)::int from results where event_id=$1",[pair.rookie_event_id]),0);
    assert.equal(await scalar("select status from events where id=$1",[pair.master_event_id]),"completed");
    assert.equal(await scalar("select count(*)::int from ranking_awards where event_id=$1",[pair.master_event_id]),1);
    assert.deepEqual(await q("select id,final_submission_id from event_registrations where event_id=$1 order by id",[pair.master_event_id]),masterPointers);
    assert.equal(await scalar("select count(*)::int from registration_submissions s join event_registrations r on r.id=s.registration_id where r.event_id=$1",[pair.rookie_event_id]),2);
    assert.equal(await scalar("select count(*)::int from event_registrations where event_id=$1 and final_submission_id is not null",[pair.rookie_event_id]),0);
  });
  await check("A non-admin authenticated token cannot create or cancel a pair",async()=>{
    await pg.exec(`select set_config('request.jwt.claims','{}',false)`);
    await rejects(()=>save("non-admin"),/관리자 권한/);
    await rejects(()=>q("select cancel_league_intake($1)",[group.id]),/관리자 권한/);
  });
  console.log(`${checks} PostgreSQL integration checks passed.`);
} finally { await pg.close(); }

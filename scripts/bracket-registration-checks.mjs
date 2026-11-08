import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
export async function verifyBracketRegistration({pg,q,scalar,as,check,season}) {
  await as("postgres");
  await pg.exec(readFileSync("docs/db/bracket_manual_registration.sql","utf8"));
  await as("authenticated");
  const pair=(await q("select * from save_league_intake($1,$2,null,$3)",["bracket-addition-test",season,
    {subtitle:"추가 참가 검증",battle_format:"singles",competition_format:"single_elimination",regulation_id:"m-c",cup_rule_id:"none"}]))[0];
  const add=(event,name)=>q("select * from add_bracket_manual_registration($1,$2)",[event,name]);
  const winner=(await add(pair.rookie_event_id,"추가참가우승자"))[0];
  await check("manual additions obey league eligibility, reuse identity, and reject non-admin callers",async()=>{
    assert.equal((await add(pair.rookie_event_id,"추가참가우승자"))[0].id,winner.id);
    await assert.rejects(()=>add(pair.master_event_id,"추가참가미자격"),/자격/);
    assert.equal(await scalar("select count(*)::int from players where display_name='추가참가미자격'"),0);
    await as("anon");
    await assert.rejects(()=>add(pair.master_event_id,"익명추가"),/permission/);
    await as("authenticated");
    await q("select set_config('request.jwt.claims','{}',false)");
    await assert.rejects(()=>add(pair.master_event_id,"권한없음"),/관리자/);
    await as("authenticated");
  });
  await check("completed Rookie champion gets a distinct Master registration while every Rookie fact stays unchanged",async()=>{
    const entry=await scalar("insert into entries(event_id,entry_type,display_name) values($1,'individual','추가참가우승자') returning id",[pair.rookie_event_id]);
    await q("insert into entry_participants(event_id,entry_id,registration_id,player_id) values($1,$2,$3,$4)",[pair.rookie_event_id,entry,winner.id,winner.player_id]);
    await q("insert into results(event_id,entry_id,placement_code,placement_label,source) values($1,$2,'champion','우승','test')",[pair.rookie_event_id,entry]);
    await q("update events set status='completed',record_applied_at=now() where id=$1",[pair.rookie_event_id]);
    const before=await q("select row_to_json(r) as row from event_registrations r where id=$1",[winner.id]);
    const master=(await add(pair.master_event_id,"추가참가우승자"))[0];
    assert.notEqual(master.id,winner.id);
    assert.equal(master.player_id,winner.player_id);
    assert.equal(master.event_id,pair.master_event_id);
    assert.equal(master.registration_source,"manual");
    assert.equal(master.final_submission_id,null);
    assert.deepEqual(await q("select row_to_json(r) as row from event_registrations r where id=$1",[winner.id]),before);
    assert.equal((await add(pair.master_event_id,"추가참가우승자"))[0].id,master.id);
    await assert.rejects(()=>q("insert into event_registrations(event_id,player_id,registration_name,registration_source) values($1,$2,'추가참가우승자','manual')",[pair.master_event_id,winner.player_id]),/이미/);
    assert.equal(await scalar("select count(*)::int from results where event_id=$1",[pair.rookie_event_id]),1);
  });
}

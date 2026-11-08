import test from "node:test";
import assert from "node:assert/strict";
import { deriveQualifierSurvivorState } from "../src/services/championsCore.js";
import { guardQualifierRows } from "../src/services/bracketWinnerPlan.js";
import { selectWritableSubmissionRegistration } from "../src/services/teamBuilderCore.js";

const promotedRegistrations=[
  {id:"rookie-registration",event_id:"rookie",registration_name:"강진영",registration_source:"application",final_submission_id:"frozen-rookie-party"},
  {id:"master-registration",event_id:"master",registration_name:"강진영",registration_source:"manual",final_submission_id:null},
];
test("a promoted champion submits to the open Master event while keeping the completed Rookie party",()=>{
  const before=structuredClone(promotedRegistrations);
  const registration=selectWritableSubmissionRegistration(promotedRegistrations,"강 진영",[
    {id:"rookie",status:"completed",record_applied_at:"2026-11-07"},
    {id:"master",status:"open",record_applied_at:null},
  ]);
  assert.equal(registration.id,"master-registration");
  assert.equal(registration.final_submission_id,null);
  assert.deepEqual(promotedRegistrations,before);
});
test("party lookup still rejects two writable registrations with the same name",()=>{
  assert.throws(()=>selectWritableSubmissionRegistration(promotedRegistrations,"강진영",[
    {id:"rookie",status:"open"},{id:"master",status:"running"},
  ]),{code:"YPL_AMBIGUOUS_REGISTRATION"});
});
test("party lookup never routes a submission into a completed event",()=>{
  assert.throws(()=>selectWritableSubmissionRegistration([promotedRegistrations[0]],"강진영",[
    {id:"rookie",status:"completed",record_applied_at:"2026-11-07"},
  ]),/현재 파티를 제출할 수 없는/);
});

test("Single qualifiers eliminate on one loss while Double qualifiers require two",()=>{
  const entries=["A","B","C","D"].map(id=>({id}));
  const matches=[{entry_a_id:"A",entry_b_id:"B",winner_entry_id:"A"}];
  const single=deriveQualifierSurvivorState({entries,matches,qualificationSlots:3,competitionFormat:"single_elimination"});
  assert.equal(single.readyToFinalize,true);
  assert.deepEqual(single.eliminatedEntryIds,["B"]);
  const double=deriveQualifierSurvivorState({entries,matches,qualificationSlots:3,competitionFormat:"double_elimination"});
  assert.equal(double.readyToFinalize,false);
  assert.deepEqual(double.eliminatedEntryIds,[]);
});
test("a Single qualifier cannot play past its survivor target and does not form new future matches",()=>{
  const event={event_type:"champions",championship_phase:"qualifier",competition_format:"single_elimination",qualification_slots:3};
  const participants=["A","B","C","D"].map(entryId=>({entryId}));
  const won={match_kind:"bracket",source_node_key:"single:r1:m1",entry_a_id:"A",entry_b_id:"B",winner_entry_id:"A"};
  const future={match_kind:"bracket",source_node_key:"single:r2:m1",entry_a_id:"A",entry_b_id:"C",winner_entry_id:null};
  assert.deepEqual(guardQualifierRows(event,participants,[won,future],[]),[won]);
  assert.throws(()=>guardQualifierRows(event,participants,[won,{...future,winner_entry_id:"A"}],[won]),/더 진행/);
});

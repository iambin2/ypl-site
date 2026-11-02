import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { announcementEventType, changeAnnouncementEventType, isLeagueIntakeDraft, leagueIntakeOptions, normalizedAnnouncementDivision } from "../src/services/leagueIntake.js";
import { getIndividualPlacementPointPolicy } from "../src/services/bracketRankingAwardSnapshot.js";
import { announcementDeletionBlockedMessage, buildAnnouncementDeletionPreflight } from "../src/services/announcementDeletionPolicy.js";
import { availableChampionshipEditions, competitionFamily } from "../src/services/competitionEditions.js";

test("new ordinary notices default to unified intake and new teams are Master", () => {
  assert.equal(normalizedAnnouncementDivision({}), "both");
  assert.equal(normalizedAnnouncementDivision({ eventDraft: { isTeamEvent: true, division: "light" } }), "master");
  assert.equal(normalizedAnnouncementDivision({ eventId: "historical", eventDraft: { isTeamEvent: true, division: "light" } }), "light");
  assert.equal(normalizedAnnouncementDivision({ eventId: "legacy", eventDraft: { division: "other" } }), "other");
  assert.equal(normalizedAnnouncementDivision({ eventDraft: { eventType: "champions" } }), null);
  assert.equal(isLeagueIntakeDraft({ division: "both", isTeamEvent: true }), false);
});

const master = { id: "master", division: "master", event_type: "pokecup", season_id: "season", status: "completed", record_applied_at: "now", registration_settings: { leagueIntakeId: "group", intakeName: "파이컵 테스트" } };

test("seminars keep their existing other classification and the general editor never reserves a regular round",()=>{
  const seminar={eventType:"pokecup",division:"other",name:"배틀부 세미나 미니대회 1조"};
  assert.equal(announcementEventType(seminar),"general");
  const draft=changeAnnouncementEventType({eventType:"champions",competitionEditionId:"edition",competitionSettings:{rankingEnabled:true,officialEvent:true,recordRuleLabel:"보존"}},"general");
  assert.equal(draft.eventType,"pokecup");assert.equal(draft.division,"other");
  assert.equal(competitionFamily(draft),null);assert.equal(isLeagueIntakeDraft(draft),false);
  assert.equal(draft.competitionEditionId,null);assert.equal(draft.competitionSettings.rankingEnabled,false);
  assert.equal(draft.competitionSettings.recordRuleLabel,"보존");
  const ordinary=changeAnnouncementEventType(draft,"pokecup");
  assert.equal(ordinary.division,"both");assert.equal(ordinary.competitionSettings.officialEvent,undefined);
});

test("an explicit other Event never inherits Master points even with stale or missing ranking settings",()=>{
  for(const settings of [{},{rankingEnabled:true},{rankingEnabled:false}])
    assert.equal(getIndividualPlacementPointPolicy({event_type:"pokecup",division:"other",is_team_event:false,competition_settings:settings}).enabled,false);
});
const rookie = { ...master, id: "rookie", division: "rookie", status: "open", record_applied_at: null };
test("the bracket picker groups ordinary leagues and preserves independent Champions phases", () => {
  const options = leagueIntakeOptions([rookie, master, { id: "qualifier" }, { id: "final" }]);
  assert.deepEqual(options.map(row => row.value), ["intake:group", "qualifier", "final"]);
  assert.equal(options[0].label, "파이컵 테스트");
});

test("either league blocks notice deletion and identifies the league with downstream facts", () => {
  const preflight=buildAnnouncementDeletionPreflight([
    {division:"master",counts:{registrations:0}},
    {division:"rookie",counts:{registrations:3}},
  ]);
  assert.equal(preflight.allowed,false);
  assert.equal(preflight.division,"rookie");
  assert.deepEqual(Object.keys(preflight.byPhase),["master","rookie"]);
  assert.match(announcementDeletionBlockedMessage(preflight),/루키 리그에/);
});

// Only the transport is replaced. Execute the production service functions,
// resolving real pure imports, without making any network/DB requests.
const servicePath = new URL("../src/services/normalizedCompetitionService.js", import.meta.url);
const source = readFileSync(servicePath, "utf8")
  .replace('import { supa as client } from "../storage.js";', 'const client={schema:()=>globalThis.__leagueIntakeTestDb};')
  .replaceAll("import.meta.env", '({VITE_YPL_DATA_SCHEMA:"ypl_schema_validation"})')
  .replace(/from "(\.[^"]+)"/g, (_, path) => `from "${pathToFileURL(resolve(dirname(fileURLToPath(servicePath)),path)).href}"`);
const service = await import(`data:text/javascript;base64,${Buffer.from(source + "\n//# sourceURL=league-intake-service-under-test.js").toString("base64")}`);

function database({ registrations = [], malformed = false } = {}) {
  const tables = {
    events: [master, malformed ? { ...rookie, season_id: "wrong" } : rookie],
    league_intakes: [{ id: "group", master_event_id: master.id, rookie_event_id: rookie.id }],
    event_registrations: registrations,
    registration_submissions: [{ id: "submission", registration_id: "registration", revision: 1, snapshot_id: "snapshot" }],
    players: [],
  };
  const writes = [];
  class Query {
    constructor(table) { this.table=table; this.predicates=[]; this.one=false; }
    select() { return this; }
    eq(key,value) { this.predicates.push(row=>row[key]===value); return this; }
    in(key,values) { this.predicates.push(row=>values.includes(row[key])); return this; }
    order() { return this; }
    limit() { return this; }
    maybeSingle() { this.one=true; return this; }
    single() { this.one=true; return this; }
    insert(row) { writes.push({ table:this.table,row }); this.inserted=row; return this; }
    then(onResult,onError) {
      const rows=this.inserted?[{id:"new",...this.inserted}]:(tables[this.table]||[]).filter(row=>this.predicates.every(predicate=>predicate(row)));
      return Promise.resolve({data:this.one?(rows[0]||null):rows,error:null}).then(onResult,onError);
    }
  }
  globalThis.__leagueIntakeTestDb={from:table=>new Query(table)};
  return { tables,writes };
}

test("common party entry resolves the Rookie Registration even after Master has completed", async () => {
  database({registrations:[{id:"registration",event_id:rookie.id,registration_name:"신청자",registration_source:"application"}]});
  const result=await service.findSubmissionRegistration(master.id,"신청자");
  assert.equal(result.event.id,rookie.id);
  assert.equal(result.registration.id,"registration");
  assert.equal(result.latestSubmission.id,"submission");
});

test("admin response list combines both leagues and includes the actual division", async () => {
  database({registrations:[
    {id:"m",event_id:master.id,registration_name:"마스터",registration_source:"application"},
    {id:"r",event_id:rookie.id,registration_name:"루키",registration_source:"application"},
  ]});
  const rows=await service.listEventApplications(master.id);
  assert.deepEqual(rows.map(row=>row.division),["master","rookie"]);
});

test("only three edition families exist, independent of team or participant league",()=>{
  for(const division of [null,"both","master","rookie"])assert.equal(competitionFamily({division,isTeamEvent:true}),"regular");
  assert.equal(competitionFamily({event_type:"light",is_team_event:true}),"light");
  assert.equal(competitionFamily({division:"light"}),"light");
  assert.equal(competitionFamily({event_type:"champions",division:"master"}),"champions");
  assert.equal(competitionFamily({division:"other"}),null);
});

test("Champions can add the other format to 7 but cannot reuse legacy editions or occupied formats",()=>{
  const editions=[{id:"six",family:"champions",round_number:6},{id:"seven",family:"champions",round_number:7}];
  const events=[{competition_edition_id:"seven",battle_format:"singles"}];
  assert.deepEqual(availableChampionshipEditions(editions,events,"doubles").map(e=>e.id),["seven"]);
  assert.deepEqual(availableChampionshipEditions(editions,events,"singles"),[]);
  assert.deepEqual(availableChampionshipEditions(editions,events,null),[]);
});

test("both ordinary leagues and teams preview the same counter; Light and Champions stay separate",async()=>{
  const {tables}=database();
  tables.competition_editions=[{id:"regular",family:"regular",round_number:37},{id:"light",family:"light",round_number:7},{id:"champions",family:"champions",round_number:6}];
  for(const options of [{division:"master"},{division:"rookie"},{division:"master",isTeamEvent:true}])assert.equal(await service.resolveAutomaticRoundNumber(options),38);
  assert.equal(await service.resolveAutomaticRoundNumber({division:"light"}),8);
  assert.equal(await service.resolveAutomaticRoundNumber({eventType:"champions"}),7);
});

test("adding a Champions format uses the selected edition rather than incrementing it",async()=>{
  const {tables}=database();tables.competition_editions=[{id:"seven",family:"champions",round_number:7}];
  assert.equal(await service.resolveAutomaticRoundNumber({eventType:"champions",competitionEditionId:"seven"}),7);
  assert.equal(await service.resolveAutomaticRoundNumber({eventType:"champions"}),8);
  await assert.rejects(()=>service.resolveAutomaticRoundNumber({division:"master",competitionEditionId:"seven"}),/회차를 찾을 수/);
});

test("duplicate on the other league is caught before an application INSERT", async () => {
  const {writes}=database({registrations:[{id:"registration",event_id:rookie.id,registration_name:"신청자"}]});
  await assert.rejects(()=>service.submitEventApplication({eventId:master.id,registrationName:"신청자"}),/이미 신청/);
  assert.equal(writes.length,0);
});

test("a malformed cross-season intake fails closed instead of querying another league", async () => {
  database({malformed:true});
  await assert.rejects(()=>service.findSubmissionRegistration(master.id,"신청자"),/소유권/);
});
